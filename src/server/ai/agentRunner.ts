import { chat, EventType } from "@tanstack/ai";
import { openaiCompatibleText } from "@tanstack/ai-openai/compatible";
import { prepareRagAgentContext, resolveLlmConfig } from "../functions/rag.ts";
import type {
	AgentChatParams,
	AgentStep,
	AgentStreamEvent,
} from "./agentTypes.ts";
import { createBookmarkServerTools } from "./bookmarkTools.ts";

export type StreamEventEmitter = (event: AgentStreamEvent) => void;

/**
 * Execute TanStack AI streaming Agent loop with step-by-step Harness tracking
 */
export async function runAgentStream(
	params: AgentChatParams,
	emit: StreamEventEmitter,
	signal?: AbortSignal,
): Promise<void> {
	const {
		question,
		history = [],
		embeddingConfig = {},
		llmConfig = {},
		folderId,
		folderName,
	} = params;

	const q = question?.trim();
	if (!q) {
		emit({ type: "error", message: "Question cannot be empty" });
		return;
	}

	const runId = `run_${Date.now()}`;
	emit({ type: "run_start", runId });

	// 1. Prepare RAG Context & System Prompt
	const prepared = await prepareRagAgentContext({
		question: q,
		folderId,
		folderName,
		embeddingConfig,
	});

	if (prepared.emptyFallbackMessage) {
		emit({
			type: "run_end",
			answer: prepared.emptyFallbackMessage,
			dbMutated: false,
			timestamp: new Date().toLocaleTimeString(),
		});
		return;
	}

	const { apiKey, baseUrl, model } = resolveLlmConfig(llmConfig);
	if (!apiKey) {
		if (prepared.contextReferences.length > 0) {
			emit({ type: "references", references: prepared.contextReferences });
		}
		emit({
			type: "run_end",
			answer: `已为你检索到 ${prepared.contextReferences.length} 个相关收藏。\n\n提示：如需启用 AI 智能总结与多步 Agent，请在右上角「设置」中填入 LLM API Key。`,
			dbMutated: false,
			timestamp: new Date().toLocaleTimeString(),
		});
		return;
	}

	let hasDbMutated = false;
	let stepCounter = 0;
	const activeSteps = new Map<string, AgentStep>();

	// 2. Instantiate tools with execution hooks emitting real-time steps
	const tools = createBookmarkServerTools({
		onMutated: () => {
			hasDbMutated = true;
		},
		onReferencesFound: (refs) => {
			emit({ type: "references", references: refs });
		},
		onToolStart: (toolName, args) => {
			stepCounter += 1;
			const stepId = `step_${stepCounter}_${toolName}`;
			const step: AgentStep = {
				id: stepId,
				toolName,
				args,
				status: "running",
				timestamp: new Date().toLocaleTimeString(),
			};
			activeSteps.set(toolName, step);
			emit({ type: "step_start", step });
		},
		onToolEnd: (toolName, summary, ok, durationMs) => {
			const existing = activeSteps.get(toolName);
			const step: AgentStep = {
				id: existing?.id || `step_${Date.now()}_${toolName}`,
				toolName,
				args: existing?.args,
				status: ok ? "completed" : "failed",
				summary,
				durationMs,
				timestamp: new Date().toLocaleTimeString(),
			};
			activeSteps.delete(toolName);
			emit({ type: "step_end", step });
		},
	});

	// 3. Create adapter
	const adapter = openaiCompatibleText(model, {
		baseURL: baseUrl,
		apiKey,
	});

	// 4. Prepare message history
	const messages: Array<{
		role: "user" | "assistant" | "tool";
		content: string;
	}> = [
		...history
			.filter(
				(h) => h.role === "user" || h.role === "assistant" || h.role === "tool",
			)
			.slice(-4)
			.map((h) => ({
				role: h.role as "user" | "assistant" | "tool",
				content: h.content,
			})),
		{ role: "user", content: q },
	];

	// 5. Execute Agent Stream
	let accumulatedAnswer = "";
	try {
		const stream = await chat({
			adapter,
			systemPrompts: [prepared.systemPrompt],
			messages,
			tools,
			stream: true,
		});

		for await (const chunk of stream as AsyncIterable<
			Record<string, unknown>
		>) {
			if (signal?.aborted) break;

			// Handle text content streaming
			if (
				chunk.type === EventType.TEXT_MESSAGE_CONTENT ||
				chunk.type === EventType.TEXT_MESSAGE_CHUNK
			) {
				const delta = (chunk.delta || chunk.content || "") as string;
				if (delta) {
					accumulatedAnswer += delta;
					emit({ type: "text_chunk", delta });
				}
			}
		}

		emit({
			type: "run_end",
			answer: accumulatedAnswer || "未能成功生成回答，请稍后再试。",
			dbMutated: hasDbMutated,
			timestamp: new Date().toLocaleTimeString(),
		});
	} catch (error: unknown) {
		if (signal?.aborted) {
			emit({
				type: "run_end",
				answer: accumulatedAnswer || "（已停止本次回答）",
				dbMutated: hasDbMutated,
				timestamp: new Date().toLocaleTimeString(),
			});
			return;
		}

		console.error("[runAgentStream] Agent execution error:", error);
		const errMsg =
			error instanceof Error
				? error.message
				: "未知错误，请检查 API Key 或网络";
		emit({
			type: "error",
			message: `⚠️ **AI 问答服务异常**: ${errMsg}`,
		});
	}
}
