import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";
import { workbenchDb } from "../../db/sqlite.ts";
import type { ToolExecutionResult } from "./types.ts";

export const renameOrMergeTagsInputSchema = z
	.object({
		sourceTags: z
			.array(z.string())
			.describe("待重命名/合并的源标签名称数组，如 ['jvm', 'JVM虚拟机']"),
		targetTag: z.string().describe("目标标签名称，不存在则自动创建"),
	})
	.passthrough();

export type RenameOrMergeTagsInput = z.infer<
	typeof renameOrMergeTagsInputSchema
>;

/**
 * Execute rename_or_merge_tags tool call
 */
export function executeRenameOrMergeTags(
	args: RenameOrMergeTagsInput,
): ToolExecutionResult {
	const rawSources = Array.isArray(args.sourceTags) ? args.sourceTags : [];
	const sourceTags = rawSources.map((t) => t.trim()).filter(Boolean);
	const targetTag = (args.targetTag || "").trim();

	if (!targetTag) {
		return {
			toolName: "rename_or_merge_tags",
			summary: "标签合并/治理失败：未提供有效的目标标签名称。",
			items: [],
			references: [],
			isMutation: false,
		};
	}

	if (sourceTags.length === 0) {
		return {
			toolName: "rename_or_merge_tags",
			summary: "标签合并/治理失败：未提供待重命名或合并的源标签数组。",
			items: [],
			references: [],
			isMutation: false,
		};
	}

	const result = workbenchDb.renameOrMergeTags(sourceTags, targetTag);
	const summaryMsg = `成功将标签 [${sourceTags.join("、")}] 合并治理为「${targetTag}」，共更新了 ${result.affectedBookmarksCount} 条书签的标签关联并清理了冗余源标签。`;

	const jsonPayload = JSON.stringify(
		{
			mergedFrom: result.mergedFrom,
			targetTag: result.targetTag,
			affectedBookmarksCount: result.affectedBookmarksCount,
			affectedBookmarks: result.affectedBookmarks,
		},
		null,
		2,
	);

	return {
		toolName: "rename_or_merge_tags",
		summary: `${summaryMsg}\n\n${jsonPayload}`,
		items: [],
		references: [],
		isMutation: result.affectedBookmarksCount > 0,
	};
}

/**
 * Tool Definition for TanStack AI
 */
export const renameOrMergeTagsToolDef = toolDefinition({
	name: "rename_or_merge_tags",
	description:
		"标签治理工具：将源标签批量重命名或合并为目标标签（所有携带源标签的书签自动改挂目标标签），随后清理源标签。例如把 'jvm'、'JVM虚拟机' 统一合并为 'JVM'。",
	inputSchema: renameOrMergeTagsInputSchema,
});
