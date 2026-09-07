import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";
import type { SearchResultItem } from "../../../components/workbench/types.ts";
import { workbenchDb } from "../../db/sqlite.ts";
import type { ToolExecutionResult } from "./types.ts";

export const addTagsToBookmarksInputSchema = z
	.object({
		bookmarkIds: z
			.array(z.string())
			.nullable()
			.optional()
			.describe("目标书签 ID 数组（精确匹配，优先使用）"),
		itemNamesOrUrls: z
			.array(z.string())
			.nullable()
			.optional()
			.describe(
				"书签标题或 URL 关键词数组（模糊匹配，与 query_bookmarks 的匹配逻辑保持一致）",
			),
		tags: z
			.array(z.string())
			.nullable()
			.optional()
			.describe(
				"要追加的标签名称数组，如 ['并发', 'JVM']。不存在的标签自动创建",
			),
		plans: z
			.array(
				z.object({
					itemNamesOrUrls: z.array(z.string()).nullable().optional(),
					bookmarkIds: z.array(z.string()).nullable().optional(),
					tags: z.array(z.string()),
				}),
			)
			.nullable()
			.optional()
			.describe(
				"批量打标计划。当需要给不同书签分别打不同标签时必须使用此字段一次性提交，严禁拆为多次单步调用",
			),
	})
	.passthrough();

export type AddTagsToBookmarksInput = z.infer<
	typeof addTagsToBookmarksInputSchema
>;

/**
 * Execute add_tags_to_bookmarks tool call
 */
export function executeAddTagsToBookmarks(
	args: AddTagsToBookmarksInput,
): ToolExecutionResult {
	const result = workbenchDb.addTagsToBookmarks({
		bookmarkIds: args.bookmarkIds,
		itemNamesOrUrls: args.itemNamesOrUrls,
		tags: args.tags,
		plans: args.plans,
	});

	const affectedCount = result.affectedBookmarks.length;
	const createdTagsCount = result.createdTags.length;

	let summaryMsg = "";
	if (affectedCount === 0) {
		const skippedDesc =
			result.skipped.length > 0 ? `（未匹配关键词: ${result.skipped.join("、")}）` : "";
		summaryMsg = `未找到符合条件的目标书签进行打标${skippedDesc}。`;
	} else {
		const tagCreatedDesc =
			createdTagsCount > 0
				? `，自动新建了 ${createdTagsCount} 个标签（${result.createdTags.join("、")}）`
				: "";
		const skippedDesc =
			result.skipped.length > 0 ? `，部分未匹配项已跳过（${result.skipped.join("、")}）` : "";
		summaryMsg = `成功为 ${affectedCount} 条书签完成打标${tagCreatedDesc}${skippedDesc}。`;
	}

	const references: SearchResultItem[] = result.affectedBookmarks.map(
		(bm, idx) => ({
			id: bm.id,
			name: bm.title,
			url: bm.url || "",
			type: "link",
			tags: bm.tags,
			summary: bm.title,
			score: 1.0 - idx * 0.01,
			matchType: "keyword",
			matchReason: `打标成功：[${bm.tags.join(", ")}]`,
		}),
	);

	const jsonPayload = JSON.stringify(
		{
			createdTags: result.createdTags,
			affectedBookmarks: result.affectedBookmarks.map((b) => ({
				id: b.id,
				title: b.title,
				tags: b.tags,
			})),
			skipped: result.skipped,
		},
		null,
		2,
	);

	return {
		toolName: "add_tags_to_bookmarks",
		summary: `${summaryMsg}\n\n${jsonPayload}`,
		items: [],
		references,
		isMutation: affectedCount > 0 || createdTagsCount > 0,
	};
}

/**
 * Tool Definition for TanStack AI
 */
export const addTagsToBookmarksToolDef = toolDefinition({
	name: "add_tags_to_bookmarks",
	description:
		"给书签打标签。支持单计划（bookmarkIds/itemNamesOrUrls + tags）与批量计划（plans 数组）。标签不存在时自动创建。仅做'追加'，不清除书签已有标签。",
	inputSchema: addTagsToBookmarksInputSchema,
});
