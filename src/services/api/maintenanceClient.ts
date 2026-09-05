import type { Folder, WorkbenchItem } from "../../components/workbench/types";
import { getAvailableModels } from "../../server/functions/models";
import {
	clearAllData,
	deleteItemsBatch,
	getDeadLinkScanStatusFn,
	getLastDeadLinkScanFn,
	startDeadLinkScanFn,
} from "../../server/functions/workbench";
import type { DeadLinkScanJob } from "../../server/maintenance";

export type { DeadLinkScanJob };

/**
 * Clear ALL workbench data in SQLite (creates a timestamped backup first).
 * AI settings in localStorage are preserved.
 */
export async function clearAllDataInDb(): Promise<{
	backupPath: string | null;
}> {
	return await clearAllData();
}

/**
 * Start an async dead-link scan job (server-side background task)
 */
export async function startDeadLinkScan(): Promise<{
	jobId: string;
	total: number;
}> {
	return await startDeadLinkScanFn();
}

/**
 * Poll progress/results of a dead-link scan job
 */
export async function getDeadLinkScanStatus(
	jobId: string,
): Promise<DeadLinkScanJob | null> {
	return await getDeadLinkScanStatusFn({ data: jobId });
}

/**
 * Read the last completed dead-link scan snapshot (persisted on disk)
 */
export async function getLastDeadLinkScan(): Promise<DeadLinkScanJob | null> {
	return await getLastDeadLinkScanFn();
}

/**
 * Batch delete bookmarks globally (dead link cleanup)
 */
export async function deleteItemsBatchInDb(ids: string[]): Promise<{
	deleted: number;
	folders: Folder[];
	unclassified: WorkbenchItem[];
}> {
	return await deleteItemsBatch({ data: ids });
}

/**
 * Fetch available models from OpenAI-compatible / DeepSeek / Ollama endpoint
 */
export async function fetchAvailableModels(params: {
	baseUrl: string;
	apiKey?: string;
}): Promise<string[]> {
	const res = await getAvailableModels({ data: params });
	if (!res.success) {
		throw new Error(res.error || "获取模型列表失败");
	}
	return res.models;
}
