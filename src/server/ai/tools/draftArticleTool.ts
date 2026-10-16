import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";
import { generateArticleContent } from "../documentGeneration.ts";
import { createDraft } from "../drafts/draftStore.ts";
import { resolveEditorPresetPrompt } from "../editorPresets.ts";
import type { ToolExecutionResult } from "./types.ts";

export const draftArticleInputSchema = z.object({
	title: z.string().describe("文章标题"),
	prompt: z.string().describe("创作要求、大纲或核心构思"),
	stylePreset: z
		.string()
		.nullable()
		.optional()
		.describe("写作风格预设（如 standard, storytelling, deep, newsletter 等）"),
});

export type DraftArticleInput = z.infer<typeof draftArticleInputSchema>;

export interface ExecuteDraftArticleOptions {
	sessionId?: string;
}

/**
 * Executes draft_article tool:
 * Generates the full article content server-side, writes it to the local draft store,
 * and returns summary + navigation without leaking the full text to the LLM conversation context.
 */
export async function executeDraftArticle(
	args: DraftArticleInput,
	options?: ExecuteDraftArticleOptions,
): Promise<ToolExecutionResult> {
	const title = args.title.trim() || "未命名文章";
	const presetPrompt = resolveEditorPresetPrompt(args.stylePreset ?? undefined);

	const content = await generateArticleContent(
		{ title, prompt: args.prompt, stylePreset: args.stylePreset ?? undefined },
		presetPrompt,
	);

	const draft = createDraft({
		title,
		content,
		sessionId: options?.sessionId,
	});

	const wordCount = draft.wordCount;

	return {
		toolName: "draft_article",
		summary: `已为《${title}》生成全文草稿（约 ${wordCount} 字）。正文已暂存本地草稿区，等待用户在交付卡片中选择落点（存为创作文档、存为笔记或丢弃）。`,
		items: [],
		references: [],
		isMutation: true,
		navigation: {
			route: "",
			searchParams: { draftId: draft.id },
			label: "",
			draftId: draft.id,
			title,
			wordCount,
		},
	};
}

export const draftArticleToolDef = toolDefinition({
	metadata: { executionClass: "content-generating", clientAction: "draft" },
	name: "draft_article",
	description:
		"从零撰写长文，或将对话探讨、素材、搜索结果整理/汇总为独立文档/简报草稿并以卡片形式交付给用户。当用户说「新建/创建/写/起草/撰写/生成/整理/汇总/总结为文档、文章、稿件、长文、推文、文案、简报或草稿」，或「以XX为主题/为题写一篇文章」时必须调用本工具。产出的正文会先暂存至本地草稿区，等待用户确认落点（存为创作文档、存为笔记或丢弃），不直接写入数据库或笔记库。",
	inputSchema: draftArticleInputSchema,
});
