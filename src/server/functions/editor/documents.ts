import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { createServerFn } from "@tanstack/react-start";
import type { EditorDocument } from "../../../components/editor/types.ts";
import { generateArticleContent } from "../../ai/documentGeneration.ts";
import { resolveEditorPresetPrompt } from "../../ai/editorPresets.ts";
import {
	assertPathWithinRoot,
	assertWritablePath,
} from "../../ai/fs/fsSafety.ts";
import { workbenchDb } from "../../db/sqlite.ts";
import {
	getDocumentAssetsDir,
	getFilesRootDir,
} from "../../services/filesRoot.ts";

/**
 * Server Function: 文档列表（默认不含 archived）
 */
export const listDocuments = createServerFn({ method: "GET" }).handler(
	async (): Promise<EditorDocument[]> => {
		return workbenchDb.listDocuments(false);
	},
);

/**
 * Server Function: 归档库文档列表（仅 status='archived'）
 */
export const listArchivedDocuments = createServerFn({ method: "GET" }).handler(
	async (): Promise<EditorDocument[]> => {
		return workbenchDb.listArchivedDocuments();
	},
);

/**
 * Server Function: 归档「再次创作」或创作台「复制文档」—— 复制副本回到创作台（status='editing'），
 * 原文档不动，保证创作中 ⇄ 归档互斥（docs/selfmedia-merge-plan.md 第三节）。
 */
export const duplicateDocument = createServerFn({ method: "POST" })
	.validator((data: { id: number; title?: string }) => data)
	.handler(async ({ data }): Promise<EditorDocument> => {
		const source = workbenchDb.getDocument(data.id);
		if (!source) throw new Error("文档不存在");

		const targetTitle =
			data.title?.trim() ||
			(source.status === "archived"
				? `${source.title}（再次创作）`
				: `${source.title}（副本）`);

		const newId = workbenchDb.createDocument({
			title: targetTitle,
			content: source.content,
			contentText: source.contentText,
			stylePreset: source.stylePreset,
			folderId: source.folderId ?? null,
		});

		// Copy local asset files if existing
		try {
			const sourceAssetsDir = getDocumentAssetsDir(data.id);
			if (existsSync(sourceAssetsDir)) {
				const destAssetsDir = getDocumentAssetsDir(newId);
				mkdirSync(destAssetsDir, { recursive: true });
				cpSync(sourceAssetsDir, destAssetsDir, { recursive: true });
			}
		} catch (err) {
			console.warn(
				`[duplicateDocument] Failed to copy local assets for document ${data.id}:`,
				err,
			);
		}

		const doc = workbenchDb.getDocument(newId);
		if (!doc) throw new Error("副本创建失败");
		return doc;
	});

/**
 * Server Function: 读取单个文档
 */
export const getDocument = createServerFn({ method: "GET" })
	.validator((data: { id: number }) => data)
	.handler(async ({ data }): Promise<EditorDocument | null> => {
		return workbenchDb.getDocument(data.id);
	});

/**
 * Server Function: 新建文档
 */
export const createDocument = createServerFn({ method: "POST" })
	.validator(
		(data: {
			title?: string;
			stylePreset?: string;
			folderId?: number | null;
		}) => data,
	)
	.handler(async ({ data }): Promise<EditorDocument> => {
		const id = workbenchDb.createDocument({
			title: data.title?.trim() || "未命名文档",
			stylePreset: data.stylePreset ?? "",
			folderId: data.folderId ?? null,
		});
		const doc = workbenchDb.getDocument(id);
		if (!doc) throw new Error("文档创建失败");
		return doc;
	});

/**
 * Server Function: headless 创建并生成文档（供 AI 信号未被创作台接住时兜底）
 */
export const createDocumentHeadless = createServerFn({ method: "POST" })
	.validator(
		(data: {
			title?: string;
			prompt?: string;
			stylePreset?: string;
			folderId?: number | null;
		}) => data,
	)
	.handler(async ({ data }): Promise<EditorDocument> => {
		const title = data.title?.trim() || "未命名文档";
		const prompt = data.prompt ?? "";
		const presetPrompt = resolveEditorPresetPrompt(data.stylePreset);
		const content = await generateArticleContent(
			{ title, prompt, stylePreset: data.stylePreset },
			presetPrompt,
		);
		const id = workbenchDb.createDocument({
			title,
			content,
			contentText: content,
			stylePreset: data.stylePreset ?? "",
			folderId: data.folderId ?? null,
		});
		const doc = workbenchDb.getDocument(id);
		if (!doc) throw new Error("文档创建失败");
		return doc;
	});

/**
 * Server Function: 置顶/取消置顶文档
 */
export const toggleDocumentPinned = createServerFn({ method: "POST" })
	.validator((data: { id: number; pinned: boolean }) => data)
	.handler(async ({ data }): Promise<void> => {
		if (!workbenchDb.getDocument(data.id)) throw new Error("文档不存在");
		workbenchDb.setDocumentPinned(data.id, data.pinned);
	});

/**
 * Server Function: 文档拖拽排序（按传入顺序重写同组 sort_order）
 */
export const reorderDocuments = createServerFn({ method: "POST" })
	.validator((data: { orderedIds: number[] }) => data)
	.handler(async ({ data }): Promise<void> => {
		workbenchDb.reorderDocuments(data.orderedIds);
	});

/**
 * Server Function: 自动保存（标题/内容/风格/状态，防抖调用）
 */
export const updateDocument = createServerFn({ method: "POST" })
	.validator(
		(data: {
			id: number;
			title?: string;
			content?: string;
			contentText?: string;
			stylePreset?: string;
			status?: EditorDocument["status"];
		}) => data,
	)
	.handler(async ({ data }): Promise<void> => {
		if (!workbenchDb.getDocument(data.id)) throw new Error("文档不存在");
		workbenchDb.updateDocument(data.id, {
			title: data.title,
			content: data.content,
			contentText: data.contentText,
			stylePreset: data.stylePreset,
			status: data.status,
		});
	});

/**
 * Server Function: 删除文档（连同版本快照；可选用 deleteLocalAssets 清理本地媒体资源）
 */
export const deleteDocument = createServerFn({ method: "POST" })
	.validator((data: { id: number; deleteLocalAssets?: boolean }) => data)
	.handler(async ({ data }): Promise<void> => {
		workbenchDb.deleteDocument(data.id);
		if (data.deleteLocalAssets) {
			try {
				const filesRoot = getFilesRootDir();
				const assetsDir = getDocumentAssetsDir(data.id);
				assertPathWithinRoot(assetsDir, filesRoot);
				assertWritablePath(assetsDir);
				if (existsSync(assetsDir)) {
					rmSync(assetsDir, { recursive: true, force: true });
				}
			} catch (err) {
				console.warn(
					`[deleteDocument] Failed to delete local assets for document ${data.id}:`,
					err,
				);
			}
		}
	});

/**
 * Server Function: 打开文档的本地存储目录（由系统文件管理器打开）
 */
export const openDocumentDirectory = createServerFn({ method: "POST" })
	.validator((data: { id: number }) => data)
	.handler(async ({ data }): Promise<{ success: boolean; path: string }> => {
		const doc = workbenchDb.getDocument(data.id);
		if (!doc) throw new Error("文档不存在");

		const { openInOs } = await import("../../services/systemOpener.ts");
		const assetsDir = getDocumentAssetsDir(data.id);
		return await openInOs(assetsDir, { ensureDir: true });
	});
