import { chat } from "@tanstack/ai";
import { openaiCompatibleText } from "@tanstack/ai-openai/compatible";
import { createServerFn } from "@tanstack/react-start";
import type { SearchResultItem } from "../../components/workbench/types";
import type { EmbeddingConfig } from "../../services/embeddingService";
import { buildFolderDossierSystemPrompt } from "../ai/prompts/index.ts";
import { prepareRagAgentContext, resolveLlmConfig } from "../ai/ragContext.ts";
import { createAgentTools } from "../ai/tools/registry.ts";
import { workbenchDb } from "../db/sqlite.ts";

export interface ChatMessage {
	role: "user" | "assistant" | "system" | "tool";
	content: string;
	tool_call_id?: string;
	tool_calls?: unknown[];
}

export interface RAGChatResult {
	answer: string;
	references: SearchResultItem[];
	timestamp: string;
	dbMutated?: boolean;
}

export interface FolderDossierResult {
	folderId: number;
	folderName: string;
	itemCount: number;
	dossierMarkdown: string;
	generatedAt: string;
}

export interface LlmConfigOverrides {
	apiKey?: string;
	baseUrl?: string;
	model?: string;
}

/**
 * Server Function: Chat with bookmarks using TanStack AI Native chat() + toolDefinition Pipeline
 */
export const chatWithBookmarks = createServerFn({ method: "POST" })
	.validator(
		(data: {
			question: string;
			history?: ChatMessage[];
			embeddingConfig?: EmbeddingConfig;
			llmConfig?: LlmConfigOverrides;
			folderId?: number | null;
			folderName?: string;
		}) => data,
	)
	.handler(async ({ data }): Promise<RAGChatResult> => {
		const {
			question,
			history = [],
			embeddingConfig = {},
			llmConfig = {},
			folderId,
			folderName,
		} = data;

		const q = question?.trim();
		if (!q) {
			throw new Error("Question cannot be empty");
		}

		// 1. Prepare RAG Context & System Prompt
		const prepared = await prepareRagAgentContext({
			question: q,
			folderId,
			folderName,
			embeddingConfig,
		});

		if (prepared.emptyFallbackMessage) {
			return {
				answer: prepared.emptyFallbackMessage,
				references: [],
				timestamp: new Date().toLocaleTimeString(),
			};
		}

		let references: SearchResultItem[] = [];

		// 2. Setup Provider Config (caller overrides > SQLite settings > env vars)
		const { apiKey, baseUrl, model } = resolveLlmConfig(llmConfig);

		if (!apiKey) {
			return {
				answer: `已为你检索到 ${prepared.contextReferences.length} 个相关收藏（见下方引用卡片）。\n\n提示：如需启用 AI 智能总结与深度问答，请在右上角「设置」中填入 LLM API Key。`,
				references: prepared.contextReferences,
				timestamp: new Date().toLocaleTimeString(),
				dbMutated: false,
			};
		}

		let hasDbMutated = false;

		// 3. Instantiate server tools with execution callbacks.
		// Legacy non-streaming RPC: no active view context, so the registry
		// provisions the globally-available headless tool subset.
		const tools = createAgentTools(
			{
				onMutated: () => {
					hasDbMutated = true;
				},
				onReferencesFound: (refs) => {
					references = refs;
				},
			},
			{},
		);

		// 4. Create TanStack AI OpenAI-compatible adapter
		const adapter = openaiCompatibleText(model, {
			baseURL: baseUrl,
			apiKey,
			strictFallbackWarning: false,
		});

		// 5. Prepare message history (excluding system prompt from messages array)
		const messages: Array<{
			role: "user" | "assistant" | "tool";
			content: string;
		}> = [
			...history
				.filter(
					(h) =>
						h.role === "user" || h.role === "assistant" || h.role === "tool",
				)
				.slice(-4)
				.map((h) => ({
					role: h.role as "user" | "assistant" | "tool",
					content: h.content,
				})),
			{ role: "user", content: q },
		];

		// 6. Execute TanStack AI agent loop
		let answer = "";
		try {
			const res = await chat({
				adapter,
				systemPrompts: [prepared.systemPrompt],
				messages,
				tools,
				stream: false,
			});
			answer = res.text;
		} catch (error: unknown) {
			console.error("[chatWithBookmarks] TanStack AI chat error:", error);
			const errMsg =
				error instanceof Error
					? error.message
					: "未知错误，请检查 API Key 或网络";
			return {
				answer: `⚠️ **AI 问答服务异常**: ${errMsg}\n\n请检查「设置」中的 API Key、Base URL 或网络连接。`,
				references,
				timestamp: new Date().toLocaleTimeString(),
				dbMutated: false,
			};
		}

		return {
			answer: answer || "未能成功生成回答，请稍后再试。",
			references,
			timestamp: new Date().toLocaleTimeString(),
			dbMutated: hasDbMutated,
		};
	});

/**
 * Server Function: Generate structured research dossier for a folder using TanStack AI chat()
 */
export const generateFolderDossier = createServerFn({ method: "POST" })
	.validator(
		(data: { folderId: number; llmConfig?: LlmConfigOverrides }) => data,
	)
	.handler(async ({ data }): Promise<FolderDossierResult> => {
		const { folderId, llmConfig = {} } = data;

		const folders = workbenchDb.getAllFolders();
		const targetFolder = folders.find((f) => f.id === folderId);
		if (!targetFolder) {
			throw new Error("Folder not found");
		}

		if (targetFolder.items.length === 0) {
			throw new Error("该文件夹内暂无书签条目，无法生成专题综述");
		}

		const itemsListText = targetFolder.items
			.map((item, idx) => {
				const tags =
					item.tags && item.tags.length > 0 ? ` [${item.tags.join(", ")}]` : "";
				const desc = item.summary || item.description || "无详细描述";
				return `${idx + 1}. 《${item.name}》${tags}\n   - URL: ${item.url || "无"}\n   - 描述/特性: ${desc}`;
			})
			.join("\n\n");

		const systemPrompt = buildFolderDossierSystemPrompt({
			folderName: targetFolder.name,
			category: targetFolder.category,
			itemCount: targetFolder.items.length,
		});

		const { apiKey, baseUrl, model } = resolveLlmConfig(llmConfig);

		if (!apiKey) {
			throw new Error("请先在「设置」中配置 LLM API Key 以生成专题综述");
		}

		const adapter = openaiCompatibleText(model, {
			baseURL: baseUrl,
			apiKey,
			strictFallbackWarning: false,
		});

		let markdown = "";
		try {
			const res = await chat({
				adapter,
				systemPrompts: [systemPrompt],
				messages: [
					{
						role: "user",
						content: `请为以下包含 ${targetFolder.items.length} 个条目的书签列表生成专题综述：\n\n${itemsListText}`,
					},
				],
				stream: false,
			});
			markdown = res.text;
		} catch (error: unknown) {
			console.error("[generateFolderDossier] TanStack AI chat error:", error);
			const errMsg =
				error instanceof Error
					? error.message
					: "未知错误，请检查 API Key 或网络";
			return {
				folderId: targetFolder.id,
				folderName: targetFolder.name,
				itemCount: targetFolder.items.length,
				dossierMarkdown: `⚠️ **专题综述生成失败**: ${errMsg}\n\n请检查「设置」中的 LLM API Key 与网络连接。`,
				generatedAt: new Date().toLocaleDateString(),
			};
		}

		return {
			folderId: targetFolder.id,
			folderName: targetFolder.name,
			itemCount: targetFolder.items.length,
			dossierMarkdown: markdown || "生成综述失败",
			generatedAt: new Date().toLocaleDateString(),
		};
	});
