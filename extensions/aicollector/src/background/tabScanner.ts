import { registerHlsStream, registerVideoFileStream } from "./streamRegistry";
import {
	handleGoogleVideoResponse,
	isGoogleVideoPlaybackUrl,
} from "./youtubeTracks";

/**
 * Actively probe all frames in the tab for video streams via scripting API.
 * Covers HLS playlists, progressive video files and YouTube DASH tracks.
 */
export async function scanTabAllFrames(tabId: number): Promise<void> {
	if (!chrome.scripting?.executeScript) return;
	try {
		const injectionResults = await chrome.scripting.executeScript({
			target: { tabId, allFrames: true },
			func: () => {
				const found: string[] = [];
				const isStreamUrl = (u: string) =>
					/\.m3u8(\?|#|$)/i.test(u) ||
					/\.(mp4|webm|mov|m4v|flv)(\?|#|$)/i.test(u) ||
					/(^|\.)googlevideo\.com$/i.test(new URL(u).hostname);
				// 1. Check video and source DOM elements
				try {
					const els = document.querySelectorAll("video, source");
					els.forEach((el) => {
						const src =
							(el as HTMLVideoElement | HTMLSourceElement).src ||
							(el as any).currentSrc;
						if (src && isStreamUrl(src)) found.push(src);
					});
				} catch {}
				// 2. Check performance timing resource entries
				try {
					const entries = performance.getEntriesByType("resource") || [];
					for (let i = 0; i < entries.length; i++) {
						const name = entries[i]?.name;
						if (name && isStreamUrl(name)) found.push(name);
					}
				} catch {}
				return found;
			},
		});

		if (Array.isArray(injectionResults)) {
			const tab = await chrome.tabs.get(tabId).catch(() => null);
			for (const item of injectionResults) {
				if (Array.isArray(item.result)) {
					for (const url of item.result) {
						if (typeof url !== "string") continue;
						if (isGoogleVideoPlaybackUrl(url)) {
							await handleGoogleVideoResponse(tabId, {
								url,
								pageUrl: tab?.url || "",
							});
						} else if (/\.(mp4|webm|mov|m4v|flv)(\?|#|$)/i.test(url)) {
							await registerVideoFileStream(tabId, {
								url,
								via: "rescan-scripting",
								pageUrl: tab?.url || "",
								pageTitle: tab?.title || "",
							});
						} else {
							await registerHlsStream(tabId, {
								url,
								via: "rescan-scripting",
								pageUrl: tab?.url || "",
								pageTitle: tab?.title || "",
							});
						}
					}
				}
			}
		}
	} catch (err) {
		console.warn("[AI Collector] scanTabAllFrames failed:", err);
	}
}
