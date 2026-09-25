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
import { createDocumentFromMaterial } from "../../server/functions/creatorBridge";
import {
	adoptDraft,
	exportDraft,
	generateDrafts,
	listDrafts,
	updateDraftContent,
	updateDraftStatus,
} from "../../server/functions/creatorDrafts";
import {
	batchDeleteMaterials,
	createManualMaterial,
	createMaterialFolder,
	deleteMaterial,
	deleteMaterialFolder,
	importBookmarkAsMaterial,
	importFileAsMaterial,
	importLocalPathsAsMaterials,
	listArchivedCreatorMaterials,
	listCreatorMaterials,
	listMaterialFolders,
	openMaterialAssetsDir,
	pickLocalPaths,
	searchBookmarksForPicker,
	updateMaterial,
	updateMaterialFolder,
	uploadMaterialFiles,
} from "../../server/functions/creatorMaterials";

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

/** 已归档素材（归档 Tab） */
export async function fetchArchivedMaterials(): Promise<Material[]> {
	try {
		return (await listArchivedCreatorMaterials()) ?? [];
	} catch (err) {
		console.warn("[creatorClient] listArchivedCreatorMaterials error:", err);
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
	starred?: boolean;
	folderId?: number | null;
}): Promise<Material> {
	return await updateMaterial({ data: params });
}

/** 删除素材（连带资产文件，草稿保留并展示「素材已删除」） */
export async function deleteMaterialRpc(params: {
	id: number;
}): Promise<{ deleted: boolean }> {
	return await deleteMaterial({ data: params });
}

/** 批量删除素材 */
export async function batchDeleteMaterialsRpc(params: {
	ids: number[];
}): Promise<{ deletedCount: number }> {
	return await batchDeleteMaterials({ data: params });
}

/** 在系统文件管理器中打开素材的资产目录 */
export async function openMaterialAssetsDirRpc(params: {
	id: number;
}): Promise<{ opened: boolean; path: string }> {
	return await openMaterialAssetsDir({ data: params });
}

/** 素材一键导入创作台：以素材快照新建创作文档，返回文档 id */
export async function createDocumentFromMaterialRpc(
	materialId: number,
): Promise<{ documentId: number }> {
	return await createDocumentFromMaterial({ data: { materialId } });
}

/** 本地文件上传导入素材（多文件，文件夹由前端展开），返回导入数量 */
export async function uploadMaterialFilesRpc(
	files: File[],
	folderId: number | null,
): Promise<{ imported: number }> {
	const formData = new FormData();
	for (const file of files) formData.append("files", file);
	if (folderId) formData.append("folderId", String(folderId));
	return await uploadMaterialFiles({ data: formData });
}

/** 唤起系统访达选择器，返回选中的文件或目录绝对路径 */
export async function pickLocalPathsRpc(
	mode: "files" | "directory",
): Promise<string[]> {
	return (await pickLocalPaths({ data: { mode } })) ?? [];
}

/** 零拷贝外部路径导入素材（原位引用），秒级落库 */
export async function importLocalPathsAsMaterialsRpc(params: {
	paths: string[];
	folderId?: number | null;
}): Promise<{ imported: number }> {
	return await importLocalPathsAsMaterials({ data: params });
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
