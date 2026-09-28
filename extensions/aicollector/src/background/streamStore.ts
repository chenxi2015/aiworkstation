import type { SniffedStream } from "../types";

/**
 * Per-tab sniffed HLS streams storage.
 * Prefers chrome.storage.session (survives service worker restarts) with an
 * in-memory fallback for environments where it is unavailable.
 */
const HLS_STREAMS_KEY_PREFIX = "hls_streams_";
export const MAX_STREAMS_PER_TAB = 30;

const memoryStreams = new Map<number, SniffedStream[]>();

export async function readHlsStreams(tabId: number): Promise<SniffedStream[]> {
	try {
		const result = await chrome.storage.session.get(
			HLS_STREAMS_KEY_PREFIX + tabId,
		);
		const list = result[HLS_STREAMS_KEY_PREFIX + tabId];
		if (Array.isArray(list)) return list as SniffedStream[];
	} catch {
		// storage.session unavailable, fall back to memory
	}
	return memoryStreams.get(tabId) || [];
}

export async function writeHlsStreams(
	tabId: number,
	streams: SniffedStream[],
): Promise<void> {
	try {
		await chrome.storage.session.set({
			[HLS_STREAMS_KEY_PREFIX + tabId]: streams,
		});
		memoryStreams.delete(tabId);
		return;
	} catch {
		// storage.session unavailable, fall back to memory
	}
	memoryStreams.set(tabId, streams);
}

export function broadcastHlsStreams(
	tabId: number,
	streams: SniffedStream[],
): void {
	chrome.runtime
		.sendMessage({
			type: "HLS_STREAMS_UPDATE",
			payload: { tabId, streams },
		})
		.catch(() => {
			// Sidepanel might not be open, safe to ignore
		});
}

/** Reset a tab's stream list and notify listeners (tab navigated / manual clear) */
export async function clearTabStreams(tabId: number): Promise<void> {
	memoryStreams.delete(tabId);
	try {
		await chrome.storage.session.remove(HLS_STREAMS_KEY_PREFIX + tabId);
	} catch {
		// storage.session unavailable
	}
	broadcastHlsStreams(tabId, []);
}

/** Drop a tab's stream list silently (tab closed, no listeners left to notify) */
export function dropTabStreams(tabId: number): void {
	memoryStreams.delete(tabId);
	chrome.storage.session.remove(HLS_STREAMS_KEY_PREFIX + tabId).catch(() => {});
}
