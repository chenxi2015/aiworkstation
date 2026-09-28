import { smartFetchImageAsDataUrl } from "./imageFetch";
import {
	BILIBILI_VIDEO_URL_RE,
	clearBilibiliTab,
	resolveBilibiliVideo,
} from "./bilibiliResolver";
import {
	isVideoFileUrl,
	registerHlsStream,
	registerVideoFileStream,
} from "./streamRegistry";
import { clearTabStreams, readHlsStreams } from "./streamStore";
import { rateLimitedCaptureVisibleTab } from "./tabCapture";
import { scanTabAllFrames } from "./tabScanner";
import { canonicalYoutubeVideoUrl, resolveYoutubePage } from "./youtubePage";
import {
	handleGoogleVideoResponse,
	isGoogleVideoPlaybackUrl,
} from "./youtubeTracks";

/**
 * Central runtime message router for commands from the sidepanel and
 * content scripts (bookmark browsing, stream sniffing, tab capture,
 * image proxy).
 */
export function registerMessageHandlers(): void {
	chrome.runtime.onMessage.addListener(
		(
			message: any,
			sender: chrome.runtime.MessageSender,
			sendResponse: (response?: any) => void,
		) => {
			if (message.type === "OPEN_SIDEPANEL_BOOKMARKS") {
				(async () => {
					try {
						let windowId = sender.tab?.windowId;
						if (typeof windowId !== "number") {
							const currentWin = await chrome.windows.getLastFocused();
							windowId = currentWin.id;
						}
						if (
							chrome.sidePanel &&
							typeof chrome.sidePanel.open === "function" &&
							typeof windowId === "number"
						) {
							await chrome.sidePanel.open({ windowId });
							setTimeout(() => {
								chrome.runtime
									.sendMessage({ type: "SWITCH_TAB", payload: "bookmarks" })
									.catch(() => {});
							}, 120);
							sendResponse({ success: true });
							return;
						}
						sendResponse({
							success: false,
							error: "SidePanel API not supported",
						});
					} catch (err: any) {
						console.warn("[AI Collector] Failed to open sidePanel:", err);
						sendResponse({
							success: false,
							error: String(err?.message || err),
						});
					}
				})();
				return true; // Keep async response channel open
			}

			if (message.type === "FETCH_CHROME_BOOKMARKS") {
				(async () => {
					try {
						const tree = await chrome.bookmarks.getTree();
						const result: Array<{
							id: string;
							title: string;
							url: string;
							parentTitle: string;
							folderPath: string;
							dateAdded?: number;
						}> = [];

						const traverse = (
							nodes: chrome.bookmarks.BookmarkTreeNode[],
							pathSegments: string[] = [],
						) => {
							for (const node of nodes) {
								if (
									node.url &&
									(node.url.startsWith("http://") ||
										node.url.startsWith("https://"))
								) {
									result.push({
										id: node.id,
										title: node.title || node.url,
										url: node.url,
										parentTitle: pathSegments[pathSegments.length - 1] || "",
										folderPath: pathSegments.join(" / "),
										dateAdded: node.dateAdded,
									});
								}
								if (node.children && node.children.length > 0) {
									const nextSegments = node.title
										? [...pathSegments, node.title]
										: pathSegments;
									traverse(node.children, nextSegments);
								}
							}
						};

						traverse(tree);
						const sorted = result.sort(
							(a, b) => (b.dateAdded || 0) - (a.dateAdded || 0),
						);
						sendResponse({ success: true, bookmarks: sorted });
					} catch (err: any) {
						console.warn(
							"[AI Collector] Failed to fetch chrome bookmarks:",
							err,
						);
						sendResponse({
							success: false,
							error: String(err?.message || err),
							bookmarks: [],
						});
					}
				})();
				return true; // Keep async response channel open
			}

			if (message.type === "HLS_STREAM_DETECTED" && message.payload?.url) {
				const tabId = sender.tab?.id;
				if (typeof tabId !== "number") return;

				const url: string = message.payload.url;
				const pageUrl = message.payload.pageUrl || sender.tab?.url || "";
				const pageTitle = message.payload.pageTitle || sender.tab?.title || "";

				if (
					message.payload.kind === "dash-track" ||
					isGoogleVideoPlaybackUrl(url)
				) {
					// YouTube DASH track: classify and pair in the dedicated router
					handleGoogleVideoResponse(tabId, {
						url,
						pageUrl,
					}).catch(() => {});
				} else if (
					message.payload.kind === "file" ||
					(!/\.m3u8(\?|#|$)/i.test(url) && isVideoFileUrl(url))
				) {
					registerVideoFileStream(tabId, {
						url,
						via: message.payload.via,
						pageUrl,
						pageTitle,
					});
				} else if (/\.m3u8(\?|#|$)/i.test(url)) {
					registerHlsStream(tabId, {
						url,
						via: message.payload.via,
						pageUrl,
						pageTitle,
					});
				}
				return;
			}

			if (
				message.type === "GET_HLS_STREAMS" &&
				typeof message.tabId === "number"
			) {
				readHlsStreams(message.tabId)
					.then((streams) => sendResponse({ success: true, streams }))
					.catch(() => sendResponse({ success: false, streams: [] }));
				return true; // Keep async response channel open
			}

			if (
				message.type === "CLEAR_HLS_STREAMS" &&
				typeof message.tabId === "number"
			) {
				clearTabStreams(message.tabId)
					.then(() => sendResponse({ success: true }))
					.catch(() => sendResponse({ success: false }));
				return true; // Keep async response channel open
			}

			if (
				message.type === "RESCAN_ALL_FRAMES" &&
				typeof message.tabId === "number"
			) {
				scanTabAllFrames(message.tabId)
					.then(() => sendResponse({ success: true }))
					.catch(() => sendResponse({ success: false }));
				// Re-run the API-based resolvers too: their streams are not
				// visible to frame scanning, and a failed first attempt should
				// be recoverable from the rescan button
				chrome.tabs
					.get(message.tabId)
					.then((tab) => {
						const url = tab?.url;
						if (!url) return;
						if (BILIBILI_VIDEO_URL_RE.test(url)) {
							clearBilibiliTab(message.tabId);
							resolveBilibiliVideo(message.tabId, url).catch(() => {});
						} else if (canonicalYoutubeVideoUrl(url)) {
							resolveYoutubePage(message.tabId, url).catch(() => {});
						}
					})
					.catch(() => {});
				return true; // Keep async response channel open
			}

			if (message.type === "CAPTURE_VISIBLE_TAB") {
				const windowId =
					sender.tab?.windowId ?? chrome.windows?.WINDOW_ID_CURRENT;
				rateLimitedCaptureVisibleTab(windowId, { format: "png" })
					.then((dataUrl) => {
						sendResponse({ success: true, dataUrl });
					})
					.catch((err) => {
						console.warn("[AI Collector] Capture visible tab error:", err);
						sendResponse({
							success: false,
							error: String(err?.message || err),
						});
					});
				return true; // Keep async response channel open
			}

			if (message.type === "FETCH_IMAGE_DATA" && message.url) {
				const { url, pageUrl } = message;

				smartFetchImageAsDataUrl(url, pageUrl)
					.then((dataUrl) => {
						sendResponse({ success: true, dataUrl });
					})
					.catch((err) => {
						console.warn(
							"[AI Collector] Background smart image fetch failed:",
							err?.message || err,
						);
						sendResponse({
							success: false,
							error: String(err?.message || err),
						});
					});

				return true; // Keep async response channel open
			}
		},
	);
}
