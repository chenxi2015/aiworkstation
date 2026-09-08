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
const MAX_TEXT_LENGTH = 4000;

function cleanHtmlContent(rawHtml: string): {
	title: string;
	text: string;
	totalLength: number;
	truncated: boolean;
} {
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

	const fullText = lines.join("\n");
	const cleanedText = fullText.slice(0, MAX_TEXT_LENGTH);

	return {
		title,
		text: cleanedText,
		totalLength: fullText.length,
		truncated: fullText.length > MAX_TEXT_LENGTH,
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
		const { title, text, totalLength, truncated } = cleanHtmlContent(html);

		if (!text) {
			return {
				toolName: "read_webpage_content",
				summary: `成功抓取网页《${title}》，但未提取到实质文字正文（可能由客户端 JS 动态渲染）。`,
				items: [],
				references: [],
				isMutation: false,
			};
		}

		const truncationNote = truncated
			? `\n\n[系统提示] 抓取已成功。网页文本共约 ${totalLength} 字符，上方展示前 ${text.length} 字符（单次返回上限）。这属于正常的完整抓取结果，禁止用同一 URL 重复调用本工具重试；如需更完整正文，请改用 crawl_webpage_via_extension 并配合 selector 参数精准定位。`
			: `\n\n[系统提示] 抓取已成功，上方即为全部正文（共 ${text.length} 字符），内容完整，无需再次调用本工具。`;

		const summary = `成功抓取并解析网页《${title}》（URL: ${rawUrl}）的正文内容如下（已精简提取）：\n\n${text}${truncationNote}`;

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
		"轻量级原生 fetch 网页抓取（不携带登录态，易被 SPA 动态渲染与反爬拦截导致正文为空）。仅在 crawl_webpage_via_extension 插件爬虫明确返回失败时，作为兜底排查手段使用；常规网页正文抓取请优先使用 crawl_webpage_via_extension。重要：只要返回内容开头标注「成功抓取」，无论是否标注「已截断」，都视为抓取成功，禁止对同一 URL 重复调用抓取类工具，直接基于已有内容回答用户。",
	inputSchema: readWebpageInputSchema,
});
