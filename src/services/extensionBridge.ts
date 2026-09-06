import type { BookmarkTDKItem } from "../components/workbench/types";

/**
 * Service for communicating with AI Collector Chrome Extension
 */

const PING_TIMEOUT_MS = 250;
const OPEN_TIMEOUT_MS = 600;
const FETCH_TIMEOUT_MS = 3500;

export class ExtensionBridgeService {
	/**
	 * Check whether AI Collector extension is installed in the current browser
	 */
	static async checkInstalled(): Promise<boolean> {
		if (typeof window === "undefined") return false;

		// 1. Fast path: check DOM dataset attribute stamped by content script
		if (document.documentElement.dataset.aicollectorInstalled === "true") {
			return true;
		}

		// 2. Async path: ping extension content script with timeout
		return new Promise<boolean>((resolve) => {
			let settled = false;

			const timer = window.setTimeout(() => {
				if (!settled) {
					settled = true;
					window.removeEventListener("message", onMessage);
					resolve(document.documentElement.dataset.aicollectorInstalled === "true");
				}
			}, PING_TIMEOUT_MS);

			const onMessage = (event: MessageEvent) => {
				if (event.source !== window) return;
				if (event.data?.source === "aic-extension" && event.data?.type === "PONG") {
					if (!settled) {
						settled = true;
						clearTimeout(timer);
						window.removeEventListener("message", onMessage);
						document.documentElement.dataset.aicollectorInstalled = "true";
						resolve(true);
					}
				}
			};

			window.addEventListener("message", onMessage);
			window.postMessage({ source: "aic-web-page", type: "PING" }, "*");
		});
	}

	/**
	 * Request AI Collector extension to open its side panel on the bookmarks tab
	 */
	static async openBookmarksPanel(): Promise<{ success: boolean; error?: string }> {
		if (typeof window === "undefined") return { success: false, error: "Window undefined" };

		return new Promise((resolve) => {
			let settled = false;

			const timer = window.setTimeout(() => {
				if (!settled) {
					settled = true;
					window.removeEventListener("message", onMessage);
					resolve({ success: true });
				}
			}, OPEN_TIMEOUT_MS);

			const onMessage = (event: MessageEvent) => {
				if (event.source !== window) return;
				if (
					event.data?.source === "aic-extension" &&
					event.data?.type === "OPEN_BOOKMARKS_PANEL_RESULT"
				) {
					if (!settled) {
						settled = true;
						clearTimeout(timer);
						window.removeEventListener("message", onMessage);
						resolve({
							success: Boolean(event.data.success),
							error: event.data.error,
						});
					}
				}
			};

			window.addEventListener("message", onMessage);
			window.postMessage({ source: "aic-web-page", type: "OPEN_BOOKMARKS_PANEL" }, "*");
		});
	}

	/**
	 * Fetch all bookmarks from Chrome via AI Collector extension
	 */
	static async fetchChromeBookmarks(): Promise<{
		success: boolean;
		bookmarks: BookmarkTDKItem[];
		error?: string;
	}> {
		if (typeof window === "undefined") {
			return { success: false, bookmarks: [], error: "Window undefined" };
		}

		return new Promise((resolve) => {
			let settled = false;

			const timer = window.setTimeout(() => {
				if (!settled) {
					settled = true;
					window.removeEventListener("message", onMessage);
					resolve({
						success: false,
						bookmarks: [],
						error: "读取 Chrome 书签响应超时",
					});
				}
			}, FETCH_TIMEOUT_MS);

			const onMessage = (event: MessageEvent) => {
				if (event.source !== window) return;
				if (
					event.data?.source === "aic-extension" &&
					event.data?.type === "FETCH_BOOKMARKS_RESULT"
				) {
					if (!settled) {
						settled = true;
						clearTimeout(timer);
						window.removeEventListener("message", onMessage);
						resolve({
							success: Boolean(event.data.success),
							bookmarks: Array.isArray(event.data.bookmarks)
								? event.data.bookmarks
								: [],
							error: event.data.error,
						});
					}
				}
			};

			window.addEventListener("message", onMessage);
			window.postMessage({ source: "aic-web-page", type: "FETCH_BOOKMARKS" }, "*");
		});
	}
}
