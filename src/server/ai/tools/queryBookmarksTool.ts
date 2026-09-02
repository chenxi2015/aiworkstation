import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";
import type { SearchResultItem } from "../../../components/workbench/types";
import { type BookmarkQueryParams, workbenchDb } from "../../db/sqlite.ts";
import { resolveTimeRange } from "./timeResolver";
import type { ToolExecutionResult } from "./types";

export const queryBookmarksInputSchema = z.object({
	timeRange: z
		.enum([
			"today",
			"yesterday",
			"this_week",
			"last_week",
			"this_month",
			"recent_7_days",
			"recent_30_days",
			"all",
		])
		.optional()
		.describe(
			"时间范围预设。例如：用户询问'本周收藏'填 this_week，'今天添加'填 today，'最近7天'填 recent_7_days，'上周'填 last_week，'本月'填 this_month",
		),
	startDate: z.string().optional().describe("起始日期 (格式 YYYY-MM-DD)"),
	endDate: z.string().optional().describe("截止日期 (格式 YYYY-MM-DD)"),
	folderName: z
		.string()
		.optional()
		.describe("所属文件夹或主题名称（模糊匹配）"),
	category: z
		.string()
		.optional()
		.describe("所属工作台大类（如：工作台、自媒体、技能、电商、收藏等）"),
	tag: z.string().optional().describe("标签名称过滤"),
	keyword: z
		.string()
		.optional()
		.describe("关键词过滤（匹配标题、摘要、描述或关键字）"),
	limit: z.number().optional().describe("返回数量上限，默认 20，最多 50"),
});

export type QueryBookmarksInput = z.infer<typeof queryBookmarksInputSchema>;

/**
 * Pure execution function to query bookmarks in SQLite
 */
export function executeQueryBookmarks(
	args: QueryBookmarksInput,
): ToolExecutionResult {
	const {
		timeRange,
		startDate,
		endDate,
		folderName,
		category,
		tag,
		keyword,
		limit = 20,
	} = args;

	const timeResolution = resolveTimeRange(timeRange, startDate, endDate);

	const queryParams: BookmarkQueryParams = {
		startTimeMs: timeResolution.startTimeMs,
		endTimeMs: timeResolution.endTimeMs,
		startDate: timeResolution.startDateStr,
		endDate: timeResolution.endDateStr,
		folderName,
		category,
		tag,
		keyword,
		limit: Math.min(Math.max(limit, 1), 50),
		sortBy: "date_added",
		sortOrder: "DESC",
	};

	const items = workbenchDb.queryBookmarks(queryParams);

	const references: SearchResultItem[] = items.map((item, idx) => ({
		...item,
		score: 1.0 - idx * 0.01,
		matchType: "keyword",
		matchReason: `精确查询命中 (${timeResolution.description})`,
	}));

	const filterDescs: string[] = [];
	if (timeResolution.description)
		filterDescs.push(`时间范围: ${timeResolution.description}`);
	if (folderName) filterDescs.push(`文件夹: ${folderName}`);
	if (category) filterDescs.push(`分类: ${category}`);
	if (tag) filterDescs.push(`标签: ${tag}`);
	if (keyword) filterDescs.push(`关键词: "${keyword}"`);

	const filterSummaryText =
		filterDescs.length > 0
			? `[查询条件: ${filterDescs.join(" | ")}]`
			: "[全库查询]";

	let summary = "";
	if (items.length === 0) {
		summary = `在 SQLite 数据库中执行查询 ${filterSummaryText}，未找到符合条件的书签数据。`;
	} else {
		const itemListText = items
			.map((item, i) => {
				const tagsText =
					item.tags && item.tags.length > 0
						? ` (标签: ${item.tags.join(", ")})`
						: "";
				const folderText = item.folderName
					? ` [文件夹: ${item.folderName}]`
					: "";
				const dateText = item.dateAdded
					? ` [收藏时间: ${new Date(item.dateAdded).toLocaleDateString()}]`
					: item.createdAt
						? ` [入库日期: ${item.createdAt}]`
						: "";
				const desc = item.summary || item.description || "无详细描述";
				return `${i + 1}. 《${item.name}》 (ID: ${item.id})${tagsText}${folderText}${dateText}\n   - URL: ${item.url || "无"}\n   - 简介: ${desc}`;
			})
			.join("\n\n");

		summary = `在 SQLite 数据库中执行查询 ${filterSummaryText}，成功检索到 ${items.length} 个书签：\n\n${itemListText}`;
	}

	return {
		toolName: "query_bookmarks",
		summary,
		items,
		references,
		isMutation: false,
	};
}

/**
 * Tool Definition for TanStack AI
 */
export const queryBookmarksToolDef = toolDefinition({
	name: "query_bookmarks",
	description:
		"按时间范围（今天/昨天/本周/上周/本月/最近7天等）、指定日期、所属分类/文件夹、标签或关键词，精准查询用户本地 SQLite 知识库中收藏的书签与工具列表。当用户询问最近收藏了什么、本周/今天存了什么网站、或特定分类下的全部收藏时必须调用此工具。",
	inputSchema: queryBookmarksInputSchema,
});
