import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";
import type { SearchResultItem } from "../../../components/workbench/types.ts";
import { getSearchProvider } from "../search/index.ts";
import type { ToolExecutionResult } from "./types.ts";

export const webSearchInputSchema = z.object({
	query: z
		.string()
		.min(1)
		.max(200)
		.describe(
			"搜索关键词或检索提问短语（例如：「DeepSeek V3 核心架构创新」、「2025 AI 发展趋势报告」）",
		),
	maxResults: z
		.number()
		.optional()
		.default(5)
		.describe("返回搜索结果条数上限，默认 5 条"),
});

export type WebSearchInput = z.input<typeof webSearchInputSchema>;

export async function executeWebSearch(
	args: WebSearchInput,
): Promise<ToolExecutionResult> {
	const query = args.query.trim();
	if (!query) {
		return {
			toolName: "web_search",
			summary: "搜索关键词不能为空",
			items: [],
			references: [],
			isMutation: false,
		};
	}

	const provider = getSearchProvider();
	const maxResults = args.maxResults ?? 5;

	try {
		const rawResults = await provider.search(query, { maxResults });

		if (rawResults.length === 0) {
			return {
				toolName: "web_search",
				summary: `联网搜索「${query}」未检索到有效结果，请尝试更换关键词。`,
				items: [],
				references: [],
				isMutation: false,
			};
		}

		const references: SearchResultItem[] = rawResults.map((r, idx) => ({
			id: `web_ref_${Date.now()}_${idx}`,
			name: r.title,
			url: r.url,
			type: "link",
			summary: r.snippet,
			description: r.snippet,
			score: Math.max(0.1, Number((1.0 - idx * 0.05).toFixed(2))),
			matchType: "keyword",
			matchReason: "网络搜索结果",
		}));

		const formattedSummary = rawResults
			.map(
				(r, i) =>
					`${i + 1}. [${r.title}](${r.url})\n   摘要: ${r.snippet || "无简介"}`,
			)
			.join("\n\n");

		return {
			toolName: "web_search",
			summary: `已为你检索到 ${rawResults.length} 条关于「${query}」的网络信息：\n\n${formattedSummary}`,
			items: [],
			references,
			isMutation: false,
		};
	} catch (err: unknown) {
		const errMsg = err instanceof Error ? err.message : String(err);
		return {
			toolName: "web_search",
			summary: `联网搜索「${query}」失败: ${errMsg}`,
			items: [],
			references: [],
			isMutation: false,
		};
	}
}

export const webSearchToolDef = toolDefinition({
	name: "web_search",
	description:
		"通过互联网搜索最新资讯、技术文档、实时新闻、行业报告与事实论据。当需要查证事实、获取外部最新参考信息、或者用户提问当前文档库未收录的新知识时调用。",
	inputSchema: webSearchInputSchema,
});
