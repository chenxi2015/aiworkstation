import fs from "node:fs";
import path from "node:path";
import { BrowserWindow, type Session } from "electron";
import { resolveDataDir } from "../../config.js";
import { CHROME_USER_AGENT } from "./sessionManager.js";
import type { RedbookPublishPayload, RedbookPublishResult } from "./types.js";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const humanDelay = (min = 600, max = 1400) => {
	const ms = Math.floor(Math.random() * (max - min + 1)) + min;
	return sleep(ms);
};

const PUBLISH_URL = "https://creator.xiaohongshu.com/publish/publish?source=official";

/**
 * Handles image processing and Chromium browser automation for Xiaohongshu note publishing.
 */
export class RedbookNotePublisher {
	/**
	 * Ensure all image inputs are saved as concrete local files on disk
	 * so Chrome DevTools Protocol can inject them directly into file inputs.
	 */
	public async prepareLocalImages(images: string[]): Promise<string[]> {
		const cacheDir = path.join(resolveDataDir(), "publish-cache", "redbook");
		if (!fs.existsSync(cacheDir)) {
			fs.mkdirSync(cacheDir, { recursive: true });
		}

		const resolvedPaths: string[] = [];

		for (let i = 0; i < images.length; i++) {
			const img = images[i];
			if (!img) continue;

			// 1. Existing local file
			if (
				!img.startsWith("data:") &&
				!img.startsWith("http://") &&
				!img.startsWith("https://") &&
				fs.existsSync(img)
			) {
				resolvedPaths.push(img);
				continue;
			}

			// 2. Data URL (Base64)
			if (img.startsWith("data:image/")) {
				try {
					const matches = img.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
					if (matches) {
						const ext = matches[1] === "jpeg" ? "jpg" : matches[1];
						const buffer = Buffer.from(matches[2], "base64");
						const filePath = path.join(
							cacheDir,
							`note_img_${Date.now()}_${i}.${ext}`,
						);
						fs.writeFileSync(filePath, buffer);
						resolvedPaths.push(filePath);
						continue;
					}
				} catch (err) {
					console.warn(
						`[RedbookNotePublisher] Failed to decode base64 image ${i}:`,
						err,
					);
				}
			}

			// 3. Remote or local HTTP URL
			if (img.startsWith("http://") || img.startsWith("https://")) {
				try {
					const response = await fetch(img);
					if (response.ok) {
						const arrayBuffer = await response.arrayBuffer();
						const buffer = Buffer.from(arrayBuffer);
						const ext = img.endsWith(".png") ? "png" : "jpg";
						const filePath = path.join(
							cacheDir,
							`note_img_${Date.now()}_${i}.${ext}`,
						);
						fs.writeFileSync(filePath, buffer);
						resolvedPaths.push(filePath);
					}
				} catch (err) {
					console.warn(
						`[RedbookNotePublisher] Failed to download image ${i}:`,
						err,
					);
				}
			}
		}

		return resolvedPaths;
	}

	/**
	 * Execute Xiaohongshu note publishing via Chromium window and CDP
	 */
	public async publish(
		payload: RedbookPublishPayload,
		session: Session,
	): Promise<RedbookPublishResult> {
		const mode = payload.mode || "fill_only";

		// 1. Prepare local image files
		const localImages = await this.prepareLocalImages(payload.images || []);
		if (localImages.length === 0) {
			throw new Error(
				"发布失败：小红书图文笔记至少需要提供 1 张图片（封面或切片图）",
			);
		}

		// 2. Create worker window
		const publishWin = new BrowserWindow({
			width: 1200,
			height: 850,
			show: mode === "fill_only", // Show window if user intends to review
			title: "小红书图文发布中心",
			autoHideMenuBar: true,
			webPreferences: {
				session,
				backgroundThrottling: false,
			},
		});

		try {
			// 3. Navigate to creator publish page
			await publishWin.loadURL(PUBLISH_URL);
			await humanDelay(1500, 2000);

			// Check if kicked back to login
			const currentUrl = publishWin.webContents.getURL();
			if (currentUrl.includes("/login")) {
				throw new Error("小红书创作者登录状态已失效，请重新扫码登录");
			}

			// 4. Switch to 'Image-Text Note' (上传图文) Tab with popover dismissal
			// Xiaohongshu often shows popover guides (div.d-popover, .feature-guide__btn) that block tabs
			const tabSwitched = await publishWin.webContents.executeJavaScript(`
				(async () => {
					const dismissPopovers = () => {
						try {
							const guideBtn = document.querySelector('.feature-guide__btn');
							if (guideBtn && typeof guideBtn.click === 'function') guideBtn.click();
							document.querySelectorAll('div.d-popover').forEach(el => el.remove());
						} catch (_) {}
					};

					dismissPopovers();

					// Poll for the publish tab to be ready (up to 12s)
					const startTime = Date.now();
					while (Date.now() - startTime < 12000) {
						dismissPopovers();

						// Look for '上传图文' tab element
						const tabs = Array.from(document.querySelectorAll('.creator-tab, div[role="tab"], .tab, span, div'));
						const tab = tabs.find(el => {
							const txt = (el.textContent || '').trim();
							return txt === '上传图文' && el.offsetWidth > 0;
						});

						if (tab && typeof tab.click === 'function') {
							tab.click();
							return true;
						}
						await new Promise(r => setTimeout(r, 400));
					}
					return false;
				})()
			`);

			if (!tabSwitched) {
				console.warn("[RedbookNotePublisher] Could not explicitly find '上传图文' tab, proceeding to look for file input");
			}

			await humanDelay(1200, 1800);

			// 5. Wait for the image file input to be present in DOM (polling up to 15s)
			const inputReady = await publishWin.webContents.executeJavaScript(`
				(async () => {
					const startTime = Date.now();
					while (Date.now() - startTime < 15000) {
						// Dismiss any lingering guide covers
						try {
							const guideBtn = document.querySelector('.feature-guide__btn');
							if (guideBtn && typeof guideBtn.click === 'function') guideBtn.click();
							document.querySelectorAll('div.d-popover').forEach(el => el.remove());
						} catch (_) {}

						// Look for image upload input
						let input = document.querySelector('.upload-input');
						if (!input) {
							const inputs = Array.from(document.querySelectorAll('input[type="file"]'));
							input = inputs.find(i => {
								const accept = (i.getAttribute('accept') || '').toLowerCase();
								return accept.includes('image') || accept.includes('jpg') || accept.includes('png');
							}) || inputs[0] || null;
						}

						if (input) {
							// Tag the input element for CDP querySelector
							input.setAttribute('data-aiworkstation-upload', 'true');
							return true;
						}

						await new Promise(r => setTimeout(r, 400));
					}
					return false;
				})()
			`);

			if (!inputReady) {
				throw new Error("未能定位到小红书图片上传控件，请稍后重试");
			}

			// 6. Inject local images into file upload input via Chrome DevTools Protocol (CDP)
			publishWin.webContents.debugger.attach("1.3");
			try {
				await publishWin.webContents.debugger.sendCommand("DOM.enable");
				const doc: any = await publishWin.webContents.debugger.sendCommand(
					"DOM.getDocument",
					{ depth: -1 },
				);
				const fileInput: any =
					await publishWin.webContents.debugger.sendCommand("DOM.querySelector", {
						nodeId: doc.root.nodeId,
						selector: 'input[data-aiworkstation-upload="true"], .upload-input, input[type="file"]',
					});

				if (!fileInput || !fileInput.nodeId) {
					throw new Error("未能定位到小红书图片上传控件节点，请稍后重试");
				}

				await publishWin.webContents.debugger.sendCommand(
					"DOM.setFileInputFiles",
					{
						nodeId: fileInput.nodeId,
						files: localImages,
					},
				);
			} finally {
				if (publishWin.webContents.debugger.isAttached()) {
					publishWin.webContents.debugger.detach();
				}
			}

			// Wait for Xiaohongshu to upload and render image thumbnails (up to 20s)
			await publishWin.webContents.executeJavaScript(`
				(async () => {
					const startTime = Date.now();
					while (Date.now() - startTime < 20000) {
						const previews = document.querySelectorAll('.img-preview-area, .preview, .pr, .image-item, .drag-item');
						if (previews.length > 0) {
							return true;
						}
						await new Promise(r => setTimeout(r, 500));
					}
					return false;
				})()
			`);

			await humanDelay(1000, 1600);

			// 7. Fill Title & Description Content (supports Tiptap, ProseMirror, Quill, and Standard Inputs)
			const safeTitle = payload.title.slice(0, 20).trim();
			const safeContent = payload.content.slice(0, 1000).trim();
			const topicsList = (payload.topics || [])
				.map((t) => t.replace(/^#/, "").trim())
				.filter(Boolean);

			const fillResult = await publishWin.webContents.executeJavaScript(`
				(async () => {
					// 1. Robust Polling and Setting for Title Input
					const titleSelectors = [
						'div.title-container input',
						'div.title-input input',
						'div.d-input input',
						'input.d-input__inner',
						'input.c-input_inner',
						'input[placeholder*="填写标题"]',
						'input[placeholder*="标题"]',
						'input[maxlength="20"]',
						'input[type="text"]',
						'input:not([type])'
					];

					let titleInput = null;
					const titleStart = Date.now();
					while (Date.now() - titleStart < 8000) {
						for (const sel of titleSelectors) {
							const el = document.querySelector(sel);
							if (el && el.type !== 'file' && el.offsetWidth > 0) {
								titleInput = el;
								break;
							}
						}
						if (titleInput) break;
						await new Promise(r => setTimeout(r, 300));
					}

					let titleSuccess = false;
					if (titleInput) {
						titleInput.focus();
						titleInput.select();

						// Method A: Native execCommand (simulates typing, natively triggering Vue 3 / React synthetic events)
						document.execCommand('selectAll', false, undefined);
						document.execCommand('insertText', false, ${JSON.stringify(safeTitle)});

						// Method B: Prototype setter fallback if execCommand was intercepted
						if (titleInput.value !== ${JSON.stringify(safeTitle)}) {
							const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
							if (nativeSetter && nativeSetter.set) {
								nativeSetter.set.call(titleInput, ${JSON.stringify(safeTitle)});
							} else {
								titleInput.value = ${JSON.stringify(safeTitle)};
							}
						}

						// Method C: Dispatch full suite of events for framework reactivity
						try {
							titleInput.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: ${JSON.stringify(safeTitle)} }));
						} catch (_) {}
						titleInput.dispatchEvent(new Event('input', { bubbles: true }));
						titleInput.dispatchEvent(new Event('change', { bubbles: true }));
						titleInput.blur();

						titleSuccess = (titleInput.value === ${JSON.stringify(safeTitle)});
					}

					// 2. Set Description Content & Topics across various Xiaohongshu editor layouts
					const editorSelectors = [
						'div[role="textbox"][contenteditable="true"]',
						'div.tiptap[contenteditable="true"]',
						'div.ql-editor',
						'#post-textarea',
						'div[contenteditable="true"]'
					];

					let editor = null;
					const editorStart = Date.now();
					while (Date.now() - editorStart < 8000) {
						for (const sel of editorSelectors) {
							const el = document.querySelector(sel);
							if (el && el.offsetWidth > 0) {
								editor = el;
								break;
							}
						}
						if (editor) break;
						await new Promise(r => setTimeout(r, 300));
					}

					let editorSuccess = false;
					if (editor) {
						editor.focus();
						document.execCommand('selectAll', false, undefined);
						document.execCommand('insertText', false, ${JSON.stringify(safeContent)});

						const topics = ${JSON.stringify(topicsList)};
						if (topics.length > 0) {
							const topicsStr = '\\n\\n' + topics.map(t => '#' + t).join(' ') + ' ';
							document.execCommand('insertText', false, topicsStr);
						}
						editor.dispatchEvent(new Event('input', { bubbles: true }));
						editor.dispatchEvent(new Event('change', { bubbles: true }));
						editorSuccess = true;
					}

					return {
						titleFound: Boolean(titleInput),
						titleSuccess,
						editorFound: Boolean(editor),
						editorSuccess
					};
				})()
			`);

			console.log("[RedbookNotePublisher] Form fill status:", fillResult);

			await humanDelay(1000, 1500);

			// 8. Handle final publishing mode
			if (mode === "auto") {
				return await this.handleAutoPublish(publishWin);
			}

			return this.handleFillOnlyMode(publishWin);
		} catch (err) {
			if (!publishWin.isDestroyed()) {
				publishWin.close();
			}
			throw err;
		}
	}

	private async handleAutoPublish(
		publishWin: BrowserWindow,
	): Promise<RedbookPublishResult> {
		// 1. Poll for publish button to become enabled and clickable (up to 15s)
		// Xiaohongshu performs asynchronous input validation before removing the submit-disabled attribute
		const clickResult = await publishWin.webContents.executeJavaScript(`
			(async () => {
				const isElementRendered = (el) => {
					if (!el) return false;
					const style = window.getComputedStyle(el);
					return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
				};

				const startTime = Date.now();
				while (Date.now() - startTime < 15000) {
					// Method 1: Web Component <xhs-publish-btn>
					const widgets = Array.from(document.querySelectorAll('xhs-publish-btn'));
					for (const w of widgets) {
						if (!isElementRendered(w)) continue;
						const isPublish = w.getAttribute('is-publish');
						if (isPublish === 'false') continue;
						const disabled = w.getAttribute('submit-disabled');
						if (disabled === 'true') continue;

						w.scrollIntoView({ behavior: 'instant', block: 'center' });
						try {
							w.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
							w.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
							w.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
							w.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
						} catch (_) {}
						w.click();

						const innerBtn = w.shadowRoot ? w.shadowRoot.querySelector('button') : w.querySelector('button');
						if (innerBtn) {
							innerBtn.click();
						}
						return { clicked: true, type: 'web-component' };
					}

					// Method 2: Standard Red Button (.publish-page-publish-btn button.bg-red, button.bg-red)
					const redBtns = Array.from(document.querySelectorAll('.publish-page-publish-btn button.bg-red, button.bg-red, .publishBtn'));
					for (const btn of redBtns) {
						if (!isElementRendered(btn)) continue;
						if (btn.disabled || btn.getAttribute('aria-disabled') === 'true' || btn.classList.contains('disabled')) continue;

						btn.scrollIntoView({ behavior: 'instant', block: 'center' });
						btn.click();
						return { clicked: true, type: 'red-button' };
					}

					// Method 3: Button with '发布' text
					const buttons = Array.from(document.querySelectorAll('button'));
					const pubBtn = buttons.find(b => {
						const txt = (b.textContent || '').trim();
						return (txt === '发布' || txt === '发布笔记') && !b.disabled && isElementRendered(b);
					});

					if (pubBtn) {
						pubBtn.scrollIntoView({ behavior: 'instant', block: 'center' });
						pubBtn.click();
						return { clicked: true, type: 'text-button' };
					}

					await new Promise(r => setTimeout(r, 500));
				}

				return { clicked: false, error: '等待发布按钮就绪超时' };
			})()
		`);

		console.log("[RedbookNotePublisher] Auto publish trigger result:", clickResult);

		if (!clickResult.clicked) {
			publishWin.show();
			publishWin.focus();
			return {
				success: true,
				mode: "fill_only",
				message: "内容已自动填充完毕，检测到发布按钮尚未解锁，请在打开的窗口中核对并点击【发布】",
			};
		}

		// 2. Poll to verify actual publish success, detect captcha or errors (up to 15s)
		// Xiaohongshu will redirect away from /publish/publish upon successful publication
		const verifyStart = Date.now();
		while (Date.now() - verifyStart < 15000) {
			await humanDelay(600, 1000);

			if (publishWin.isDestroyed()) {
				return {
					success: true,
					mode: "auto",
					message: "小红书图文笔记已全自动提交成功！",
				};
			}

			// Check A: URL redirected away from /publish/publish (primary success indicator)
			const currentUrl = publishWin.webContents.getURL();
			if (!currentUrl.includes("/publish/publish")) {
				console.log("[RedbookNotePublisher] Successfully published, redirected to:", currentUrl);
				if (!publishWin.isDestroyed()) {
					publishWin.close();
				}
				return {
					success: true,
					mode: "auto",
					message: "小红书图文笔记已全自动发布成功！",
				};
			}

			// Check B: In-page status inspection (success toast, slider captcha, or form error)
			const pageState = await publishWin.webContents.executeJavaScript(`
				(() => {
					// 1. Slider verification
					const slider = document.querySelector('.geetest_radar_tip, .yidun_slider, .verify-bar, .captcha-modal');
					if (slider && slider.offsetParent !== null) {
						return { status: 'captcha' };
					}

					// 2. Toast success
					const toast = Array.from(document.querySelectorAll('.d-toast, .toast, .d-message, .alert')).find(el => {
						const txt = (el.textContent || '').trim();
						return txt.includes('发布成功') || txt.includes('提交成功') || txt.includes('已发布');
					});
					if (toast) {
						return { status: 'success' };
					}

					// 3. Form error message
					const errorElem = document.querySelector('.length-error, .d-input_error, .form-item-error');
					if (errorElem && errorElem.offsetWidth > 0) {
						return { status: 'error', message: (errorElem.textContent || '').trim() };
					}

					return { status: 'pending' };
				})()
			`);

			if (pageState.status === "success") {
				if (!publishWin.isDestroyed()) {
					publishWin.close();
				}
				return {
					success: true,
					mode: "auto",
					message: "小红书图文笔记已全自动发布成功！",
				};
			}

			if (pageState.status === "captcha") {
				publishWin.show();
				publishWin.focus();
				return {
					success: true,
					mode: "auto",
					message: "已点击发布，检测到安全滑块验证，请在打开的窗口中手动完成验证",
				};
			}

			if (pageState.status === "error" && pageState.message) {
				publishWin.show();
				publishWin.focus();
				return {
					success: false,
					mode: "auto",
					message: `发布拦截：${pageState.message}，请在打开的窗口中调整`,
				};
			}
		}

		// Fallback: If after 15s page is still at /publish/publish, show window for user review
		if (!publishWin.isDestroyed()) {
			publishWin.show();
			publishWin.focus();
		}
		return {
			success: true,
			mode: "fill_only",
			message: "已自动填充并尝试点击发布，页面尚未完成跳转，请在打开的窗口中核对确认",
		};
	}

	private async handleFillOnlyMode(
		publishWin: BrowserWindow,
	): Promise<RedbookPublishResult> {
		await publishWin.webContents.executeJavaScript(`
			(() => {
				const existing = document.getElementById('aiworkstation-helper-banner');
				if (existing) existing.remove();

				const banner = document.createElement('div');
				banner.id = 'aiworkstation-helper-banner';
				banner.style.cssText = 'position:fixed;top:16px;left:50%;transform:translateX(-50%);background:#18181b;color:#fff;padding:10px 22px;border-radius:24px;z-index:9999999;font-size:13px;font-family:-apple-system,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,0.25);border:1px solid rgba(255,255,255,0.18);display:flex;align-items:center;gap:8px;pointer-events:none;';
				banner.innerHTML = '<span style="color:#ef4444;font-size:14px">⚡</span> <span><strong>AI Workstation</strong> 已为您填充标题、正文与配图，请核对无误后点击下方【发布】</span>';
				document.body.appendChild(banner);
			})()
		`);

		publishWin.show();
		publishWin.focus();

		return {
			success: true,
			mode: "fill_only",
			message: "已自动填充小红书图文内容，请在弹出的窗口中确认并点击发布",
		};
	}
}

