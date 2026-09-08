import fs from "node:fs";
import path from "node:path";
import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";
import {
	awaitJobResult,
	type CrawlSkeletonBlock,
	createJob,
	isExtensionOnline,
} from "../../api/crawlerJobQueue.ts";
import { DB_DIR } from "../../db/connection.ts";
import { executeReadWebpage } from "./readWebpageTool.ts";
import type { ToolExecutionResult } from "./types.ts";

export const crawlWebpageViaExtensionInputSchema = z
	.object({
		url: z.string().describe("需要抓取的完整网页 URL 地址"),
		selector: z
			.string()
			.nullable()
			.optional()
			.describe(
				"可选 CSS 选择器，精准提取目标选区（例如 article.main、#content），匹配多个元素时自动合并全部匹配内容，支持「h2:nth-of-type(2) ~ *」这类兄弟选择器做分段提取。缺省时自动识别正文区域",
			),
		waitMs: z
			.number()
			.int()
			.min(0)
			.max(10_000)
			.nullable()
			.optional()
			.describe("页面加载完成后的额外渲染等待毫秒数（SPA 场景），默认 1500"),
		mode: z
			.enum(["content", "skeleton"])
			.nullable()
			.optional()
			.describe(
				"抓取模式：content（默认，直接返回正文 Markdown）；skeleton（只返回页面候选内容区块的结构骨架，不返回正文，用于让 AI 先分析页面结构再决定精准提取哪些区域）",
			),
		fullPage: z
			.boolean()
			.nullable()
			.optional()
			.describe(
				"完整正文落盘模式：抓取完整正文并保存为本地 Markdown 文件，工具只返回文件路径和内容预览（不占用 AI 上下文）。当用户要求「完整全文/不加工的原始内容/保存网页」时务必使用本模式，而不是在 content 模式下反复分段抓取",
			),
	})
	.passthrough();

export type CrawlWebpageViaExtensionInput = z.infer<
	typeof crawlWebpageViaExtensionInputSchema
>;

const MAX_MARKDOWN_LENGTH = 4000;
const JOB_RESULT_TIMEOUT_MS = 60_000;

/** fullPage 落盘目录：与 SQLite 同级的 .aiworkstation/pages/ */
const PAGES_DIR = path.join(DB_DIR, "pages");

/**
 * Saves the full crawled markdown to .aiworkstation/pages/ and returns the
 * absolute file path. Mirrors how mainstream agents hand off large content:
 * file on disk + path in context, instead of blowing up the prompt.
 */
function saveFullPageToFile(
	title: string,
	finalUrl: string,
	markdown: string,
): string {
	if (!fs.existsSync(PAGES_DIR)) {
		fs.mkdirSync(PAGES_DIR, { recursive: true });
	}
	const safeTitle =
		title
			.replace(/[\\/:*?"<>|]/g, "")
			.replace(/\s+/g, " ")
			.trim()
			.slice(0, 60) || "untitled";
	const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 12);
	const filePath = path.join(PAGES_DIR, `${stamp}-${safeTitle}.md`);
	const fileContent = `# ${title}\n\n> 来源：${finalUrl}\n> 抓取时间：${new Date().toLocaleString("zh-CN")}\n\n---\n\n${markdown}\n`;
	fs.writeFileSync(filePath, fileContent, "utf8");
	return filePath;
}

/**
 * Short-lived per-URL result cache. The agent loop tends to re-crawl the same
 * URL when it misreads a truncated result as a failed extraction; serving the
 * cached result makes such repeats instant instead of opening a fresh hidden
 * tab (5-15s) every time.
 */
const RESULT_CACHE_TTL_MS = 10 * 60 * 1000;
const resultCache = new Map<string, { at: number; summary: string }>();

function readCache(key: string): string | null {
	const hit = resultCache.get(key);
	if (!hit) return null;
	if (Date.now() - hit.at > RESULT_CACHE_TTL_MS) {
		resultCache.delete(key);
		return null;
	}
	return hit.summary;
}

function writeCache(key: string, summary: string): void {
	if (resultCache.size > 100) {
		const oldest = resultCache.keys().next().value;
		if (oldest) resultCache.delete(oldest);
	}
	resultCache.set(key, { at: Date.now(), summary });
}

function formatSkeletonSummary(
	title: string,
	finalUrl: string,
	skeleton: CrawlSkeletonBlock[],
): string {
	const lines = skeleton.map(
		(block) =>
			`#${block.index} <${block.tag}${block.className ? ` class="${block.className}"` : ""}> selector 可用 "${block.cssPath}"｜文本 ${block.textLength} 字符｜链接密度 ${block.linkDensity}｜子元素 ${block.childCount} 个\n   预览：${block.preview}`,
	);
	return `[插件静默爬虫通道 · 骨架模式] 页面《${title}》（URL: ${finalUrl}）共识别 ${skeleton.length} 个候选内容区块（按文本量降序）：\n\n${lines.join("\n")}\n\n[系统提示] 骨架分析完成，未返回正文。请根据用户意图选定目标区块（导航/列表通常链接密度高，正文通常文本长且链接密度低），然后再次调用本工具，mode 保持默认 content，并把 selector 设为所选区块的 cssPath（或其简化形式，如 "article.content"），即可精准提取该区域内容。`;
}

/**
 * Graceful degradation: fall back to the lightweight native fetch channel
 * when the extension is offline or the crawl fails/times out.
 */
async function fallbackToNativeFetch(
	url: string,
	reason: string,
): Promise<ToolExecutionResult> {
	const fallback = await executeReadWebpage({ url, targetHint: null });
	return {
		...fallback,
		toolName: "crawl_webpage_via_extension",
		summary: `[原生 fetch 通道 · ${reason}] ${fallback.summary}`,
	};
}

/**
 * Dispatches a silent crawl job to the AI Collector extension: the extension
 * background worker opens a hidden tab with the user's real browser session
 * (logged-in cookies, SPA rendering), extracts content, and closes the tab.
 */
export async function executeCrawlWebpageViaExtension(
	args: CrawlWebpageViaExtensionInput,
): Promise<ToolExecutionResult> {
	const rawUrl = (args.url || "").trim();
	if (!rawUrl || !rawUrl.startsWith("http")) {
		return {
			toolName: "crawl_webpage_via_extension",
			summary: `抓取失败：无效的 URL 地址「${rawUrl}」`,
			items: [],
			references: [],
			isMutation: false,
		};
	}

	if (!isExtensionOnline()) {
		return fallbackToNativeFetch(rawUrl, "插件未安装或离线，已自动降级");
	}

	const jobMode = args.mode ?? "content";
	const wantFullPage = args.fullPage === true;
	const cacheKey = `${rawUrl}::${args.selector ?? ""}::${jobMode}::${wantFullPage ? "full" : "part"}`;
	const cached = readCache(cacheKey);
	if (cached) {
		return {
			toolName: "crawl_webpage_via_extension",
			summary: `[缓存命中] 该 URL 10 分钟内已抓取过，直接返回上次结果，无需重复抓取：\n\n${cached}`,
			items: [],
			references: [],
			isMutation: false,
		};
	}

	const job = createJob({
		url: rawUrl,
		selector: args.selector ?? null,
		waitMs: args.waitMs ?? null,
		mode: jobMode,
		fullPage: wantFullPage,
	});
	const result = await awaitJobResult(job.id, JOB_RESULT_TIMEOUT_MS);

	if (!result) {
		return fallbackToNativeFetch(rawUrl, "插件抓取超时，已自动降级");
	}

	if (!result.success || (jobMode !== "skeleton" && !result.markdown?.trim())) {
		const reason = result.error || "插件未能提取到有效正文";
		return fallbackToNativeFetch(rawUrl, `${reason}，已自动降级`);
	}

	const title = result.title?.trim() || "未知网页";
	const finalUrl = result.finalUrl || rawUrl;

	if (jobMode === "skeleton") {
		const skeleton = result.skeleton ?? [];
		const summary = formatSkeletonSummary(title, finalUrl, skeleton);
		writeCache(cacheKey, summary);
		return {
			toolName: "crawl_webpage_via_extension",
			summary,
			items: [],
			references: [],
			isMutation: false,
		};
	}

	const selectorInfo =
		result.extractedBy === "selector"
			? `，按选择器「${args.selector}」定向提取`
			: result.extractedBy === "article"
				? "，自动识别正文区域"
				: "，提取整页内容";
	// content 模式下守卫已确保 markdown 非空
	const full = result.markdown?.trim() ?? "";

	// fullPage 落盘模式：全文写文件，只回路径 + 预览，不进 AI 上下文
	if (wantFullPage) {
		const totalLength =
			typeof result.totalLength === "number" ? result.totalLength : full.length;
		const filePath = saveFullPageToFile(title, finalUrl, full);
		const preview = full.slice(0, 500);
		const extTruncatedNote =
			result.truncated === true
				? "（注意：正文超过扩展单页 500KB 上限，文件内容为前 500KB）"
				: "";
		const summary = `[插件静默爬虫通道 · 完整正文落盘] 成功抓取网页《${title}》（URL: ${finalUrl}）${selectorInfo}，完整正文（共 ${totalLength} 字符）已保存到本地文件：\n\n${filePath}\n\n${extTruncatedNote}内容预览（前 500 字符）：\n\n${preview}\n\n[系统提示] 完整正文已在上述文件中。给用户回复时，把上述文件路径用反引号包裹后原样给出（例如：\`${filePath}\`），工作台会把它渲染成可点击按钮，点击即用系统默认程序打开文件。禁止用同一 URL 重复抓取；如需基于正文内容回答，基于预览和已有信息说明即可，必要时可用 selector 定向提取某一段。`;
		writeCache(cacheKey, summary);
		return {
			toolName: "crawl_webpage_via_extension",
			summary,
			items: [],
			references: [],
			isMutation: false,
		};
	}

	const markdown = full.slice(0, MAX_MARKDOWN_LENGTH);
	const totalLength =
		typeof result.totalLength === "number" ? result.totalLength : full.length;
	const isTruncated =
		result.truncated === true || full.length > MAX_MARKDOWN_LENGTH;
	const truncationNote = isTruncated
		? `\n\n[系统提示] 抓取已成功。网页正文共约 ${totalLength} 字符，上方展示前 ${markdown.length} 字符（单次返回上限）。这属于正常的完整抓取结果，禁止用同一 URL 重复调用本工具重试；若用户需要完整全文，请改用 fullPage: true 重新调用一次，完整正文会保存为本地文件并返回路径；如只需后续某个片段，可用 selector 参数定位更具体的正文容器后再提取一次。`
		: `\n\n[系统提示] 抓取已成功，上方即为全部正文（共 ${markdown.length} 字符），内容完整，无需再次调用本工具。`;

	const summary = `[插件静默爬虫通道] 成功抓取网页《${title}》（URL: ${finalUrl}）${selectorInfo}，整洁 Markdown 正文如下：\n\n${markdown}${truncationNote}`;

	writeCache(cacheKey, summary);

	return {
		toolName: "crawl_webpage_via_extension",
		summary,
		items: [],
		references: [],
		isMutation: false,
	};
}

/**
 * TanStack AI Tool Definition for silent webpage crawling via the extension
 */
export const crawlWebpageViaExtensionToolDef = toolDefinition({
	name: "crawl_webpage_via_extension",
	description:
		"抓取网页正文的【默认首选】工具：通过 Chrome 插件在后台静默打开标签页抓取（携带用户真实登录态 Cookie，可突破 SPA 动态渲染与反爬限制），支持指定 CSS 选择器精准提取选区并返回整洁 Markdown 正文；插件未安装或离线时会自动降级为原生 fetch 抓取，保证有结果返回。三种用法按场景选择：①默认 content 模式——凡是需要阅读网页/文章/链接正文的场景，一律优先使用；②用户要「完整全文/不加工的原始内容/保存网页」时——务必传 fullPage: true，完整正文会保存为本地 Markdown 文件并返回文件路径，不要在 content 模式下分段反复抓取；③用户要页面的特定结构化区域（如导航菜单、评论列表、侧边栏等）时——先 mode='skeleton' 获取页面结构骨架（不返回正文），选定目标区块后再带 selector 参数精准提取。仅在本工具明确返回失败后，才使用 read_webpage_content 兜底排查。重要：本工具每次调用开销较大（需新开页面渲染，约 5-15 秒），同一 URL 的结果会缓存 10 分钟；只要返回内容开头标注「成功抓取」，无论是否标注「已截断」，都视为抓取成功，禁止对同一 URL 重复调用本工具，直接基于已有内容回答用户。",
	inputSchema: crawlWebpageViaExtensionInputSchema,
});
