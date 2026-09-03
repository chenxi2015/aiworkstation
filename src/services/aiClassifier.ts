import { chat } from "@tanstack/ai";
import { openaiCompatibleText } from "@tanstack/ai-openai/compatible";
import { z } from "zod";
import type {
	AIClassificationResult,
	BookmarkTDKItem,
	ItemType,
	WorkbenchSettings,
} from "../components/workbench/types";

export const DEFAULT_DEEPSEEK_KEY =
	(typeof import.meta !== "undefined" &&
		import.meta.env?.VITE_DEEPSEEK_API_KEY) ||
	(typeof process !== "undefined" ? process.env?.DEEPSEEK_API_KEY : "") ||
	"";
export const DEFAULT_DEEPSEEK_BASE_URL =
	(typeof import.meta !== "undefined" &&
		import.meta.env?.VITE_DEEPSEEK_BASE_URL) ||
	(typeof process !== "undefined" ? process.env?.DEEPSEEK_BASE_URL : "") ||
	"https://api.deepseek.com";
export const DEFAULT_DEEPSEEK_MODEL =
	(typeof import.meta !== "undefined" &&
		import.meta.env?.VITE_DEEPSEEK_MODEL) ||
	(typeof process !== "undefined" ? process.env?.DEEPSEEK_MODEL : "") ||
	"deepseek-chat";

/**
 * Zod Schema for TanStack AI structured classification output
 */
const classificationItemSchema = z.object({
	id: z.union([z.string(), z.number()]).describe("书签唯一ID"),
	title: z.string().describe("书签名称/标题"),
	url: z.string().describe("书签URL"),
	category: z.string().describe("所属工作台大分类"),
	folderName: z.string().describe("所属主题文件夹名称"),
	folderDesc: z.string().describe("主题文件夹简短说明"),
	itemType: z
		.enum(["tool", "link", "doc", "skill", "note"])
		.describe("条目类型"),
	summary: z.string().describe("中文一句话摘要说明"),
	tags: z.array(z.string()).describe("2-3个中文主题标签"),
	reason: z.string().describe("归类理由"),
});

const classificationBatchSchema = z.object({
	items: z.array(classificationItemSchema).describe("分类结果列表"),
});

/**
 * Options for AI bookmark classification
 */
export interface ClassifyOptions {
	settings?: Partial<WorkbenchSettings>;
	existingCategories: string[];
	existingFolders: Array<{ name: string; category: string; desc?: string }>;
	onProgress?: (current: number, total: number, message: string) => void;
	signal?: AbortSignal;
}

/**
 * AI Classifier service powered by TanStack AI Native chat() + Structured Outputs
 */
export class AIClassifierService {
	/**
	 * Classify a single batch of bookmark TDK items using TanStack AI
	 */
	private static async classifyBatch(
		batch: BookmarkTDKItem[],
		existingCategories: string[],
		existingFolders: Array<{ name: string; category: string }>,
		settings: Partial<WorkbenchSettings>,
		signal?: AbortSignal,
	): Promise<AIClassificationResult[]> {
		const apiKey = settings.deepseekApiKey || DEFAULT_DEEPSEEK_KEY;
		const baseUrl = (
			settings.deepseekBaseUrl || DEFAULT_DEEPSEEK_BASE_URL
		).replace(/\/+$/, "");
		const model = settings.deepseekModel || DEFAULT_DEEPSEEK_MODEL;

		if (!apiKey) {
			throw new Error("DeepSeek API Key is required for classification");
		}

		const systemPrompt = `You are an expert AI content organizer and taxonomy architect for an AI Workstation.
Your task is to analyze an array of web bookmarks with their TDK metadata (Title, Description, Keywords, URL, and folder hierarchy) and categorize them into appropriate workspace categories and theme folders.

Available workspace categories:
${JSON.stringify(existingCategories)}

Existing reference folders:
${JSON.stringify(existingFolders.slice(0, 30))}

Guidelines for categorization:
1. "category": Pick the most fitting workspace category from the available list, or suggest a new logical category if none fits.
2. "folderName": Pick an existing folder name if the topic matches well, or create a concise 2-6 word topic folder name (e.g. "Prompt工程", "短视频剪辑", "电商选品", "前端开发", "AI绘图", "推特运营").
3. "folderDesc": A brief 1-sentence description of the folder's theme.
4. "itemType": Must be strictly one of ["tool", "link", "doc", "skill", "note"]:
   - "tool": Interactive SaaS, online tools, calculators, generators, extensions, dev platforms.
   - "link": Informational links, blogs, social profiles, repositories, articles, news.
   - "doc": Official documentation, cheat-sheets, guides, tutorials, specifications.
   - "skill": Automation workflows, prompts, agents, scripts, CLI tools.
   - "note": Notes, inspirations, references, materials.
5. "summary": A concise 1-sentence summary (in Chinese) explaining what this website is.
6. "tags": An array of 2-3 relevant topic tags in Chinese.
7. "reason": Brief justification for the classification.`;

		const userPayload = batch.map((item) => ({
			id: item.id,
			title: item.title,
			url: item.url,
			description: item.description || "",
			keywords: item.keywords || "",
			folderPath: item.folderPath || item.parentTitle || "",
		}));

		// 1. Create TanStack AI OpenAI-compatible adapter
		const adapter = openaiCompatibleText(model, {
			baseURL: baseUrl,
			apiKey,
			dangerouslyAllowBrowser: true,
		});

		// 2. Setup cancellation controller
		const abortController = new AbortController();
		if (signal) {
			if (signal.aborted) {
				abortController.abort();
			} else {
				signal.addEventListener("abort", () => abortController.abort(), {
					once: true,
				});
			}
		}

		// 3. Execute TanStack AI chat() with structured outputSchema
		const response = await chat({
			adapter,
			systemPrompts: [systemPrompt],
			messages: [
				{
					role: "user",
					content: `Please classify the following ${batch.length} bookmarks:\n${JSON.stringify(userPayload, null, 2)}`,
				},
			],
			outputSchema: classificationBatchSchema,
			stream: false,
			abortController,
		});

		const parsedItems = response?.items || [];

		// 3. Map and validate results
		return batch.map((item) => {
			const matched = parsedItems.find(
				(p) => String(p.id) === String(item.id) || p.url === item.url,
			);

			const itemType = (matched?.itemType || "link") as ItemType;

			return {
				id: item.id,
				title: item.title || matched?.title || item.url,
				url: item.url,
				category: matched?.category || "未分类",
				folderName: matched?.folderName || item.parentTitle || "常用收藏",
				folderDesc: matched?.folderDesc || "",
				itemType,
				summary: matched?.summary || item.title,
				tags: Array.isArray(matched?.tags) ? matched.tags : [],
				reason: matched?.reason || "Based on TDK analysis",
			};
		});
	}

	/**
	 * Classify all bookmarks in chunks with progress reporting
	 */
	static async classifyBookmarks(
		bookmarks: BookmarkTDKItem[],
		options: ClassifyOptions,
	): Promise<AIClassificationResult[]> {
		if (!bookmarks || bookmarks.length === 0) {
			return [];
		}

		const batchSize = options.settings?.batchSize || 15;
		const results: AIClassificationResult[] = [];
		const total = bookmarks.length;

		for (let i = 0; i < total; i += batchSize) {
			if (options.signal?.aborted) {
				throw new Error("AI classification cancelled");
			}

			const chunk = bookmarks.slice(i, i + batchSize);
			const chunkIndex = Math.floor(i / batchSize) + 1;
			const totalChunks = Math.ceil(total / batchSize);

			options.onProgress?.(
				i,
				total,
				`正在由 DeepSeek 分析第 ${chunkIndex}/${totalChunks} 批书签 TDK (${chunk.length} 个)...`,
			);

			try {
				const batchResults = await this.classifyBatch(
					chunk,
					options.existingCategories,
					options.existingFolders,
					options.settings || {},
					options.signal,
				);
				results.push(...batchResults);
			} catch (err: any) {
				console.warn(
					`Batch ${chunkIndex} AI classification failed, using fallback:`,
					err,
				);
				// Fallback to heuristic classification on batch failure
				const fallbackBatch = chunk.map((item) => ({
					id: item.id,
					title: item.title,
					url: item.url,
					category: "未分类",
					folderName: item.parentTitle || "常用收藏",
					folderDesc: "未分类书签归集",
					itemType: (item.url.includes("github.com")
						? "tool"
						: "link") as ItemType,
					summary: item.title,
					tags: item.keywords ? item.keywords.split(",").slice(0, 3) : [],
					reason: `AI classification error: ${err?.message || "Unknown error"}`,
				}));
				results.push(...fallbackBatch);
			}
		}

		options.onProgress?.(total, total, `分类完成，共处理 ${total} 个书签`);
		return results;
	}
}
