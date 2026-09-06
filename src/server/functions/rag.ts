import { chat } from "@tanstack/ai";
import { openaiCompatibleText } from "@tanstack/ai-openai/compatible";
import { createServerFn } from "@tanstack/react-start";
import type { SearchResultItem } from "../../components/workbench/types";
import type { EmbeddingConfig } from "../../services/embeddingService";
import { createBookmarkServerTools } from "../ai/bookmarkTools";
import { workbenchDb } from "../db/sqlite.ts";
import { prepareRagAgentContext, resolveLlmConfig } from "../ai/ragContext.ts";

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

		// 3. Instantiate server tools with execution callbacks
		const tools = createBookmarkServerTools({
			onMutated: () => {
				hasDbMutated = true;
			},
			onReferencesFound: (refs) => {
				references = refs;
			},
		});

		// 4. Create TanStack AI OpenAI-compatible adapter
		const adapter = openaiCompatibleText(model, {
			baseURL: baseUrl,
			apiKey,
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
			answer = await chat({
				adapter,
				systemPrompts: [prepared.systemPrompt],
				messages,
				tools,
				stream: false,
			});
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

		const systemPrompt = `你是一个资深技术分析师与知识管理专家。
你的任务是将用户在「${targetFolder.name}」（分类：${targetFolder.category}）文件夹中收藏的 ${targetFolder.items.length} 个书签条目，提炼成一份专业、结构化且高价值的《主题研究全景综述与 Cheatsheet 备忘单》。

报告结构要求（使用优美的 Markdown 格式）：
# 📁 ${targetFolder.name} · 专题全景研究与工具链指南

## 🌟 一、专题定位与核心价值
（用 2~3 段话总结这个主题的核心痛点、解决的问题与行业现状）

## 🛠️ 二、核心工具与资源全景对比
（按功能子类将这些书签分门别类，列出表格或条目对比，分析每款工具的亮点与适用人群）

## 🚀 三、推荐最佳实践与组合工作流
（如何将这些收藏串联起来发挥 1+1>2 的效率）

## 💡 四、备忘速查 Cheatsheet
（提炼出最核心的 3~5 条要点法则或避坑指南）

请确保语言严谨专业，重点突出，充分利用给定的书签信息。`;

		const { apiKey, baseUrl, model } = resolveLlmConfig(llmConfig);

		if (!apiKey) {
			throw new Error("请先在「设置」中配置 LLM API Key 以生成专题综述");
		}

		const adapter = openaiCompatibleText(model, {
			baseURL: baseUrl,
			apiKey,
		});

		let markdown = "";
		try {
			markdown = await chat({
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
