import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";
import { tiptapJsonToMarkdown } from "../../../components/editor/markdown.ts";
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
	let id = args.documentId ?? args.activeDocumentId;
	if (!id) {
		const recentDocs = workbenchDb.listDocuments(false);
		if (recentDocs.length === 1) {
			id = recentDocs[0].id;
		} else if (recentDocs.length > 1) {
			const listStr = recentDocs
				.slice(0, 5)
				.map((d) => `• ID: ${d.id} - 《${d.title}》`)
				.join("\n");
			return {
				toolName: "read_document",
				summary: `未指定 documentId 且当前无明确活跃文档。数据库中现有的文档如下，可传入对应 documentId 读取：\n${listStr}`,
				items: [],
				references: [],
				isMutation: false,
			};
		} else {
			return {
				toolName: "read_document",
				summary: "无法读取文档：未指定 documentId 且当前创作库中暂无文档。",
				items: [],
				references: [],
				isMutation: false,
			};
		}
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
	let markdownContent = "";
	if (doc.content) {
		try {
			const parsed = JSON.parse(doc.content);
			markdownContent = tiptapJsonToMarkdown(parsed);
		} catch {
			markdownContent = doc.contentText || "";
		}
	} else {
		markdownContent = doc.contentText || "";
	}

	const wordCount = doc.contentText?.length ?? markdownContent.length;

	const summary = `## 文档「${doc.title}」\n- **状态**: ${doc.status}  **风格**: ${doc.stylePreset || "无"}\n- **字数**: ${wordCount} 字  **更新**: ${doc.updatedAt ?? "-"}\n\n### 完整正文（含图片/视频标记）\n${markdownContent || "(空文档)"}`;

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

export function executeListDocuments(
	args: ListDocumentsInput,
): ToolExecutionResult {
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
		.describe("改写指令（如：润色全文、压缩至 500 字、改成自媒体风格）"),
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

	// Write new content by parsing markdown blocks (preserving images, videos, headings)
	const newContentText = args.newContent;
	const lines = newContentText.split("\n").filter((l) => l.trim().length > 0);
	const nodes = lines.map((line) => {
		const trimmed = line.trim();
		// 1. Image: ![alt](url)
		const imgMatch = trimmed.match(
			/^!\[(.*?)\]\((https?:\/\/[^\s)]+|\/api\/files\/[^\s)]+)\)$/,
		);
		if (imgMatch) {
			return {
				type: "image",
				attrs: { src: imgMatch[2], alt: imgMatch[1] || "" },
			};
		}
		// 2. Video: [▶ 视频](url) or similar
		const videoMatch = trimmed.match(
			/^\[(?:▶\s*|🎥\s*)?(?:.*?视频|video).*?\]\((https?:\/\/[^\s)]+|\/api\/files\/[^\s)]+)\)$/,
		);
		if (videoMatch) {
			return {
				type: "video",
				attrs: { src: videoMatch[1] },
			};
		}
		// 3. Heading: # Heading
		const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
		if (headingMatch) {
			return {
				type: "heading",
				attrs: { level: headingMatch[1].length },
				content: [{ type: "text", text: headingMatch[2] }],
			};
		}
		// 4. Default paragraph
		return {
			type: "paragraph",
			content: [{ type: "text", text: trimmed }],
		};
	});

	const newJson = JSON.stringify({ type: "doc", content: nodes });

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

// ---------- trigger_paragraph_rewrite ----------

export const triggerParagraphRewriteInputSchema = z.object({
	instruction: z
		.string()
		.describe(
			"提炼后的精细润色/改写/精简要求与原则，将直接注入正文逐段流式改写流水线中（例如：保留事实，精简铺垫，提升表述质感）",
		),
	strategySummary: z.string().describe("针对当前文章的结构诊断与优化策略简述"),
});
export type TriggerParagraphRewriteInput = z.infer<
	typeof triggerParagraphRewriteInputSchema
>;

export function executeTriggerParagraphRewrite(
	args: TriggerParagraphRewriteInput,
): ToolExecutionResult {
	return {
		toolName: "trigger_paragraph_rewrite",
		summary: `已在编辑器中启动逐段流式精修流水线：${args.strategySummary}（指令：${args.instruction}）`,
		items: [],
		references: [],
		isMutation: false,
	};
}

export const triggerParagraphRewriteToolDef = toolDefinition({
	name: "trigger_paragraph_rewrite",
	description:
		"在当前富文本编辑器中启动【逐段流式精修流水线】。当用户要求润色、改写、精简、扩写、调整文风时必须调用此工具。大模型先在回复中给出篇章诊断与修改意图，再调用本工具协同前端在正文中逐段流式生成并提供 Diff 审阅。严禁直接覆写数据库！",
	inputSchema: triggerParagraphRewriteInputSchema,
});
