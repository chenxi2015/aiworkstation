import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";
import { workbenchDb } from "../../db/sqlite.ts";
import type { ToolExecutionResult } from "./types.ts";

export const removeTagsInputSchema = z
	.object({
		bookmarkIds: z
			.array(z.string())
			.nullable()
			.optional()
			.describe("要从哪些书签上摘除标签（不传则视为全局操作）"),
		tags: z
			.array(z.string())
			.describe("要移除的标签名称数组"),
		deleteGlobal: z
			.boolean()
			.nullable()
			.optional()
			.describe("是否从全库彻底删除标签（含所有书签上的关联），默认 false"),
	})
	.passthrough();

export type RemoveTagsInput = z.infer<typeof removeTagsInputSchema>;

/**
 * Execute remove_tags tool call
 */
export function executeRemoveTags(args: RemoveTagsInput): ToolExecutionResult {
	const rawTags = Array.isArray(args.tags) ? args.tags : [];
	const cleanTags = rawTags.map((t) => t.trim()).filter(Boolean);

	if (cleanTags.length === 0) {
		return {
			toolName: "remove_tags",
			summary: "移除标签失败：未提供需要移除的标签名称。",
			items: [],
			references: [],
			isMutation: false,
		};
	}

	const result = workbenchDb.removeTags({
		bookmarkIds: args.bookmarkIds,
		tags: cleanTags,
		deleteGlobal: args.deleteGlobal,
	});

	const affectedCount = result.affectedBookmarks.length;
	let summaryMsg = "";
	if (result.deletedGlobal) {
		summaryMsg = `已从全库彻底删除标签 [${cleanTags.join("、")}]，解除了 ${affectedCount} 条书签上的关联。`;
	} else {
		summaryMsg = `已从指定的 ${affectedCount} 条书签中摘除标签 [${cleanTags.join("、")}]。`;
	}

	const jsonPayload = JSON.stringify(
		{
			removedTags: result.removedTags,
			affectedBookmarks: result.affectedBookmarks,
			deletedGlobal: result.deletedGlobal,
		},
		null,
		2,
	);

	return {
		toolName: "remove_tags",
		summary: `${summaryMsg}\n\n${jsonPayload}`,
		items: [],
		references: [],
		isMutation: affectedCount > 0 || result.deletedGlobal,
	};
}

/**
 * Tool Definition for TanStack AI
 */
export const removeTagsToolDef = toolDefinition({
	name: "remove_tags",
	description:
		"移除标签。两种模式：1. 仅传入 bookmarkIds + tags：从指定书签上摘除这些标签；2. 仅传入 tags 且 deleteGlobal=true：从全库删除这些标签并解除所有书签关联。",
	inputSchema: removeTagsInputSchema,
});
