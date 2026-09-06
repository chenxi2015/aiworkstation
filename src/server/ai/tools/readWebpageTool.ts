import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";
import type { ToolExecutionResult } from "./types.ts";

export const readWebpageInputSchema = z
	.object({
		url: z.string().describe("需要抓取和分析正文的完整网页 URL 地址"),
		targetHint: z
			.string()
			.nullable()
			.optional()
			.describe("抓取意图提示（例如：核心介绍、项目定位、技术文档等）"),
	})
	.passthrough();

export type ReadWebpageInput = z.infer<typeof readWebpageInputSchema>;

/**
 * Clean raw HTML content into readable plain text / lightweight markdown
 */
function cleanHtmlContent(rawHtml: string): { title: string; text: string } {
	// 1. Extract title
	const titleMatch = rawHtml.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
	const title = titleMatch ? titleMatch[1].trim() : "未知网页";

	// 2. Remove noisy tags and scripts
	let text = rawHtml
		.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
		.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
		.replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, " ")
		.replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, " ")
		.replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, " ")
		.replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, " ")
		.replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, " ");

	// 3. Convert basic heading and paragraph linebreaks
	text = text
		.replace(/<\/h[1-6]>/gi, "\n\n")
		.replace(/<\/p>/gi, "\n\n")
		.replace(/<\/div>/gi, "\n")
		.replace(/<br\s*[/]?>/gi, "\n")
		.replace(/<li[^>]*>/gi, "\n- ");

	// 4. Strip remaining HTML tags
	text = text.replace(/<[^>]+>/g, " ");

	// 5. Decode common HTML entities
	text = text
		.replace(/&nbsp;/g, " ")
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'");

	// 6. Normalize whitespaces and blank lines
	const lines = text
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line.length > 0);

	const cleanedText = lines.join("\n").slice(0, 4000);

	return {
		title,
		text: cleanedText,
	};
}

/**
 * Executes webpage fetching and content extraction
 */
export async function executeReadWebpage(
	args: ReadWebpageInput,
): Promise<ToolExecutionResult> {
	const rawUrl = (args.url || "").trim();
	if (!rawUrl || !rawUrl.startsWith("http")) {
		return {
			toolName: "read_webpage_content",
			summary: `抓取失败：无效的 URL 地址「${rawUrl}」`,
			items: [],
			references: [],
			isMutation: false,
		};
	}

	try {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), 8000);

		const response = await fetch(rawUrl, {
			headers: {
				"User-Agent":
					"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
				Accept:
					"text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
				"Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
			},
			signal: controller.signal,
		});
		clearTimeout(timeout);

		if (!response.ok) {
			return {
				toolName: "read_webpage_content",
				summary: `网页抓取失败 (HTTP ${response.status}): 无法获取目标网址内容。`,
				items: [],
				references: [],
				isMutation: false,
			};
		}

		const html = await response.text();
		const { title, text } = cleanHtmlContent(html);

		if (!text) {
			return {
				toolName: "read_webpage_content",
				summary: `成功抓取网页《${title}》，但未提取到实质文字正文（可能由客户端 JS 动态渲染）。`,
				items: [],
				references: [],
				isMutation: false,
			};
		}

		const summary = `成功抓取并解析网页《${title}》（URL: ${rawUrl}）的正文内容如下（已精简提取）：\n\n${text}`;

		return {
			toolName: "read_webpage_content",
			summary,
			items: [],
			references: [],
			isMutation: false,
		};
	} catch (err: unknown) {
		const errMsg = err instanceof Error ? err.message : String(err);
		return {
			toolName: "read_webpage_content",
			summary: `抓取目标网页失败 (${errMsg}): 可能由于跨域、网络超时或站点防爬限制。`,
			items: [],
			references: [],
			isMutation: false,
		};
	}
}

/**
 * TanStack AI Tool Definition for reading and scraping web pages
 */
export const readWebpageToolDef = toolDefinition({
	name: "read_webpage_content",
	description:
		"抓取并提取指定网页链接的真实标题与正文文本。当用户在上下文中引用了书签/链接并要求分析网页、阅读文章、爬取内容或深入解读项目时，必须调用此工具获取最新网页正文后再行作答。",
	inputSchema: readWebpageInputSchema,
});
