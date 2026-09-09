import path from "node:path";
import { createServerFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";
import type {
	AIClassificationResult,
	BookmarkTDKItem,
	Folder,
	WorkbenchItem,
	WorkbenchSettings,
} from "../../components/workbench/types";
import { DB_DIR, DB_PATH } from "../db/connection.ts";
import { workbenchDb } from "../db/sqlite.ts";
import {
	type BackupFileInfo,
	backupDatabase,
	type DeadLinkScanJob,
	deleteBackup,
	getBackupsList,
	getDeadLinkScanStatus,
	getLastDeadLinkScan,
	removeIdsFromLastScan,
	restoreDatabase,
	startDeadLinkScan,
} from "../maintenance.ts";

/**
 * Server Function: Fetch all folders and unclassified items from SQLite
 */
export const getWorkbenchData = createServerFn({ method: "GET" }).handler(
	async (): Promise<{
		folders: Folder[];
		unclassified: WorkbenchItem[];
		activeCategory?: string;
	}> => {
		try {
			const folders = workbenchDb.getAllFolders();
			const unclassified = workbenchDb.getUnclassifiedItems();
			let activeCategory: string | undefined;
			try {
				const cookieCat = getCookie("aiworkstation_active_category");
				if (cookieCat) {
					activeCategory = decodeURIComponent(cookieCat);
				}
			} catch {
				// Ignore if outside server runtime context
			}
			return { folders, unclassified, activeCategory };
		} catch (err) {
			console.warn("[getWorkbenchData] Database access error:", err);
			return { folders: [], unclassified: [] };
		}
	},
);

/**
 * Server Function: Create or update a folder in SQLite
 */
export const saveFolder = createServerFn({ method: "POST" })
	.validator(
		(data: {
			id?: number;
			name: string;
			category: string;
			desc: string;
			color?: string;
			parentId?: number | null;
		}) => data,
	)
	.handler(async ({ data }): Promise<Folder[]> => {
		let folderId: number;
		if (data.id) {
			workbenchDb.updateFolder(
				data.id,
				data.name,
				data.category,
				data.desc,
				data.color,
			);
			folderId = data.id;
		} else {
			folderId = workbenchDb.createFolder(
				data.name,
				data.category,
				data.desc,
				data.color,
			).id;
		}
		if (data.parentId !== undefined) {
			const target = data.parentId ?? null;
			if (workbenchDb.getFolderParentId(folderId) !== target) {
				workbenchDb.moveFolder(folderId, target);
			}
		}
		return workbenchDb.getAllFolders();
	});

/**
 * Server Function: Delete a folder from SQLite
 */
export const deleteFolder = createServerFn({ method: "POST" })
	.validator((id: number) => id)
	.handler(async ({ data: id }): Promise<Folder[]> => {
		workbenchDb.deleteFolder(id);
		return workbenchDb.getAllFolders();
	});

/**
 * Server Function: Apply DeepSeek AI classification results to SQLite
 */
export const applyAIClassification = createServerFn({ method: "POST" })
	.validator((results: AIClassificationResult[]) => results)
	.handler(
		async ({
			data: results,
		}): Promise<{ folders: Folder[]; unclassified: WorkbenchItem[] }> => {
			workbenchDb.applyAIClassification(results);
			const folders = workbenchDb.getAllFolders();
			const unclassified = workbenchDb.getUnclassifiedItems();
			return { folders, unclassified };
		},
	);

/**
 * Server Function: Move item between folders in SQLite
 */
export const moveItem = createServerFn({ method: "POST" })
	.validator(
		(data: {
			itemId: string | number;
			sourceFolderId: number | null;
			targetFolderId: number | null;
		}) => data,
	)
	.handler(
		async ({
			data,
		}): Promise<{ folders: Folder[]; unclassified: WorkbenchItem[] }> => {
			workbenchDb.moveItem(
				data.itemId.toString(),
				data.sourceFolderId,
				data.targetFolderId,
			);
			const folders = workbenchDb.getAllFolders();
			const unclassified = workbenchDb.getUnclassifiedItems();
			return { folders, unclassified };
		},
	);

/**
 * Server Function: Delete item in SQLite
 */
export const deleteItem = createServerFn({ method: "POST" })
	.validator(
		(data: { itemId: string | number; folderId: number | null }) => data,
	)
	.handler(
		async ({
			data,
		}): Promise<{ folders: Folder[]; unclassified: WorkbenchItem[] }> => {
			workbenchDb.deleteItem(data.itemId.toString(), data.folderId);
			const folders = workbenchDb.getAllFolders();
			const unclassified = workbenchDb.getUnclassifiedItems();
			return { folders, unclassified };
		},
	);

/**
 * Server Function: Move a folder into another folder (or to top-level).
 * Cycle-safe: the repo rejects moves into itself or its descendants.
 */
export const moveFolder = createServerFn({ method: "POST" })
	.validator(
		(data: { folderId: number; targetParentId: number | null }) => data,
	)
	.handler(async ({ data }): Promise<{ folders: Folder[] }> => {
		workbenchDb.moveFolder(data.folderId, data.targetParentId);
		return { folders: workbenchDb.getAllFolders() };
	});

/**
 * Server Function: Persist sibling folder order after drag-sorting
 */
export const reorderFolders = createServerFn({ method: "POST" })
	.validator((data: { orderedIds: number[] }) => data)
	.handler(async ({ data }): Promise<{ folders: Folder[] }> => {
		workbenchDb.reorderFolders(data.orderedIds);
		return { folders: workbenchDb.getAllFolders() };
	});

/**
 * Server Function: Move a folder to the top level of a navigation category
 */
export const moveFolderToCategory = createServerFn({ method: "POST" })
	.validator((data: { folderId: number; targetCategory: string }) => data)
	.handler(async ({ data }): Promise<{ folders: Folder[] }> => {
		workbenchDb.moveFolderToCategory(data.folderId, data.targetCategory);
		return { folders: workbenchDb.getAllFolders() };
	});

/**
 * Server Function: Batch rename a category across all folders
 */
export const renameCategory = createServerFn({ method: "POST" })
	.validator((data: { oldCategory: string; newCategory: string }) => data)
	.handler(async ({ data }): Promise<{ folders: Folder[]; count: number }> => {
		const count = workbenchDb.renameCategory(
			data.oldCategory,
			data.newCategory,
		);
		return { folders: workbenchDb.getAllFolders(), count };
	});

/**
 * Server Function: Batch add bookmarks to SQLite
 */
export const addBookmarks = createServerFn({ method: "POST" })
	.validator((items: BookmarkTDKItem[]) => items)
	.handler(
		async ({
			data: items,
		}): Promise<{ count: number; unclassified: WorkbenchItem[] }> => {
			const count = workbenchDb.insertBookmarksBatch(items);
			const unclassified = workbenchDb.getUnclassifiedItems();
			return { count, unclassified };
		},
	);

/**
 * Server Function: Manually add a single link into a folder
 */
export const addLinkToFolder = createServerFn({ method: "POST" })
	.validator(
		(data: {
			folderId: number;
			url: string;
			title?: string;
			description?: string;
		}) => data,
	)
	.handler(async ({ data }): Promise<Folder[]> => {
		workbenchDb.insertLinkIntoFolder(data.folderId, {
			url: data.url,
			title: data.title?.trim() || data.url,
			description: data.description?.trim() || "",
		});
		return workbenchDb.getAllFolders();
	});

/**
 * Server Function: Clear ALL workbench data (folders, bookmarks, relations).
 * A timestamped SQLite backup is created before wiping. Settings live in
 * localStorage and are intentionally preserved.
 */
export const clearAllData = createServerFn({ method: "POST" }).handler(
	async (): Promise<{ backupPath: string | null }> => {
		const backupPath = backupDatabase();
		workbenchDb.clearAll();
		return { backupPath };
	},
);

/**
 * Server Function: Clear all unclassified bookmarks from SQLite
 */
export const clearUnclassifiedBookmarks = createServerFn({
	method: "POST",
}).handler(
	async (): Promise<{ deleted: number; unclassified: WorkbenchItem[] }> => {
		const deleted = workbenchDb.clearUnclassified();
		const unclassified = workbenchDb.getUnclassifiedItems();
		return { deleted, unclassified };
	},
);

/**
 * Server Function: Start an async dead-link scan job over all bookmarks.
 * Returns immediately; poll getDeadLinkScanStatus for progress and results.
 */
export const startDeadLinkScanFn = createServerFn({ method: "POST" }).handler(
	async (): Promise<{ jobId: string; total: number }> => {
		return startDeadLinkScan();
	},
);

/**
 * Server Function: Poll progress/results of a dead-link scan job
 */
export const getDeadLinkScanStatusFn = createServerFn({ method: "GET" })
	.validator((jobId: string) => jobId)
	.handler(async ({ data: jobId }): Promise<DeadLinkScanJob | null> => {
		return getDeadLinkScanStatus(jobId);
	});

/**
 * Server Function: Read the last completed dead-link scan snapshot (persisted on disk)
 */
export const getLastDeadLinkScanFn = createServerFn({ method: "GET" }).handler(
	async (): Promise<DeadLinkScanJob | null> => {
		return getLastDeadLinkScan();
	},
);

/**
 * Server Function: Batch delete bookmarks globally (used by dead link cleanup)
 */
export const deleteItemsBatch = createServerFn({ method: "POST" })
	.validator((ids: string[]) => ids)
	.handler(
		async ({
			data: ids,
		}): Promise<{
			deleted: number;
			folders: Folder[];
			unclassified: WorkbenchItem[];
		}> => {
			const deleted = workbenchDb.deleteItems(ids);
			removeIdsFromLastScan(ids);
			const folders = workbenchDb.getAllFolders();
			const unclassified = workbenchDb.getUnclassifiedItems();
			return { deleted, folders, unclassified };
		},
	);

/**
 * Server Function: Get saved settings from SQLite
 */
export const getWorkbenchSettings = createServerFn({ method: "GET" }).handler(
	async (): Promise<WorkbenchSettings | null> => {
		try {
			const raw = workbenchDb.getSetting("workbench_settings");
			if (!raw) return null;
			return JSON.parse(raw);
		} catch (err) {
			console.warn("[getWorkbenchSettings] Database access error:", err);
			return null;
		}
	},
);

/**
 * Server Function: Persist settings into SQLite
 */
export const saveWorkbenchSettings = createServerFn({ method: "POST" })
	.validator((settings: WorkbenchSettings) => settings)
	.handler(async ({ data: settings }): Promise<{ success: boolean }> => {
		workbenchDb.setSetting("workbench_settings", JSON.stringify(settings));
		return { success: true };
	});

/**
 * Server Function: Expose local storage locations (SQLite db dir, backups dir)
 * so the settings UI can display them and offer "open in file manager".
 */
export const getStorageInfoFn = createServerFn({ method: "GET" }).handler(
	async (): Promise<{
		dbDir: string;
		dbPath: string;
		backupDir: string;
	}> => {
		return {
			dbDir: DB_DIR,
			dbPath: DB_PATH,
			backupDir: path.join(DB_DIR, "backups"),
		};
	},
);

/**
 * Server Function: Get list of all database backups
 */
export const getBackupsListFn = createServerFn({ method: "GET" }).handler(
	async (): Promise<BackupFileInfo[]> => {
		return getBackupsList();
	},
);

/**
 * Server Function: Manually create a new database backup
 */
export const createBackupFn = createServerFn({ method: "POST" }).handler(
	async (): Promise<{
		backupPath: string | null;
		backups: BackupFileInfo[];
	}> => {
		const backupPath = backupDatabase();
		const backups = getBackupsList();
		return { backupPath, backups };
	},
);

/**
 * Server Function: Restore database from a backup
 */
export const restoreBackupFn = createServerFn({ method: "POST" })
	.validator((filename: string) => filename)
	.handler(
		async ({
			data: filename,
		}): Promise<{
			success: boolean;
			currentBackupPath: string | null;
			folders: Folder[];
			unclassified: WorkbenchItem[];
		}> => {
			const res = restoreDatabase(filename);
			const folders = workbenchDb.getAllFolders();
			const unclassified = workbenchDb.getUnclassifiedItems();
			return {
				success: res.success,
				currentBackupPath: res.currentBackupPath,
				folders,
				unclassified,
			};
		},
	);

/**
 * Server Function: Delete a backup file
 */
export const deleteBackupFn = createServerFn({ method: "POST" })
	.validator((filename: string) => filename)
	.handler(async ({ data: filename }): Promise<{ success: boolean }> => {
		return deleteBackup(filename);
	});
