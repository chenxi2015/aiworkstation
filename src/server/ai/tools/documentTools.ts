import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";
import { workbenchDb } from "../../db/sqlite.ts";
import type { ToolExecutionResult } from "./types.ts";

// ---------- read_document ----------

export const readDocumentInputSchema = z.object({
	documentId: z
		.number()
		.optional()
		.describe(
			"要读取的文档 id。省略时读取当前活跃文档（由调用方注入 activeDocumentId 上下文）",
		),
});
export type ReadDocumentInput = z.infer<typeof readDocumentInputSchema>;

export function executeReadDocument(
	args: ReadDocumentInput & { activeDocumentId?: number },
): ToolExecutionResult {
	const id = args.documentId ?? args.activeDocumentId;
	if (!id) {
		return {
			toolName: "read_document",
			summary: "无法读取文档：未指定 documentId 且当前无活跃文档。",
			items: [],
			references: [],
			isMutation: false,
		};
	}
	const doc = workbenchDb.getDocument(id);
	if (!doc) {
		return {
			toolName: "read_document",
			summary: `文档 ID=${id} 不存在。`,
			items: [],
			references: [],
			isMutation: false,
		};
	}
	const wordCount = doc.contentText?.length ?? 0;
	const preview =
		doc.contentText?.slice(0, 500) ?? "(空文档)";
	const previewSuffix = wordCount > 500 ? `\n…（共 ${wordCount} 字）` : "";

	const summary = `## 文档「${doc.title}」\n- **状态**: ${doc.status}  **风格**: ${doc.stylePreset || "无"}\n- **字数**: ${wordCount} 字  **更新**: ${doc.updatedAt ?? "-"}\n\n### 内容预览\n${preview}${previewSuffix}`;

	return {
		toolName: "read_document",
		summary,
		items: [],
		references: [],
		isMutation: false,
	};
}

export const readDocumentToolDef = toolDefinition({
	name: "read_document",
	description:
		"读取创作模块中的某个文档（纯文本正文 + 元数据）。省略 documentId 时读取当前正在编辑的文档。可用于分析文档结构、字数统计、内容理解。",
	inputSchema: readDocumentInputSchema,
});

// ---------- list_documents ----------

export const listDocumentsInputSchema = z.object({
	keyword: z
		.string()
		.optional()
		.describe("按标题或正文关键词模糊搜索，省略时返回全部文档"),
	status: z
		.enum(["editing", "finalized", "archived"])
		.optional()
		.describe("按状态过滤：editing / finalized / archived"),
	limit: z.number().optional().describe("返回数量上限，默认 20"),
});
export type ListDocumentsInput = z.infer<typeof listDocumentsInputSchema>;

export function executeListDocuments(args: ListDocumentsInput): ToolExecutionResult {
	const allDocs = workbenchDb.listDocuments(args.status === "archived");
	const limit = args.limit ?? 20;

	let filtered = allDocs;
	if (args.status && args.status !== "archived") {
		filtered = filtered.filter((d) => d.status === args.status);
	}
	if (args.keyword) {
		const kw = args.keyword.toLowerCase();
		filtered = filtered.filter(
			(d) =>
				d.title.toLowerCase().includes(kw) ||
				d.contentText?.toLowerCase().includes(kw),
		);
	}
	filtered = filtered.slice(0, limit);

	if (filtered.length === 0) {
		return {
			toolName: "list_documents",
			summary: "未找到匹配的文档。",
			items: [],
			references: [],
			isMutation: false,
		};
	}

	const listText = filtered
		.map(
			(d, i) =>
				`${i + 1}. 《${d.title}》(ID: ${d.id}) — ${d.status} — ${d.contentText?.length ?? 0} 字 — ${d.updatedAt ?? "-"}`,
		)
		.join("\n");

	return {
		toolName: "list_documents",
		summary: `共找到 ${filtered.length} 篇文档：\n${listText}`,
		items: [],
		references: [],
		isMutation: false,
	};
}

export const listDocumentsToolDef = toolDefinition({
	name: "list_documents",
	description:
		"列出或搜索创作模块中的文档。支持按标题/正文关键词模糊搜索、按状态（editing/finalized/archived）过滤。",
	inputSchema: listDocumentsInputSchema,
});

// ---------- rewrite_document ----------

export const rewriteDocumentInputSchema = z.object({
	documentId: z.number().describe("要改写的文档 id"),
	instruction: z
		.string()
		.describe(
			"改写指令（如：润色全文、压缩至 500 字、改成自媒体风格）",
		),
	targetSection: z
		.string()
		.optional()
		.describe("仅改写指定段落（引用原文段落首句作为锚点），省略时改写全文"),
	newContent: z
		.string()
		.describe(
			"改写后的完整新内容（纯文本）。此字段由 AI 自行生成后填入，经用户批准后才会写入数据库。",
		),
	snapshotNote: z
		.string()
		.optional()
		.describe("写入前快照说明，默认「AI 改写前自动备份」"),
});
export type RewriteDocumentInput = z.infer<typeof rewriteDocumentInputSchema>;

export async function executeRewriteDocument(
	args: RewriteDocumentInput,
): Promise<ToolExecutionResult> {
	const doc = workbenchDb.getDocument(args.documentId);
	if (!doc) {
		return {
			toolName: "rewrite_document",
			summary: `文档 ID=${args.documentId} 不存在，无法改写。`,
			items: [],
			references: [],
			isMutation: false,
		};
	}

	// Auto-snapshot before rewrite
	workbenchDb.createDocumentVersion({
		documentId: args.documentId,
		content: doc.content,
		origin: "ai",
		note: args.snapshotNote ?? "AI 改写前自动备份",
	});

	// Write new content as plain text (wrapped in TipTap paragraph nodes)
	const newContentText = args.newContent;
	const paragraphs = newContentText
		.split("\n")
		.filter((l) => l.trim())
		.map((text) => ({ type: "paragraph", content: [{ type: "text", text }] }));
	const newJson = JSON.stringify({ type: "doc", content: paragraphs });

	workbenchDb.updateDocument(args.documentId, {
		content: newJson,
		contentText: newContentText,
	});

	return {
		toolName: "rewrite_document",
		summary: `✅ 已改写文档「${doc.title}」（ID=${args.documentId}）\n改写指令：${args.instruction}\n写入前已自动快照（origin=ai），可在版本历史中回滚。`,
		items: [],
		references: [],
		isMutation: true,
	};
}

export const rewriteDocumentToolDef = toolDefinition({
	name: "rewrite_document",
	description:
		"【需人工批准 needsApproval】按指令改写创作模块中的文档全文或指定段落。改写前自动打版本快照（origin=ai），支持回滚。仅在用户明确同意后执行写入。",
	inputSchema: rewriteDocumentInputSchema,
});
