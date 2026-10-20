import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";
import type { ToolExecutionResult } from "../types.ts";
import { createToolResult } from "./documentHelper.ts";

export const triggerParagraphRewriteInputSchema = z.object({
	instruction: z
		.string()
		.describe(
			"提炼后的精细润色/改写/排版优化要求与风格原则（若应用了技能规范如公众号排版、设计规范、创作文风等，需在此详细写明具体的样式要点与排版规则），将直接注入正文逐段流式改写流水线中",
		),
	strategySummary: z.string().describe("针对当前文章的结构诊断与优化策略简述"),
});
export type TriggerParagraphRewriteInput = z.infer<
	typeof triggerParagraphRewriteInputSchema
>;

export function executeTriggerParagraphRewrite(
	args: TriggerParagraphRewriteInput,
): ToolExecutionResult {
	return createToolResult(
		"trigger_paragraph_rewrite",
		`已在编辑器中启动逐段流式改写流水线：${args.strategySummary}（指令：${args.instruction}）`,
		false,
	);
}

export const triggerParagraphRewriteToolDef = toolDefinition({
	metadata: {
		executionClass: "context-dependent",
		requiresView: "rewrite-target",
		clientAction: "rewrite",
	},
	name: "trigger_paragraph_rewrite",
	description:
		"在当前富文本编辑器中启动【逐段流式改写/优化流水线】。当用户要求对当前文章进行全文优化、润色、排版美化、调整文风、套用技能(Skill)规范改写或深度二创洗稿时必须调用此工具。大模型先在回复中给出篇章诊断与优化策略，再调用本工具协同前端在正文中逐段流式生成并提供 Diff 审阅。严禁在聊天框中直接输出全文，严禁直接覆写数据库！",
	inputSchema: triggerParagraphRewriteInputSchema,
});

