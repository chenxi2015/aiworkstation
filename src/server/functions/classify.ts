import { chat } from "@tanstack/ai";
import { openaiCompatibleText } from "@tanstack/ai-openai/compatible";
import { createServerFn } from "@tanstack/react-start";
import type {
	AIClassificationResult,
	BookmarkTDKItem,
} from "../../components/workbench/types";
import {
	buildClassifySystemPrompt,
	buildUserPayload,
} from "../../services/classifier/promptBuilder";
import {
	extractAndParseJSON,
	mapAIResponseToResults,
} from "../../services/classifier/responseParser";
import {
	DEFAULT_LLM_BASE_URL,
	UNIVERSAL_CATEGORY_DOMAINS,
} from "../../services/classifier/taxonomy";
import { getEffectiveLLMConfig } from "../../services/storage/settingsStorage";
import type { WorkbenchSettings } from "../../components/workbench/types";

export interface ClassifyBatchInput {
	batch: BookmarkTDKItem[];
	existingCategories: string[];
	existingFolders: Array<{ name: string; category: string }>;
	settings: Partial<WorkbenchSettings>;
}

/**
 * Server Function: Classify a batch of bookmarks using LLM on the Node.js side.
 * Runs server-side so Chrome extension monkey-patches on window.fetch won't interfere.
 */
export const classifyBatchServer = createServerFn({ method: "POST" })
	.validator((data: ClassifyBatchInput) => data)
	.handler(async ({ data }): Promise<AIClassificationResult[]> => {
		const { apiKey, baseUrl, model } = getEffectiveLLMConfig(data.settings);

		if (!apiKey) {
			throw new Error("请先在「设置」中配置大模型 API Key 后再进行智能分拣");
		}

		const validCategories = data.existingCategories.filter(
			(c) => c && c !== "未分类",
		);
		const targetCategories = Array.from(
			new Set([...validCategories, ...UNIVERSAL_CATEGORY_DOMAINS]),
		);

		const systemPrompt = buildClassifySystemPrompt(
			targetCategories,
			data.existingFolders,
		);
		const userPayload = buildUserPayload(data.batch);

		// Server-side adapter: no dangerouslyAllowBrowser needed in Node.js
		const adapter = openaiCompatibleText(model, {
			baseURL: baseUrl || DEFAULT_LLM_BASE_URL,
			apiKey,
			defaultHeaders: { "User-Agent": "aiworkstation-server/1.0" },
		});

		const abortController = new AbortController();
		const timeoutTimer = setTimeout(() => {
			abortController.abort(new Error("AI 批次请求服务端超时 (35s)"));
		}, 35000);

		try {
			const response = await chat({
				adapter,
				systemPrompts: [systemPrompt],
				messages: [
					{
						role: "user",
						content: `Classify these ${data.batch.length} bookmarks into JSON { "items": [...] }:\n${JSON.stringify(userPayload)}`,
					},
				],
				modelOptions: {
					response_format: { type: "json_object" },
				},
				stream: false,
				abortController,
			});

			const parsedJson = extractAndParseJSON(response);
			return mapAIResponseToResults(parsedJson, data.batch);
		} finally {
			clearTimeout(timeoutTimer);
		}
	});
