import type {
	AIClassificationResult,
	BookmarkTDKItem,
	Folder,
	WorkbenchItem,
} from "../../components/workbench/types";
import {
	addBookmarks,
	addLinkToFolder,
	applyAIClassification,
	deleteFolder,
	deleteItem,
	getWorkbenchData,
	moveFolder,
	moveFolderToCategory,
	moveItem,
	reorderFolders,
	saveFolder,
} from "../../server/functions/workbench";

/**
 * Fetch all folders and unclassified items from SQLite via createServerFn
 */
export async function fetchAllFromDb(): Promise<{
	folders: Folder[];
	unclassified: WorkbenchItem[];
}> {
	try {
		return await getWorkbenchData();
	} catch (err) {
		console.warn(
			"[workbenchClient] createServerFn getWorkbenchData error:",
			err,
		);
		return { folders: [], unclassified: [] };
	}
}

/**
 * Save new or edited folder to SQLite via createServerFn
 */
export async function saveFolderToDb(folderData: {
	id?: number;
	name: string;
	category: string;
	desc: string;
	color?: string;
	parentId?: number | null;
}): Promise<Folder[]> {
	return await saveFolder({ data: folderData });
}

/**
 * Delete folder from SQLite via createServerFn
 */
export async function deleteFolderFromDb(id: number): Promise<Folder[]> {
	return await deleteFolder({ data: id });
}

/**
 * Move a folder into another folder (or to top-level) via createServerFn
 */
export async function moveFolderInDb(
	folderId: number,
	targetParentId: number | null,
): Promise<Folder[]> {
	const res = await moveFolder({ data: { folderId, targetParentId } });
	return res.folders;
}

/**
 * Persist sibling folder order via createServerFn
 */
export async function reorderFoldersInDb(
	orderedIds: number[],
): Promise<Folder[]> {
	const res = await reorderFolders({ data: { orderedIds } });
	return res.folders;
}

/**
 * Move folder to a navigation category via createServerFn
 */
export async function moveFolderToCategoryInDb(
	folderId: number,
	targetCategory: string,
): Promise<Folder[]> {
	const res = await moveFolderToCategory({
		data: { folderId, targetCategory },
	});
	return res.folders;
}

/**
 * Apply AI Classification results into SQLite database via createServerFn
 */
export async function applyAIClassificationToDb(
	results: AIClassificationResult[],
): Promise<{ folders: Folder[]; unclassified: WorkbenchItem[] }> {
	return await applyAIClassification({ data: results });
}

/**
 * Move item between folders in SQLite via createServerFn
 */
export async function moveItemInDb(
	itemId: string | number,
	sourceFolderId: number | null,
	targetFolderId: number | null,
): Promise<{ folders: Folder[]; unclassified: WorkbenchItem[] }> {
	return await moveItem({
		data: {
			itemId,
			sourceFolderId,
			targetFolderId,
		},
	});
}

/**
 * Delete item in SQLite via createServerFn
 */
export async function deleteItemInDb(
	itemId: string | number,
	folderId: number | null,
): Promise<{ folders: Folder[]; unclassified: WorkbenchItem[] }> {
	return await deleteItem({
		data: {
			itemId,
			folderId,
		},
	});
}

/**
 * Add new items directly to SQLite via createServerFn
 */
export async function addBookmarksToDb(
	bookmarks: BookmarkTDKItem[],
): Promise<{ count: number; unclassified: WorkbenchItem[] }> {
	return await addBookmarks({ data: bookmarks });
}

/**
 * Manually add a single link into a folder
 */
export async function addLinkToFolderInDb(params: {
	folderId: number;
	url: string;
	title?: string;
	description?: string;
}): Promise<Folder[]> {
	return await addLinkToFolder({ data: params });
}
