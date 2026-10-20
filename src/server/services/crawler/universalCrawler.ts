import { getFetchOrchestrator } from "../../ai/search/fetch/orchestrator.ts";
import {
	awaitJobResult,
	type CrawlJobResult,
	createJob,
	isExtensionOnline,
} from "../../api/crawlerJobQueue.ts";

export interface ScrapedWebpage {
	success: boolean;
	title: string;
	markdown: string;
	html?: string;
	images: string[];
	finalUrl: string;
	source: "electron_chromium" | "native_fetch" | "cloud_reader";
	extractedBy?: "selector" | "article" | "full";
	skeleton?: CrawlJobResult["skeleton"];
	error?: string;
}

export interface ScrapeWebpageInput {
	url: string;
	selector?: string | null;
	waitMs?: number | null;
	mode?: "content" | "skeleton" | null;
	fullPage?: boolean;
}

const CHROMIUM_JOB_TIMEOUT_MS = 20_000;
const NATIVE_FETCH_TIMEOUT_MS = 10_000;

/**
 * Extract images and readable content from raw HTML
 */
function parseRawHtml(
	rawHtml: string,
	baseUrl: string,
): {
	title: string;
	markdown: string;
	images: string[];
} {
	// 1. Extract title (prioritize WeChat title, then OpenGraph, then <title>)
	const wxTitleMatch = rawHtml.match(
		/<h1[^>]*id=["']activity-name["'][^>]*>([\s\S]*?)<\/h1>/i,
	);
	const ogTitleMatch = rawHtml.match(
		/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i,
	);
	const titleTagMatch = rawHtml.match(/<title[^>]*>([\s\S]*?)<\/title>/i);

	const rawTitle =
		wxTitleMatch?.[1] || ogTitleMatch?.[1] || titleTagMatch?.[1] || "网页内容";
	const title = rawTitle.replace(/<[^>]+>/g, "").trim();

	// 2. Remove non-content scripts and styles
	let body = rawHtml
		.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
		.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
		.replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, " ")
		.replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, " ")
		.replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, " ")
		.replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, " ")
		.replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, " ")
		.replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, " ");

	// 3. Collect images and normalize lazy attributes
	const collectedImages: string[] = [];
	body = body.replace(/<img\b([^>]*?)>/gi, (_match, attrs) => {
		const dataSrcMatch = attrs.match(/\bdata-src=["']([^"']+)["']/i);
		const dataOriginalMatch = attrs.match(
			/\bdata-original(?:-src)?=["']([^"']+)["']/i,
		);
		const srcMatch = attrs.match(/\bsrc=["']([^"']+)["']/i);
		const altMatch = attrs.match(/\balt=["']([^"']*)["']/i);

		let realSrc = (
			dataSrcMatch?.[1] ||
			dataOriginalMatch?.[1] ||
			srcMatch?.[1] ||
			""
		).trim();

		if (
			realSrc.startsWith("data:image/svg") ||
			realSrc.startsWith("data:image/gif")
		) {
			realSrc = (dataSrcMatch?.[1] || dataOriginalMatch?.[1] || "").trim();
		}

		if (
			!realSrc ||
			realSrc.startsWith("data:") ||
			realSrc.includes("pixel") ||
			realSrc.includes("avatar")
		) {
			return "";
		}

		let absoluteUrl = realSrc;
		try {
			absoluteUrl = new URL(realSrc, baseUrl).href;
		} catch {
			// Ignore URL resolution failure
		}

		if (!collectedImages.includes(absoluteUrl)) {
			collectedImages.push(absoluteUrl);
		}

		const alt = altMatch ? altMatch[1].trim() : "网页配图";
		return `\n\n![${alt}](${absoluteUrl})\n\n`;
	});

	// 4. Convert basic block tags to linebreaks
	body = body
		.replace(/<\/h[1-6]>/gi, "\n\n")
		.replace(/<\/p>/gi, "\n\n")
		.replace(/<\/div>/gi, "\n")
		.replace(/<br\s*[/]?>/gi, "\n")
		.replace(/<li[^>]*>/gi, "\n- ");

	// 5. Strip all remaining HTML tags
	body = body.replace(/<[^>]+>/g, " ");

	// 6. Decode entities and format whitespace
	const decoded = body
		.replace(/&nbsp;/g, " ")
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.split("\n")
		.map((l) => l.trim())
		.filter(Boolean)
		.join("\n\n");

	return {
		title,
		markdown: decoded,
		images: collectedImages,
	};
}

/**
 * Tier 2: Fast native fetch scraper with header emulation and lazy image support
 */
async function scrapeViaNativeFetch(
	url: string,
): Promise<ScrapedWebpage | null> {
	try {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), NATIVE_FETCH_TIMEOUT_MS);

		const res = await fetch(url, {
			headers: {
				"User-Agent":
					"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
				Accept:
					"text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
				"Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
			},
			signal: controller.signal,
		});
		clearTimeout(timer);

		if (!res.ok) return null;

		const html = await res.text();
		const parsed = parseRawHtml(html, url);

		if (!parsed.markdown || parsed.markdown.length < 80) {
			return null;
		}

		return {
			success: true,
			title: parsed.title,
			markdown: parsed.markdown,
			images: parsed.images,
			finalUrl: url,
			source: "native_fetch",
			extractedBy: "article",
		};
	} catch {
		return null;
	}
}

/**
 * Tier 3: Cloud Reader fallback (Jina Reader / Tavily Extract)
 */
async function scrapeViaCloudReader(
	url: string,
): Promise<ScrapedWebpage | null> {
	try {
		const orchestrator = getFetchOrchestrator();
		const cloudRes = await orchestrator.fetch(url, { timeoutMs: 15_000 });
		if (!cloudRes?.markdown?.trim()) return null;

		// Extract any image markdown links from cloud output
		const images: string[] = [];
		const imgRegex = /!\[.*?\]\((https?:\/\/[^\s)]+)\)/g;
		let match = imgRegex.exec(cloudRes.markdown);
		while (match !== null) {
			if (match[1] && !images.includes(match[1])) {
				images.push(match[1]);
			}
			match = imgRegex.exec(cloudRes.markdown);
		}

		return {
			success: true,
			title: cloudRes.title || url,
			markdown: cloudRes.markdown,
			images,
			finalUrl: cloudRes.finalUrl || url,
			source: "cloud_reader",
			extractedBy: "full",
		};
	} catch {
		return null;
	}
}

/**
 * Universal Resilient Web Crawler Component:
 * Tier 1: Local Electron Chromium Crawler (fast, executes JS, extracts live DOM & data-src)
 * Tier 2: Fast Native Fetch Scraper (zero-cost, SSR/WeChat-ready)
 * Tier 3: Cloud Reader (Jina Reader / Tavily Extract)
 */
export async function scrapeWebpage(
	input: ScrapeWebpageInput,
): Promise<ScrapedWebpage> {
	const rawUrl = (input.url || "").trim();
	if (!rawUrl.startsWith("http://") && !rawUrl.startsWith("https://")) {
		return {
			success: false,
			title: "",
			markdown: "",
			images: [],
			finalUrl: rawUrl,
			source: "native_fetch",
			error: "无效的 URL 地址，必须以 http:// 或 https:// 开头",
		};
	}

	const jobMode = input.mode ?? "content";

	// ── Tier 1: Local Electron Chromium Crawler ──────────────────────────
	if (isExtensionOnline()) {
		try {
			const job = createJob({
				url: rawUrl,
				selector: input.selector ?? null,
				waitMs: input.waitMs ?? null,
				mode: jobMode,
				fullPage: input.fullPage ?? false,
			});

			const result = await awaitJobResult(job.id, CHROMIUM_JOB_TIMEOUT_MS);
			if (result?.success) {
				const hasValidContent =
					jobMode === "skeleton"
						? Boolean(result.skeleton && result.skeleton.length > 0)
						: Boolean(result.markdown?.trim());

				if (hasValidContent) {
					return {
						success: true,
						title: result.title || "未知网页",
						markdown: result.markdown || "",
						html: result.html,
						images: result.images ?? [],
						finalUrl: result.finalUrl || rawUrl,
						source: "electron_chromium",
						extractedBy: result.extractedBy,
						skeleton: result.skeleton,
					};
				}
			}
		} catch (err) {
			console.warn("[universalCrawler] Tier 1 Chromium crawl failed:", err);
		}
	}

	// If skeleton mode was requested, native/cloud fallbacks cannot provide DOM skeleton
	if (jobMode === "skeleton") {
		return {
			success: false,
			title: "",
			markdown: "",
			images: [],
			finalUrl: rawUrl,
			source: "electron_chromium",
			error: "骨架分析模式需要本地 Chromium 爬虫支持，当前服务未就绪",
		};
	}

	// ── Tier 2: Fast Native Fetch Scraper (SSR / WeChat Optimization) ──────
	const nativeResult = await scrapeViaNativeFetch(rawUrl);
	if (nativeResult) {
		return nativeResult;
	}

	// ── Tier 3: Cloud Reader (Jina Reader / Tavily Extract) ───────────────
	const cloudResult = await scrapeViaCloudReader(rawUrl);
	if (cloudResult) {
		return cloudResult;
	}

	return {
		success: false,
		title: "",
		markdown: "",
		images: [],
		finalUrl: rawUrl,
		source: "cloud_reader",
		error:
			"所有抓取通道均未能提取到有效正文，请检查网络或目标链接是否可公开访问",
	};
}
