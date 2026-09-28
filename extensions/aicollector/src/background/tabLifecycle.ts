import {
	BILIBILI_VIDEO_URL_RE,
	clearBilibiliTab,
	resolveBilibiliVideo,
} from "./bilibiliResolver";
import { broadcastHlsStreams, dropTabStreams } from "./streamStore";
import { canonicalYoutubeVideoUrl, resolveYoutubePage } from "./youtubePage";
import { clearYoutubeTab } from "./youtubeTracks";

/**
 * Sniffed HLS stream housekeeping: reset a tab's stream list when it
 * navigates to a new document, and drop it entirely when the tab closes.
 * Also resolves Bilibili DASH streams on video page navigations.
 */
export function registerTabLifecycleListeners(): void {
	chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
		// Any navigation to a new document invalidates this tab's sniffed
		// streams and cached API resolutions (signed URLs expire across
		// loads). Same-URL reloads carry no changeInfo.url, so keying on
		// status alone is what makes a manual page refresh re-detectable.
		if (changeInfo.status === "loading") {
			dropTabStreams(tabId);
			clearYoutubeTab(tabId);
			// Clear the resolution cache so refreshing re-resolves the video
			// (the first attempt may have failed, and signed URLs expire)
			clearBilibiliTab(tabId);
			broadcastHlsStreams(tabId, []);
		}
		// Resolve Bilibili DASH streams for video pages (also fires on the
		// site's SPA pushState navigations via changeInfo.url)
		const navUrl = changeInfo.url;
		if (navUrl && BILIBILI_VIDEO_URL_RE.test(navUrl)) {
			resolveBilibiliVideo(tabId, navUrl).catch(() => {});
		} else if (navUrl && canonicalYoutubeVideoUrl(navUrl)) {
			// Also fires on YouTube's SPA pushState navigations
			resolveYoutubePage(tabId, navUrl).catch(() => {});
		} else if (changeInfo.status === "complete") {
			chrome.tabs
				.get(tabId)
				.then((tab) => {
					if (tab?.url && BILIBILI_VIDEO_URL_RE.test(tab.url)) {
						resolveBilibiliVideo(tabId, tab.url).catch(() => {});
					} else if (tab?.url && canonicalYoutubeVideoUrl(tab.url)) {
						resolveYoutubePage(tabId, tab.url).catch(() => {});
					}
				})
				.catch(() => {});
		}
	});

	chrome.tabs.onRemoved.addListener((tabId) => {
		dropTabStreams(tabId);
		clearBilibiliTab(tabId);
		clearYoutubeTab(tabId);
	});
}
