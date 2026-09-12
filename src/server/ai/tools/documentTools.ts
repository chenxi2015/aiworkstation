import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";
import {
	markdownToTiptapDoc,
	tiptapJsonToMarkdown,
} from "../../../components/editor/markdown.ts";
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

	const { jsonString, contentText } = markdownToTiptapDoc(args.newContent);

	workbenchDb.updateDocument(args.documentId, {
		content: jsonString,
		contentText,
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

// ---------- trigger_document_create ----------

export const triggerDocumentCreateInputSchema = z.object({
	title: z
		.string()
		.min(1)
		.max(120)
		.describe("新建文档的标题（精炼、吸睛、契合用户创作主题）"),
	prompt: z
		.string()
		.describe(
			"下发给流式长文创作引擎的结构大纲与深度创作要求（例如：从架构设计、关键技术、落地场景等维度深入展开）",
		),
	stylePreset: z
		.string()
		.optional()
		.describe("可选的排版文风预设（如 tech、story、academic、default 等）"),
});
export type TriggerDocumentCreateInput = z.infer<
	typeof triggerDocumentCreateInputSchema
>;

export function executeTriggerDocumentCreate(
	args: TriggerDocumentCreateInput,
): ToolExecutionResult {
	return {
		toolName: "trigger_document_create",
		summary: `已在单栏富文本编辑器中创建新文档《${args.title}》并启动流式创作流水线。`,
		items: [],
		references: [],
		isMutation: true,
	};
}

export const triggerDocumentCreateToolDef = toolDefinition({
	name: "trigger_document_create",
	description:
		"在创作模块中新建一篇文档，并在单栏富文本编辑器中启动【长文流式动态创作流水线】。当用户要求「新建文档」、「以XX为主题写一篇文章」、「起草新稿件」或从零创作时必须调用此工具。前端将自动切换到新文档并在富文本中流式打字输出。严禁在此场景下调用 trigger_paragraph_rewrite！",
	inputSchema: triggerDocumentCreateInputSchema,
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

// ---------- update_document_title ----------

export const updateDocumentTitleInputSchema = z.object({
	documentId: z
		.number()
		.optional()
		.describe("要修改标题的文档 ID。省略时自动定位当前活跃文档"),
	newTitle: z
		.string()
		.min(1)
		.max(120)
		.describe("修改后的新标题（精炼、吸睛、符合文章受众心理）"),
	reason: z
		.string()
		.optional()
		.describe("修改理由或受众切入点说明（如：更具悬念感与自媒体传播度）"),
});
export type UpdateDocumentTitleInput = z.infer<
	typeof updateDocumentTitleInputSchema
>;

export function executeUpdateDocumentTitle(
	args: UpdateDocumentTitleInput & { activeDocumentId?: number },
): ToolExecutionResult {
	const id = args.documentId ?? args.activeDocumentId;
	if (!id) {
		const recentDocs = workbenchDb.listDocuments(false);
		if (recentDocs.length === 1) {
			const targetId = recentDocs[0].id;
			const oldTitle = recentDocs[0].title;
			const trimmedTitle = args.newTitle.trim();
			if (!trimmedTitle) {
				return {
					toolName: "update_document_title",
					summary: "修改标题失败：新标题不能为空。",
					items: [],
					references: [],
					isMutation: false,
				};
			}
			workbenchDb.updateDocument(targetId, { title: trimmedTitle });
			return {
				toolName: "update_document_title",
				summary: `✅ 已成功将文档（ID: ${targetId}）的标题从《${oldTitle}》更新为《${trimmedTitle}》${args.reason ? `\n修改理由：${args.reason}` : ""}`,
				items: [],
				references: [],
				isMutation: true,
			};
		}
		return {
			toolName: "update_document_title",
			summary: "无法修改标题：未指定 documentId 且当前无明确的活跃编辑文档。",
			items: [],
			references: [],
			isMutation: false,
		};
	}

	const doc = workbenchDb.getDocument(id);
	if (!doc) {
		return {
			toolName: "update_document_title",
			summary: `文档 ID=${id} 不存在，无法修改标题。`,
			items: [],
			references: [],
			isMutation: false,
		};
	}

	const oldTitle = doc.title;
	const trimmedTitle = args.newTitle.trim();
	if (!trimmedTitle) {
		return {
			toolName: "update_document_title",
			summary: "修改标题失败：新标题不能为空。",
			items: [],
			references: [],
			isMutation: false,
		};
	}

	workbenchDb.updateDocument(id, { title: trimmedTitle });

	return {
		toolName: "update_document_title",
		summary: `✅ 已成功将文档（ID: ${id}）的标题从《${oldTitle}》更新为《${trimmedTitle}》${args.reason ? `\n修改理由：${args.reason}` : ""}`,
		items: [],
		references: [],
		isMutation: true,
	};
}

export const updateDocumentTitleToolDef = toolDefinition({
	name: "update_document_title",
	description:
		"修改当前创作文档或指定文档的标题。当用户要求修改标题、或者要求头脑风暴并应用最优标题时调用。省略 documentId 时自动定位当前正在编辑的活跃文档。",
	inputSchema: updateDocumentTitleInputSchema,
});
