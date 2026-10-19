/**
 * Client-side browser automation scripts injected into Xiaohongshu creator pages.
 */

/**
 * Script to dismiss floating feature popovers and switch to the '上传图文' (Image-Text Note) tab.
 */
export const DISMISS_POPOVERS_AND_SWITCH_TAB_SCRIPT = `
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
`;

/**
 * Script to wait for image upload file input and tag it for CDP selection.
 */
export const WAIT_FOR_FILE_INPUT_SCRIPT = `
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
`;

/**
 * Script to wait for image thumbnail previews to appear after upload.
 */
export const WAIT_FOR_PREVIEWS_SCRIPT = `
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
`;

/**
 * Builds script to fill note title and content across various Xiaohongshu editor layouts.
 */
export function buildFillFormScript(
	safeTitle: string,
	safeContent: string,
	topicsList: string[],
): string {
	return `
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

		// Method A: Native execCommand
		document.execCommand('selectAll', false, undefined);
		document.execCommand('insertText', false, ${JSON.stringify(safeTitle)});

		// Method B: Prototype setter fallback
		if (titleInput.value !== ${JSON.stringify(safeTitle)}) {
			const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
			if (nativeSetter && nativeSetter.set) {
				nativeSetter.set.call(titleInput, ${JSON.stringify(safeTitle)});
			} else {
				titleInput.value = ${JSON.stringify(safeTitle)};
			}
		}

		// Method C: Dispatch reactivity events
		try {
			titleInput.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: ${JSON.stringify(safeTitle)} }));
		} catch (_) {}
		titleInput.dispatchEvent(new Event('input', { bubbles: true }));
		titleInput.dispatchEvent(new Event('change', { bubbles: true }));
		titleInput.blur();

		titleSuccess = (titleInput.value === ${JSON.stringify(safeTitle)});
	}

	// 2. Set Description Content & Topics across editor layouts
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
`;
}

/**
 * Script to trigger the publication submit button.
 */
export const CLICK_PUBLISH_BUTTON_SCRIPT = `
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
`;

/**
 * Script to inspect page submission state (captcha, toast, errors).
 */
export const INSPECT_PAGE_STATE_SCRIPT = `
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
`;

/**
 * Script to display helpful floating banner when pre-filling content.
 */
export const INJECT_HELPER_BANNER_SCRIPT = `
(() => {
	const existing = document.getElementById('aiworkstation-helper-banner');
	if (existing) existing.remove();

	const banner = document.createElement('div');
	banner.id = 'aiworkstation-helper-banner';
	banner.style.cssText = 'position:fixed;top:16px;left:50%;transform:translateX(-50%);background:#18181b;color:#fff;padding:10px 22px;border-radius:24px;z-index:9999999;font-size:13px;font-family:-apple-system,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,0.25);border:1px solid rgba(255,255,255,0.18);display:flex;align-items:center;gap:8px;pointer-events:none;';
	banner.innerHTML = '<span style="color:#ef4444;font-size:14px">⚡</span> <span><strong>AI Workstation</strong> 已为您填充标题、正文与配图，请核对无误后点击下方【发布】</span>';
	document.body.appendChild(banner);
})()
`;

