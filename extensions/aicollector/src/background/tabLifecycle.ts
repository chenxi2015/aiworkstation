import {
	BILIBILI_VIDEO_URL_RE,
	clearBilibiliTab,
	resolveBilibiliVideo,
} from "./bilibiliResolver";
import { broadcastHlsStreams, dropTabStreams } from "./streamStore";

/**
 * Sniffed HLS stream housekeeping: reset a tab's stream list when it
 * navigates to a new document, and drop it entirely when the tab closes.
 * Also resolves Bilibili DASH streams on video page navigations.
 */
export function registerTabLifecycleListeners(): void {
	chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
		if (changeInfo.status === "loading" && changeInfo.url) {
			dropTabStreams(tabId);
			broadcastHlsStreams(tabId, []);
		}
		// Resolve Bilibili DASH streams for video pages (also fires on the
		// site's SPA pushState navigations via changeInfo.url)
		const navUrl = changeInfo.url;
		if (navUrl && BILIBILI_VIDEO_URL_RE.test(navUrl)) {
			resolveBilibiliVideo(tabId, navUrl).catch(() => {});
		} else if (changeInfo.status === "complete") {
			chrome.tabs
				.get(tabId)
				.then((tab) => {
					if (tab?.url && BILIBILI_VIDEO_URL_RE.test(tab.url)) {
						resolveBilibiliVideo(tabId, tab.url).catch(() => {});
					}
				})
				.catch(() => {});
		}
	});

	chrome.tabs.onRemoved.addListener((tabId) => {
		dropTabStreams(tabId);
		clearBilibiliTab(tabId);
	});
}
