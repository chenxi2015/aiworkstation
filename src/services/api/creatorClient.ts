import type {
	Draft,
	DraftPlatform,
	DraftStatus,
	DraftVariant,
	DraftWithMaterial,
	Material,
	MaterialFolder,
} from "../../components/creator/types";
import type { WorkbenchItem } from "../../components/workbench/types";
import {
	adoptDraft,
	createManualMaterial,
	createMaterialFolder,
	deleteMaterialFolder,
	exportDraft,
	generateDrafts,
	importBookmarkAsMaterial,
	importFileAsMaterial,
	listCreatorMaterials,
	listDrafts,
	listMaterialFolders,
	searchBookmarksForPicker,
	updateDraftContent,
	updateDraftStatus,
	updateMaterial,
	updateMaterialFolder,
} from "../../server/functions/creator";

/** 素材文件夹 */
export async function fetchMaterialFolders(): Promise<MaterialFolder[]> {
	try {
		return (await listMaterialFolders()) ?? [];
	} catch (err) {
		console.warn("[creatorClient] listMaterialFolders error:", err);
		return [];
	}
}

export async function createMaterialFolderRpc(params: {
	name: string;
	description?: string;
}): Promise<MaterialFolder> {
	return await createMaterialFolder({ data: params });
}

export async function updateMaterialFolderRpc(params: {
	id: number;
	name: string;
	description?: string;
}): Promise<MaterialFolder> {
	return await updateMaterialFolder({ data: params });
}

export async function deleteMaterialFolderRpc(params: {
	id: number;
}): Promise<void> {
	await deleteMaterialFolder({ data: params });
}

/** 素材库 */
export async function fetchMaterials(): Promise<Material[]> {
	try {
		return (await listCreatorMaterials()) ?? [];
	} catch (err) {
		console.warn("[creatorClient] listCreatorMaterials error:", err);
		return [];
	}
}

export async function createManualMaterialRpc(params: {
	title: string;
	content: string;
	note?: string;
	folderId?: number | null;
}): Promise<Material> {
	return await createManualMaterial({ data: params });
}

export async function searchBookmarksRpc(
	query: string,
): Promise<WorkbenchItem[]> {
	try {
		return (await searchBookmarksForPicker({ data: { query } })) ?? [];
	} catch (err) {
		console.warn("[creatorClient] searchBookmarksForPicker error:", err);
		return [];
	}
}

export async function importBookmarkMaterialRpc(params: {
	bookmarkId: string;
	note?: string;
	folderId?: number | null;
}): Promise<Material> {
	return await importBookmarkAsMaterial({ data: params });
}

export async function importFileMaterialRpc(params: {
	sourcePath: string;
	title?: string;
	note?: string;
	folderId?: number | null;
}): Promise<Material> {
	return await importFileAsMaterial({ data: params });
}

export async function updateMaterialRpc(params: {
	id: number;
	title?: string;
	content?: string;
	note?: string | null;
	status?: "active" | "archived";
	folderId?: number | null;
}): Promise<Material> {
	return await updateMaterial({ data: params });
}

/** AI 二创 */
export async function generateDraftsRpc(params: {
	materialId: number;
	platforms: DraftPlatform[];
}): Promise<{ variants: DraftVariant[] }> {
	return await generateDrafts({ data: params });
}

export async function adoptDraftRpc(params: {
	materialId: number;
	platform: DraftPlatform;
	content: string;
}): Promise<Draft> {
	return await adoptDraft({ data: params });
}

/** 草稿箱 */
export async function fetchDrafts(): Promise<DraftWithMaterial[]> {
	try {
		return (await listDrafts()) ?? [];
	} catch (err) {
		console.warn("[creatorClient] listDrafts error:", err);
		return [];
	}
}

export async function updateDraftContentRpc(params: {
	draftId: number;
	content: string;
}): Promise<Draft> {
	return await updateDraftContent({ data: params });
}

export async function updateDraftStatusRpc(params: {
	draftId: number;
	status: DraftStatus;
}): Promise<void> {
	await updateDraftStatus({ data: params });
}

export async function exportDraftRpc(params: {
	draftId: number;
}): Promise<{ content: string; platform: DraftPlatform; draftId: number }> {
	return await exportDraft({ data: params });
}
