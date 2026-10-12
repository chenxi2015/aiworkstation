import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";
import type { SearchResultItem } from "../../../components/workbench/types.ts";
import { getFetchOrchestrator } from "../search/fetch/orchestrator.ts";
import type { ToolExecutionResult } from "./types.ts";

export const webFetchInputSchema = z.object({
	url: z
		.string()
		.url()
		.describe("要抓取的网页 URL（http/https）"),
});

export type WebFetchInput = z.input<typeof webFetchInputSchema>;

export async function executeWebFetch(
	args: WebFetchInput,
): Promise<ToolExecutionResult> {
	const url = args.url?.trim();
	if (!url) {
		return {
			toolName: "web_fetch",
			summary: "URL 不能为空",
			items: [],
			references: [],
			isMutation: false,
		};
	}

	const orchestrator = getFetchOrchestrator();
	try {
		const result = await orchestrator.fetch(url);

		const references: SearchResultItem[] = [
			{
				id: `web_fetch_${Date.now()}`,
				name: result.title || result.finalUrl,
				url: result.finalUrl,
				type: "link",
				summary: result.markdown.slice(0, 200),
				description: result.title || result.finalUrl,
				score: 1.0,
				matchType: "keyword",
				matchReason: "网页正文抓取",
			},
		];

		const truncationNote = result.truncated
			? `\n\n---\n⚠️ 正文原始长度 ${result.originalLength} 字符，已截断为前 ${result.markdown.length} 字符。`
			: "";

		const summary = `已抓取「${result.title || result.finalUrl}」的正文内容（${result.originalLength} 字符${result.truncated ? "，已截断" : ""}）：

# ${result.title || result.finalUrl}

${result.markdown}${truncationNote}`;

		return {
			toolName: "web_fetch",
			summary,
			items: [],
			references,
			isMutation: false,
		};
	} catch (err: unknown) {
		const errMsg = err instanceof Error ? err.message : String(err);
		return {
			toolName: "web_fetch",
			summary: `抓取「${url}」失败: ${errMsg}`,
			items: [],
			references: [],
			isMutation: false,
		};
	}
}

export const webFetchToolDef = toolDefinition({
	name: "web_fetch",
	description:
		"抓取任意网页并转换为干净的 Markdown 正文。当 web_search 返回了感兴趣的链接、需要深读全文，或用户直接提供了一个 URL 需要阅读时使用。",
	inputSchema: webFetchInputSchema,
});
