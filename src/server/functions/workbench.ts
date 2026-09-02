import { createServerFn } from "@tanstack/react-start";
import type {
	AIClassificationResult,
	BookmarkTDKItem,
	Folder,
	WorkbenchItem,
} from "../../components/workbench/types";
import { workbenchDb } from "../db/sqlite.ts";

/**
 * Server Function: Fetch all folders and unclassified items from SQLite
 */
export const getWorkbenchData = createServerFn({ method: "GET" }).handler(
	async (): Promise<{ folders: Folder[]; unclassified: WorkbenchItem[] }> => {
		const folders = workbenchDb.getAllFolders();
		const unclassified = workbenchDb.getUnclassifiedItems();
		return { folders, unclassified };
	},
);

/**
 * Server Function: Create or update a folder in SQLite
 */
export const saveFolder = createServerFn({ method: "POST" })
	.validator(
		(data: { id?: number; name: string; category: string; desc: string }) =>
			data,
	)
	.handler(async ({ data }): Promise<Folder[]> => {
		if (data.id) {
			workbenchDb.updateFolder(data.id, data.name, data.category, data.desc);
		} else {
			workbenchDb.createFolder(data.name, data.category, data.desc);
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
