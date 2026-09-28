import {
	isBelowMinVideoSize,
	isKnownVideoCdn,
	isVideoFileUrl,
	parseVideoResponseHeaders,
	registerHlsStream,
	registerVideoFileStream,
} from "./streamRegistry";
import {
	handleGoogleVideoResponse,
	isGoogleVideoPlaybackUrl,
	parseGoogleVideoHeaders,
} from "./youtubeTracks";

/**
 * Passive network sniffer for video streams across all frames and workers
 */
export function registerWebRequestSniffer(): void {
	try {
		if (chrome.webRequest?.onBeforeRequest) {
			chrome.webRequest.onBeforeRequest.addListener(
				(details) => {
					const { tabId, url } = details;
					if (
						typeof tabId === "number" &&
						tabId >= 0 &&
						typeof url === "string"
					) {
						if (/\.m3u8(\?|#|$)/i.test(url)) {
							registerHlsStream(tabId, {
								url,
								via: "network-webrequest",
								pageUrl: details.initiator || "",
							});
						} else if (
							isVideoFileUrl(url) &&
							(details.type === "media" || isKnownVideoCdn(url))
						) {
							// Known video CDNs serve progressive files over MSE/range
							// fetches; other sites are restricted to <video> element loads
							// so MSE fragments don't flood the list
							registerVideoFileStream(tabId, {
								url,
								via: "network-webrequest",
								pageUrl: details.initiator || "",
							});
						}
					}
					return undefined;
				},
				{ urls: ["<all_urls>"] },
			);
		}

		// Content-Type based sniffing: catches progressive video URLs without a
		// file extension (e.g. Douyin playback endpoints on CDN domains).
		if (chrome.webRequest?.onHeadersReceived) {
			chrome.webRequest.onHeadersReceived.addListener(
				(details) => {
					try {
						const { tabId, url } = details;
						if (
							typeof tabId !== "number" ||
							tabId < 0 ||
							typeof url !== "string"
						) {
							return undefined;
						}

						// YouTube: googlevideo DASH tracks (video + audio) are
						// classified, paired and registered by a dedicated router
						if (isGoogleVideoPlaybackUrl(url)) {
							const meta = parseGoogleVideoHeaders(
								details.responseHeaders,
								details.statusCode,
							);
							if (meta) {
								handleGoogleVideoResponse(tabId, {
									url,
									pageUrl: details.initiator || "",
									contentType: meta.mimeType,
									contentLength: meta.contentLength,
									sizeIsTotal: meta.sizeIsTotal,
								}).catch(() => {});
							}
							return undefined;
						}

						if (/\.m3u8(\?|#|$)/i.test(url)) return undefined;
						if (details.type !== "media" && !isKnownVideoCdn(url))
							return undefined;

						const meta = parseVideoResponseHeaders(
							details.responseHeaders,
							details.statusCode,
						);
						if (!meta) return undefined;
						// Skip tiny clips: ad preloads, poster animations, preview
						// loops. Partial 206 chunk sizes are lower bounds, not the
						// real total, so they never trigger the filter
						if (
							meta.sizeIsTotal !== false &&
							isBelowMinVideoSize(meta.contentLength)
						) {
							return undefined;
						}

						registerVideoFileStream(tabId, {
							url,
							via: "network-headers",
							pageUrl: details.initiator || "",
							contentLength: meta.contentLength,
							sizeIsTotal: meta.sizeIsTotal,
							mimeType: meta.mimeType,
						});
					} catch {
						// Header parsing is best-effort
					}
					return undefined;
				},
				{ urls: ["<all_urls>"] },
				["responseHeaders"],
			);
		}
	} catch (err) {
		console.warn(
			"[AI Collector] Failed to initialize webRequest sniffer:",
			err,
		);
	}
}
