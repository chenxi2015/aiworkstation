import { BrowserWindow, type Session } from "electron";
import {
	CLICK_PUBLISH_BUTTON_SCRIPT,
	DISMISS_POPOVERS_AND_SWITCH_TAB_SCRIPT,
	INJECT_HELPER_BANNER_SCRIPT,
	INSPECT_PAGE_STATE_SCRIPT,
	WAIT_FOR_FILE_INPUT_SCRIPT,
	WAIT_FOR_PREVIEWS_SCRIPT,
	buildFillFormScript,
} from "./browserScripts.js";
import {
	RedbookImagePreparer,
	redbookImagePreparer,
} from "./imagePreparer.js";
import type { RedbookPublishPayload, RedbookPublishResult } from "./types.js";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const humanDelay = (min = 600, max = 1400) => {
	const ms = Math.floor(Math.random() * (max - min + 1)) + min;
	return sleep(ms);
};

const PUBLISH_URL =
	"https://creator.xiaohongshu.com/publish/publish?source=official";

/**
 * Handles image processing and Chromium browser automation for Xiaohongshu note publishing.
 * Orchestrates navigation, CDP file upload injection, form filling, and submission verification.
 */
export class RedbookNotePublisher {
	private imagePreparer: RedbookImagePreparer;

	constructor(imagePreparer = redbookImagePreparer) {
		this.imagePreparer = imagePreparer;
	}

	/**
	 * Prepare local concrete image files on disk.
	 * Delegated to RedbookImagePreparer for backward compatibility.
	 */
	public async prepareLocalImages(images: string[]): Promise<string[]> {
		return this.imagePreparer.prepareLocalImages(images);
	}

	/**
	 * Execute Xiaohongshu note publishing via Chromium window and CDP.
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

			// Check if redirected to login
			const currentUrl = publishWin.webContents.getURL();
			if (currentUrl.includes("/login")) {
				throw new Error("小红书创作者登录状态已失效，请重新扫码登录");
			}

			// 4. Switch to 'Image-Text Note' (上传图文) Tab with popover dismissal
			const tabSwitched = await publishWin.webContents.executeJavaScript(
				DISMISS_POPOVERS_AND_SWITCH_TAB_SCRIPT,
			);
			if (!tabSwitched) {
				console.warn(
					"[RedbookNotePublisher] Could not explicitly find '上传图文' tab, proceeding to look for file input",
				);
			}

			await humanDelay(1200, 1800);

			// 5. Wait for the image file input to be present in DOM (polling up to 15s)
			const inputReady = await publishWin.webContents.executeJavaScript(
				WAIT_FOR_FILE_INPUT_SCRIPT,
			);
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
					await publishWin.webContents.debugger.sendCommand(
						"DOM.querySelector",
						{
							nodeId: doc.root.nodeId,
							selector:
								'input[data-aiworkstation-upload="true"], .upload-input, input[type="file"]',
						},
					);

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
			await publishWin.webContents.executeJavaScript(
				WAIT_FOR_PREVIEWS_SCRIPT,
			);
			await humanDelay(1000, 1600);

			// 7. Fill Title & Description Content
			const safeTitle = payload.title.slice(0, 20).trim();
			const safeContent = payload.content.slice(0, 1000).trim();
			const topicsList = (payload.topics || [])
				.map((t) => t.replace(/^#/, "").trim())
				.filter(Boolean);

			const fillResult = await publishWin.webContents.executeJavaScript(
				buildFillFormScript(safeTitle, safeContent, topicsList),
			);
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

	/**
	 * Automates clicking the publish button and verifying redirection or captcha states.
	 */
	private async handleAutoPublish(
		publishWin: BrowserWindow,
	): Promise<RedbookPublishResult> {
		// 1. Poll for publish button to become enabled and click
		const clickResult = await publishWin.webContents.executeJavaScript(
			CLICK_PUBLISH_BUTTON_SCRIPT,
		);
		console.log(
			"[RedbookNotePublisher] Auto publish trigger result:",
			clickResult,
		);

		if (!clickResult.clicked) {
			publishWin.show();
			publishWin.focus();
			return {
				success: true,
				mode: "fill_only",
				message:
					"内容已自动填充完毕，检测到发布按钮尚未解锁，请在打开的窗口中核对并点击【发布】",
			};
		}

		// 2. Poll to verify actual publish success, detect captcha or errors (up to 15s)
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
				console.log(
					"[RedbookNotePublisher] Successfully published, redirected to:",
					currentUrl,
				);
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
			const pageState = await publishWin.webContents.executeJavaScript(
				INSPECT_PAGE_STATE_SCRIPT,
			);

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
					message:
						"已点击发布，检测到安全滑块验证，请在打开的窗口中手动完成验证",
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
			message:
				"已自动填充并尝试点击发布，页面尚未完成跳转，请在打开的窗口中核对确认",
		};
	}

	/**
	 * Pre-fills content and displays user instructions banner in fill-only review mode.
	 */
	private async handleFillOnlyMode(
		publishWin: BrowserWindow,
	): Promise<RedbookPublishResult> {
		await publishWin.webContents.executeJavaScript(
			INJECT_HELPER_BANNER_SCRIPT,
		);
		publishWin.show();
		publishWin.focus();

		return {
			success: true,
			mode: "fill_only",
			message: "已自动填充小红书图文内容，请在弹出的窗口中确认并点击发布",
		};
	}
}
