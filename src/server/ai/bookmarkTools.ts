import type { SearchResultItem, WorkbenchItem } from "../../components/workbench/types";
import { type BookmarkQueryParams, workbenchDb } from "../db/sqlite.ts";

/**
 * Resolved time boundary range
 */
export interface ResolvedTimeRange {
	startTimeMs?: number;
	endTimeMs?: number;
	startDateStr?: string;
	endDateStr?: string;
	description: string;
}

/**
 * Result of tool execution
 */
export interface ToolExecutionResult {
	toolCallId: string;
	toolName: string;
	summary: string;
	items: WorkbenchItem[];
	references: SearchResultItem[];
}

/**
 * Helper to calculate precise start and end boundaries for time ranges
 */
export function resolveTimeRange(
	timeRange?: string,
	customStart?: string,
	customEnd?: string,
): ResolvedTimeRange {
	const now = new Date();

	// If explicit custom date range is provided
	if (customStart || customEnd) {
		const startMs = customStart
			? new Date(`${customStart}T00:00:00`).getTime()
			: undefined;
		const endMs = customEnd
			? new Date(`${customEnd}T23:59:59.999`).getTime()
			: undefined;
		return {
			startTimeMs: startMs,
			endTimeMs: endMs,
			startDateStr: customStart,
			endDateStr: customEnd,
			description: `${customStart || "起始"} 至 ${customEnd || "至今"}`,
		};
	}

	if (!timeRange || timeRange === "all") {
		return { description: "全部时间" };
	}

	const todayStart = new Date(
		now.getFullYear(),
		now.getMonth(),
		now.getDate(),
		0,
		0,
		0,
		0,
	);
	const todayEnd = new Date(
		now.getFullYear(),
		now.getMonth(),
		now.getDate(),
		23,
		59,
		59,
		999,
	);

	switch (timeRange) {
		case "today": {
			return {
				startTimeMs: todayStart.getTime(),
				endTimeMs: todayEnd.getTime(),
				startDateStr: todayStart.toISOString().split("T")[0],
				endDateStr: todayEnd.toISOString().split("T")[0],
				description: "今天",
			};
		}
		case "yesterday": {
			const yStart = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);
			const yEnd = new Date(todayStart.getTime() - 1);
			return {
				startTimeMs: yStart.getTime(),
				endTimeMs: yEnd.getTime(),
				startDateStr: yStart.toISOString().split("T")[0],
				endDateStr: yStart.toISOString().split("T")[0],
				description: "昨天",
			};
		}
		case "this_week": {
			// Monday as the first day of the week
			const day = now.getDay(); // 0 is Sunday, 1 is Monday...
			const diffToMonday = (day === 0 ? 6 : day - 1) * 24 * 60 * 60 * 1000;
			const weekStart = new Date(todayStart.getTime() - diffToMonday);
			return {
				startTimeMs: weekStart.getTime(),
				endTimeMs: todayEnd.getTime(),
				startDateStr: weekStart.toISOString().split("T")[0],
				endDateStr: todayEnd.toISOString().split("T")[0],
				description: "本周 (周一至今)",
			};
		}
		case "last_week": {
			const day = now.getDay();
			const diffToMonday = (day === 0 ? 6 : day - 1) * 24 * 60 * 60 * 1000;
			const lastWeekStart = new Date(
				todayStart.getTime() - diffToMonday - 7 * 24 * 60 * 60 * 1000,
			);
			const lastWeekEnd = new Date(
				todayStart.getTime() - diffToMonday - 1,
			);
			return {
				startTimeMs: lastWeekStart.getTime(),
				endTimeMs: lastWeekEnd.getTime(),
				startDateStr: lastWeekStart.toISOString().split("T")[0],
				endDateStr: lastWeekEnd.toISOString().split("T")[0],
				description: "上周",
			};
		}
		case "this_month": {
			const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
			return {
				startTimeMs: monthStart.getTime(),
				endTimeMs: todayEnd.getTime(),
				startDateStr: monthStart.toISOString().split("T")[0],
				endDateStr: todayEnd.toISOString().split("T")[0],
				description: "本月 (1号至今)",
			};
		}
		case "recent_7_days": {
			const past7Days = new Date(todayStart.getTime() - 6 * 24 * 60 * 60 * 1000);
			return {
				startTimeMs: past7Days.getTime(),
				endTimeMs: todayEnd.getTime(),
				startDateStr: past7Days.toISOString().split("T")[0],
				endDateStr: todayEnd.toISOString().split("T")[0],
				description: "最近 7 天",
			};
		}
		case "recent_30_days": {
			const past30Days = new Date(todayStart.getTime() - 29 * 24 * 60 * 60 * 1000);
			return {
				startTimeMs: past30Days.getTime(),
				endTimeMs: todayEnd.getTime(),
				startDateStr: past30Days.toISOString().split("T")[0],
				endDateStr: todayEnd.toISOString().split("T")[0],
				description: "最近 30 天",
			};
		}
		default: {
			return { description: timeRange };
		}
	}
}

/**
 * OpenAI / DeepSeek compatible Tool definitions
 */
export const BOOKMARK_AGENT_TOOLS = [
	{
		type: "function",
		function: {
			name: "query_bookmarks",
			description:
				"按时间范围（今天/昨天/本周/上周/本月/最近7天等）、指定日期、所属分类/文件夹、标签或关键词，精准查询用户本地 SQLite 知识库中收藏的书签与工具列表。当用户询问最近收藏了什么、本周/今天存了什么网站、或特定分类下的全部收藏时必须调用此工具。",
			parameters: {
				type: "object",
				properties: {
					timeRange: {
						type: "string",
						enum: [
							"today",
							"yesterday",
							"this_week",
							"last_week",
							"this_month",
							"recent_7_days",
							"recent_30_days",
							"all",
						],
						description:
							"时间范围预设。例如：用户询问'本周收藏'填 this_week，'今天添加'填 today，'最近7天'填 recent_7_days，'上周'填 last_week，'本月'填 this_month",
					},
					startDate: {
						type: "string",
						description: "起始日期 (格式 YYYY-MM-DD)",
					},
					endDate: {
						type: "string",
						description: "截止日期 (格式 YYYY-MM-DD)",
					},
					folderName: {
						type: "string",
						description: "所属文件夹或主题名称（模糊匹配）",
					},
					category: {
						type: "string",
						description: "所属工作台大类（如：工作台、自媒体、技能、电商、收藏等）",
					},
					tag: {
						type: "string",
						description: "标签名称过滤",
					},
					keyword: {
						type: "string",
						description: "关键词过滤（匹配标题、摘要、描述或关键字）",
					},
					limit: {
						type: "number",
						description: "返回数量上限，默认 20，最多 50",
					},
				},
			},
		},
	},
];

/**
 * Dispatcher: Execute requested tool call against SQLite database
 */
export async function executeBookmarkToolCall(
	toolCallId: string,
	toolName: string,
	argsJson: string | Record<string, any>,
): Promise<ToolExecutionResult> {
	let parsedArgs: Record<string, any> = {};
	if (typeof argsJson === "string") {
		try {
			parsedArgs = JSON.parse(argsJson || "{}");
		} catch {
			parsedArgs = {};
		}
	} else {
		parsedArgs = argsJson || {};
	}

	if (toolName === "query_bookmarks") {
		const {
			timeRange,
			startDate,
			endDate,
			folderName,
			category,
			tag,
			keyword,
			limit = 20,
		} = parsedArgs;

		// 1. Resolve time boundary
		const timeResolution = resolveTimeRange(timeRange, startDate, endDate);

		// 2. Query SQLite
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

		// 3. Format into references for frontend
		const references: SearchResultItem[] = items.map((item, idx) => ({
			...item,
			score: 1.0 - idx * 0.01,
			matchType: "keyword",
			matchReason: `精确查询命中 (${timeResolution.description})`,
		}));

		// 4. Construct descriptive summary for LLM context
		const filterDescs: string[] = [];
		if (timeResolution.description)
			filterDescs.push(`时间范围: ${timeResolution.description}`);
		if (folderName) filterDescs.push(`文件夹: ${folderName}`);
		if (category) filterDescs.push(`分类: ${category}`);
		if (tag) filterDescs.push(`标签: ${tag}`);
		if (keyword) filterDescs.push(`关键词: "${keyword}"`);

		const filterSummaryText =
			filterDescs.length > 0 ? `[查询条件: ${filterDescs.join(" | ")}]` : "[全库查询]";

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
					const desc =
						item.summary || item.description || "无详细描述";
					return `${i + 1}. 《${item.name}》${tagsText}${folderText}${dateText}\n   - URL: ${item.url || "无"}\n   - 简介: ${desc}`;
				})
				.join("\n\n");

			summary = `在 SQLite 数据库中执行查询 ${filterSummaryText}，成功检索到 ${items.length} 个书签：\n\n${itemListText}`;
		}

		return {
			toolCallId,
			toolName,
			summary,
			items,
			references,
		};
	}

	return {
		toolCallId,
		toolName,
		summary: `未知工具名称: ${toolName}`,
		items: [],
		references: [],
	};
}
