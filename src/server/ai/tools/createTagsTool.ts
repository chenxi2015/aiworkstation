import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";
import { workbenchDb } from "../../db/sqlite.ts";
import type { ToolExecutionResult } from "./types.ts";

export const createTagsInputSchema = z
	.object({
		name: z
			.string()
			.nullable()
			.optional()
			.describe("单个标签名称（单标签场景），如 '并发'"),
		tags: z
			.array(
				z.object({
					name: z.string().describe("标签名称"),
					color: z
						.string()
						.nullable()
						.optional()
						.describe("标签颜色 Hex，如 '#f59e0b'，可选"),
				}),
			)
			.nullable()
			.optional()
			.describe(
				"批量创建标签列表。需要创建 2 个及以上标签时必须优先使用此字段",
			),
	})
	.passthrough();

export type CreateTagsInput = z.infer<typeof createTagsInputSchema>;

/**
 * Execute create_tags tool call
 */
export function executeCreateTags(args: CreateTagsInput): ToolExecutionResult {
	const itemsToCreate: Array<{ name: string; color?: string | null }> = [];

	if (Array.isArray(args.tags) && args.tags.length > 0) {
		for (const t of args.tags) {
			if (t && typeof t.name === "string" && t.name.trim()) {
				itemsToCreate.push({ name: t.name.trim(), color: t.color });
			}
		}
	} else if (typeof args.name === "string" && args.name.trim()) {
		itemsToCreate.push({ name: args.name.trim() });
	}

	if (itemsToCreate.length === 0) {
		return {
			toolName: "create_tags",
			summary: "创建标签失败：未提供有效的标签名称。",
			items: [],
			references: [],
			isMutation: false,
		};
	}

	const result = workbenchDb.createTags(itemsToCreate);
	const createdCount = result.createdTags.length;
	const skippedCount = result.skipped.length;

	let summaryMsg = "";
	if (createdCount > 0 && skippedCount > 0) {
		summaryMsg = `成功创建 ${createdCount} 个新标签（${result.createdTags.join("、")}），跳过已存在的 ${skippedCount} 个标签（${result.skipped.join("、")}）。`;
	} else if (createdCount > 0) {
		summaryMsg = `成功创建 ${createdCount} 个新标签：${result.createdTags.join("、")}。`;
	} else {
		summaryMsg = `所有标签已存在，无需重复创建（跳过：${result.skipped.join("、")}）。`;
	}

	const jsonPayload = JSON.stringify(
		{
			createdTags: result.createdTags,
			skipped: result.skipped,
			totalRequested: itemsToCreate.length,
		},
		null,
		2,
	);

	return {
		toolName: "create_tags",
		summary: `${summaryMsg}\n\n${jsonPayload}`,
		items: [],
		references: [],
		isMutation: createdCount > 0,
	};
}

/**
 * Tool Definition for TanStack AI
 */
export const createTagsToolDef = toolDefinition({
	name: "create_tags",
	description:
		"创建单个或批量标签。当需要同时创建多个标签时必须使用 tags 数组一次性完成，严禁重复多次单步调用。若标签已存在则自动跳过（幂等安全）。",
	inputSchema: createTagsInputSchema,
});
