import { chat } from "@tanstack/ai";
import { openaiCompatibleText } from "@tanstack/ai-openai/compatible";
import type {
	AIClassificationResult,
	BookmarkTDKItem,
	WorkbenchSettings,
} from "../components/workbench/types";
import {
	buildClassifySystemPrompt,
	buildUserPayload,
} from "./classifier/promptBuilder";
import {
	buildFallbackResults,
	extractAndParseJSON,
	mapAIResponseToResults,
} from "./classifier/responseParser";
import {
	DEFAULT_LLM_BASE_URL,
	DEFAULT_LLM_KEY,
	DEFAULT_LLM_MODEL,
	UNIVERSAL_CATEGORY_DOMAINS,
} from "./classifier/taxonomy";
import { runBatchWorkerPool } from "./classifier/workerPool";
import {
	fetchSettingsFromDb,
	getEffectiveLLMConfig,
} from "./storage/settingsStorage";

export {
	DEFAULT_LLM_BASE_URL,
	DEFAULT_LLM_KEY,
	DEFAULT_LLM_MODEL,
	UNIVERSAL_CATEGORY_DOMAINS,
};

/**
 * Options for AI bookmark classification
 */
export interface ClassifyOptions {
	settings?: Partial<WorkbenchSettings>;
	existingCategories: string[];
	existingFolders: Array<{ name: string; category: string; desc?: string }>;
	concurrency?: number;
	onProgress?: (current: number, total: number, message: string) => void;
	onBatchComplete?: (batchResults: AIClassificationResult[]) => void;
	onLog?: (log: string) => void;
	signal?: AbortSignal;
}

/**
 * AI Classifier service powered by TanStack AI Native chat()
 */
export class AIClassifierService {
	/**
	 * Classify a single batch of bookmark TDK items using TanStack AI
	 */
	static async classifyBatch(
		batch: BookmarkTDKItem[],
		existingCategories: string[],
		existingFolders: Array<{ name: string; category: string }>,
		settings: Partial<WorkbenchSettings>,
		signal?: AbortSignal,
	): Promise<AIClassificationResult[]> {
		const { apiKey, baseUrl, model, provider } = getEffectiveLLMConfig(settings);

		if (!apiKey) {
			throw new Error("请先在「设置」中配置大模型 API Key 后再进行智能分拣");
		}

		const validCategories = existingCategories.filter(
			(c) => c && c !== "未分类",
		);
		const targetCategories = Array.from(
			new Set([...validCategories, ...UNIVERSAL_CATEGORY_DOMAINS]),
		);

		const systemPrompt = buildClassifySystemPrompt(
			targetCategories,
			existingFolders,
		);
		const userPayload = buildUserPayload(batch);

		// 1. Create TanStack AI OpenAI-compatible adapter
		const adapter = openaiCompatibleText(model, {
			baseURL: baseUrl,
			apiKey,
			dangerouslyAllowBrowser: true,
		});

		// 2. Setup cancellation controller with a 35-second batch timeout
		const abortController = new AbortController();
		const timeoutTimer = setTimeout(() => {
			abortController.abort(
				new Error(`AI 智能分拣批次请求超时 (35s) [${provider}]`),
			);
		}, 35000);

		if (signal) {
			if (signal.aborted) {
				abortController.abort();
			} else {
				signal.addEventListener("abort", () => abortController.abort(), {
					once: true,
				});
			}
		}

		try {
			// 3. Execute TanStack AI chat() with native json_object response format
			const response = await chat({
				adapter,
				systemPrompts: [systemPrompt],
				messages: [
					{
						role: "user",
						content: `Classify these ${batch.length} bookmarks into JSON { "items": [...] }:\n${JSON.stringify(userPayload)}`,
					},
				],
				modelOptions: {
					response_format: { type: "json_object" },
				},
				stream: false,
				abortController,
			});

			const parsedJson = extractAndParseJSON(response);
			return mapAIResponseToResults(parsedJson, batch);
		} finally {
			clearTimeout(timeoutTimer);
		}
	}

	/**
	 * Classify all bookmarks in chunks using a managed concurrency pool
	 */
	static async classifyBookmarks(
		bookmarks: BookmarkTDKItem[],
		options: ClassifyOptions,
	): Promise<AIClassificationResult[]> {
		if (!bookmarks || bookmarks.length === 0) {
			return [];
		}

		// 1. Lifecycle Step 1: Fetch authoritative settings from SQLite database once at start of operation
		const dbSettings = await fetchSettingsFromDb();
		const effectiveSettings = {
			...dbSettings,
			...options.settings,
		};
		const { apiKey, provider } = getEffectiveLLMConfig(effectiveSettings);

		// 2. Lifecycle Step 2: Fail-fast validation with actionable guidance
		if (!apiKey) {
			throw new Error("请先在「设置」中配置大模型 API Key 后再进行智能分拣");
		}

		const batchSize = effectiveSettings.batchSize || 15;
		const concurrency = Math.max(
			1,
			effectiveSettings.concurrency || options.concurrency || 2,
		);
		const total = bookmarks.length;
		const totalChunks = Math.ceil(total / batchSize);

		options.onProgress?.(
			0,
			total,
			`准备启动 AI 智能分拣 (${provider} · 共 ${total} 条, ${totalChunks} 批, ${concurrency} 线程并发)...`,
		);

		const results = await runBatchWorkerPool<
			BookmarkTDKItem,
			AIClassificationResult
		>({
			items: bookmarks,
			batchSize,
			concurrency,
			maxRetries: 2,
			signal: options.signal,
			processBatch: async (chunk, workerId, chunkIndex) => {
				options.onLog?.(
					`[Worker #${workerId}] 加载第 ${chunkIndex + 1}/${totalChunks} 批书签语义 (${chunk.length} 个)...`,
				);
				return await AIClassifierService.classifyBatch(
					chunk,
					options.existingCategories,
					options.existingFolders,
					effectiveSettings || {},
					options.signal,
				);
			},
			fallbackBatch: (chunk, error, workerId, chunkIndex) => {
				console.warn(
					`Batch ${chunkIndex + 1}/${totalChunks} failed after retries:`,
					error,
				);
				options.onLog?.(
					`[Worker #${workerId}] ⚠️ 批次 ${chunkIndex + 1} 使用启发式保底归类 (${chunk.length} 个)`,
				);
				return buildFallbackResults(chunk, error);
			},
			onBatchComplete: (batchResults) => {
				options.onBatchComplete?.(batchResults);
				for (const item of batchResults) {
					const tagStr =
						item.tags && item.tags.length > 0
							? ` #${item.tags.join(" #")}`
							: "";
					options.onLog?.(
						`✦ 归入 [${item.category} / ${item.folderName}] (${item.itemType})${tagStr} · 《${item.title.slice(0, 28)}》`,
					);
				}
			},
			onProgress: (completed, totalCount, completedBatch, totalBatch) => {
				options.onProgress?.(
					completed,
					totalCount,
					`已分析 ${completed}/${totalCount} 条书签 (批次 ${completedBatch}/${totalBatch}，${concurrency} 线程并发)...`,
				);
			},
			onLog: options.onLog,
		});

		if (!options.signal?.aborted) {
			options.onProgress?.(
				total,
				total,
				`分类完成，共处理 ${results.length} 个书签`,
			);
		}

		return results;
	}
}
