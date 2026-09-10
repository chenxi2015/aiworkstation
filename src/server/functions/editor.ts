import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";
import { createServerFn } from "@tanstack/react-start";
import type {
	DocumentVersion,
	DocumentVersionOrigin,
	EditorDocument,
} from "../../components/editor/types.ts";
import {
	assertPathWithinRoot,
	assertWritablePath,
	formatBytes,
} from "../ai/fs/fsSafety.ts";
import { workbenchDb } from "../db/sqlite.ts";
import {
	getDocumentAssetsDir,
	getFilesRootDir,
} from "../services/filesRoot.ts";

/** 上传媒体大小上限（图片/视频混排场景，本地优先故放宽到 200MB） */
const MAX_UPLOAD_BYTES = 200 * 1024 * 1024;

/**
 * Server Function: 文档列表（默认不含 archived）
 */
export const listDocuments = createServerFn({ method: "GET" }).handler(
	async (): Promise<EditorDocument[]> => {
		return workbenchDb.listDocuments(false);
	},
);

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
	.validator((data: { title?: string; stylePreset?: string }) => data)
	.handler(async ({ data }): Promise<EditorDocument> => {
		const id = workbenchDb.createDocument({
			title: data.title?.trim() || "未命名文档",
			stylePreset: data.stylePreset ?? "",
		});
		const doc = workbenchDb.getDocument(id);
		if (!doc) throw new Error("文档创建失败");
		return doc;
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
 * Server Function: 删除文档（连同版本快照；媒体文件保留，由「清理孤儿文件」维护动作兜底）
 */
export const deleteDocument = createServerFn({ method: "POST" })
	.validator((data: { id: number }) => data)
	.handler(async ({ data }): Promise<void> => {
		workbenchDb.deleteDocument(data.id);
	});

/**
 * Server Function: 版本快照列表
 */
export const listDocumentVersions = createServerFn({ method: "GET" })
	.validator((data: { documentId: number }) => data)
	.handler(async ({ data }): Promise<DocumentVersion[]> => {
		return workbenchDb.listDocumentVersions(data.documentId);
	});

/**
 * Server Function: 手动打版本快照（AI 回写前的自动快照也走这里，origin='ai'）
 */
export const snapshotDocumentVersion = createServerFn({ method: "POST" })
	.validator(
		(data: {
			documentId: number;
			origin?: DocumentVersionOrigin;
			note?: string;
		}) => data,
	)
	.handler(async ({ data }): Promise<DocumentVersion> => {
		const doc = workbenchDb.getDocument(data.documentId);
		if (!doc) throw new Error("文档不存在");
		const id = workbenchDb.createDocumentVersion({
			documentId: data.documentId,
			content: doc.content,
			origin: data.origin ?? "human",
			note: data.note ?? null,
		});
		const version = workbenchDb
			.listDocumentVersions(data.documentId)
			.find((v) => v.id === id);
		if (!version) throw new Error("快照创建失败");
		return version;
	});

/**
 * Server Function: 上传文档媒体（图片/视频），落 <filesRootDir>/editor/documents/<id>/，
 * 返回可通过 /api/files/ 访问的 URL（docs/editor-plan.md 第五节：媒体文件不入库）。
 */
export const uploadDocumentAsset = createServerFn({ method: "POST" })
	.validator((data: FormData) => {
		const file = data.get("file");
		const documentId = Number(data.get("documentId"));
		if (!(file instanceof File)) throw new Error("缺少文件");
		if (!Number.isInteger(documentId) || documentId <= 0) {
			throw new Error("documentId 非法");
		}
		return { file, documentId };
	})
	.handler(async ({ data }): Promise<{ url: string; filename: string }> => {
		const { file, documentId } = data;
		if (!workbenchDb.getDocument(documentId)) throw new Error("文档不存在");
		if (file.size > MAX_UPLOAD_BYTES) {
			throw new Error(
				`文件过大（${formatBytes(file.size)}），上限 ${formatBytes(MAX_UPLOAD_BYTES)}`,
			);
		}

		const filesRoot = getFilesRootDir();
		const destDir = getDocumentAssetsDir(documentId);
		assertPathWithinRoot(destDir, filesRoot);
		assertWritablePath(destDir);
		mkdirSync(destDir, { recursive: true });

		// 重名去重：name.png → name-1.png / name-2.png
		const rawName = file.name || "asset";
		const ext = extname(rawName);
		const stem = rawName.slice(0, rawName.length - ext.length);
		let finalName = rawName;
		let counter = 1;
		while (existsSync(join(destDir, finalName))) {
			finalName = `${stem}-${counter}${ext}`;
			counter += 1;
		}

		const buffer = Buffer.from(await file.arrayBuffer());
		writeFileSync(join(destDir, finalName), buffer);

		// rel 路径相对 filesRootDir，由 /api/files/ 静态服务回读
		const relPath = `editor/documents/${documentId}/${finalName}`;
		return { url: `/api/files/${relPath}`, filename: finalName };
	});

/**
 * Server Function: AI bar 文本生成（非流式，快速返回改写结果）。
 * BubbleMenu 动作条专用；复用 ragContext LLM 配置，不走 agent loop，省 latency。
 */
export const generateAiBarText = createServerFn({ method: "POST" })
	.validator(
		(data: { prompt: string; systemHint?: string; stylePreset?: string }) =>
			data,
	)
	.handler(async ({ data }): Promise<{ text: string }> => {
		const { chat } = await import("@tanstack/ai");
		const { openaiCompatibleText } = await import(
			"@tanstack/ai-openai/compatible"
		);
		const { resolveLlmConfig } = await import("../ai/ragContext.ts");
		const { resolveEditorPresetPrompt } = await import(
			"../ai/editorPresets.ts"
		);

		const { apiKey, baseUrl, model } = resolveLlmConfig();
		if (!apiKey) {
			return {
				text: "（请先在设置中填入 LLM API Key 才能使用 AI bar 功能）",
			};
		}

		const adapter = openaiCompatibleText(model, { baseURL: baseUrl, apiKey });
		const presetPrompt = resolveEditorPresetPrompt(data.stylePreset);
		const systemPrompt =
			(data.systemHint ||
				"你是一名专业中文写作助手。直接输出改写后的内容，不要加前缀说明。") +
			presetPrompt;

		const stream = await chat({
			adapter,
			systemPrompts: [systemPrompt],
			messages: [{ role: "user", content: data.prompt }],
			stream: true,
		});

		let result = "";
		for await (const chunk of stream as AsyncIterable<
			Record<string, unknown>
		>) {
			const delta = (chunk.delta ?? chunk.content ?? "") as string;
			if (delta) result += delta;
		}

		return { text: result.trim() };
	});
