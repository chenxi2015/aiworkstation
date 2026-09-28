import type { SyncLogItem } from "../types";

/**
 * Append sync log item to chrome.storage
 */
export async function appendSyncLog(log: SyncLogItem): Promise<void> {
	try {
		const result = await chrome.storage.local.get("sync_logs");
		const logs: SyncLogItem[] = Array.isArray(result.sync_logs)
			? result.sync_logs
			: [];
		logs.unshift(log);
		// Keep last 100 logs
		await chrome.storage.local.set({ sync_logs: logs.slice(0, 100) });

		// Broadcast log update to sidepanel if open
		chrome.runtime
			.sendMessage({
				type: "SYNC_LOG_UPDATE",
				payload: log,
			})
			.catch(() => {
				// Sidepanel might not be open, safe to ignore
			});
	} catch (err) {
		console.error("Failed to append sync log:", err);
	}
}
