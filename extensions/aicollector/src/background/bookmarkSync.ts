import {
	DEFAULT_WORKBENCH_URL,
	WORKBENCH_STORAGE_KEY,
} from "../services/workbench";
import type { PageTDK, SyncLogItem } from "../types";
import { appendSyncLog } from "./syncLog";

async function getWorkbenchBaseUrl(): Promise<string> {
	try {
		const result = await chrome.storage.local.get(WORKBENCH_STORAGE_KEY);
		const custom = result[WORKBENCH_STORAGE_KEY];
		if (typeof custom === "string" && custom.trim()) {
			return custom.trim().replace(/\/+$/, "");
		}
	} catch {
		// Fall back to default
	}
	return DEFAULT_WORKBENCH_URL;
}

/**
 * Push collected bookmark / page to AI Workstation backend
 */
async function pushToWorkbench(data: {
	title: string;
	url: string;
	tdk: PageTDK;
	source: "bookmark_created" | "manual_grab";
}): Promise<boolean> {
	try {
		const baseUrl = await getWorkbenchBaseUrl();
		const response = await fetch(`${baseUrl}/api/collect`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				url: data.url,
				title: data.title,
				type: "link",
				siteMeta: data.tdk,
				source: data.source,
				createdAt: Date.now(),
			}),
		});
		return response.ok;
	} catch (error) {
		console.warn(
			"AI Workstation backend unreachable, item queued locally:",
			error,
		);
		return false;
	}
}

/**
 * Extract TDK from matching tab or fallback to basic URL metadata
 */
async function resolveTabTDK(url: string, title?: string): Promise<PageTDK> {
	try {
		const tabs = await chrome.tabs.query({ url });
		const tab = tabs[0];
		if (tab && typeof tab.id === "number") {
			const response = await chrome.tabs.sendMessage(tab.id, {
				type: "GET_PAGE_TDK",
			});
			if (response?.tdk) {
				return response.tdk;
			}
		}
	} catch {
		// Tab message may fail if content script not loaded
	}

	// Fallback metadata
	return {
		title: title || url,
		description: "",
		keywords: "",
		url,
		siteName: new URL(url).hostname,
	};
}

/**
 * Monitor native Chrome bookmark creation / removal and sync to the workbench
 */
export function registerBookmarkSyncListeners(): void {
	chrome.bookmarks.onCreated.addListener(
		async (id: string, bookmark: chrome.bookmarks.BookmarkTreeNode) => {
			if (!bookmark.url) return; // Skip folder creation

			console.log(
				"[AI Collector] New bookmark created:",
				bookmark.title,
				bookmark.url,
			);

			const tdk = await resolveTabTDK(bookmark.url, bookmark.title);
			const synced = await pushToWorkbench({
				title: bookmark.title || tdk.title,
				url: bookmark.url,
				tdk,
				source: "bookmark_created",
			});

			const log: SyncLogItem = {
				id: `log_${Date.now()}_${id}`,
				type: "bookmark_created",
				title: bookmark.title || tdk.title,
				url: bookmark.url,
				status: synced ? "synced" : "queued",
				timestamp: Date.now(),
				details: synced
					? "已成功同步至 AI 工作台"
					: "工作台离线，已在本地暂存 (等待自动同步)",
			};

			await appendSyncLog(log);
		},
	);

	chrome.bookmarks.onRemoved.addListener(
		async (
			id: string,
			removeInfo: {
				parentId: string;
				index: number;
				node?: chrome.bookmarks.BookmarkTreeNode;
			},
		) => {
			console.log("[AI Collector] Bookmark removed:", id, removeInfo);

			const log: SyncLogItem = {
				id: `log_${Date.now()}_${id}`,
				type: "bookmark_removed",
				title: removeInfo.node?.title || "已删除书签",
				url: removeInfo.node?.url || "",
				status: "synced",
				timestamp: Date.now(),
				details: `从文件夹 (ID: ${removeInfo.parentId}) 中移除`,
			};

			await appendSyncLog(log);
		},
	);
}
