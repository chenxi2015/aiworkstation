import { chat, EventType, maxIterations } from "@tanstack/ai";
import { openaiCompatibleText } from "@tanstack/ai-openai/compatible";
import type {
	AgentChatParams,
	AgentStep,
	AgentStreamEvent,
} from "./agentTypes.ts";
import { createBookmarkServerTools } from "./bookmarkTools.ts";
import { prepareRagAgentContext, resolveLlmConfig } from "./ragContext.ts";

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
		contextItems: params.contextItems,
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
	const completedStepSummaries: string[] = [];

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
			if (ok && summary) {
				completedStepSummaries.push(`【${toolName}】\n${summary}`);
			}
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

	// 4. Prepare message history with multimodal image support
	const imageItems = (params.contextItems || []).filter(
		(item) => item.type === "image" && Boolean(item.thumbnail),
	);

	let userContent: any = q;
	if (imageItems.length > 0) {
		const parts: any[] = [{ type: "text", content: q }];
		for (const img of imageItems) {
			const thumbnail = img.thumbnail!;
			const match = thumbnail.match(/^data:([^;]+);base64,(.+)$/);
			if (match) {
				parts.push({
					type: "image",
					source: {
						type: "data",
						value: match[2],
						mimeType: match[1],
					},
				});
			} else {
				parts.push({
					type: "image",
					source: {
						type: "url",
						value: thumbnail,
					},
				});
			}
		}
		userContent = parts;
	}

	const messages: any[] = [
		...history
			.filter(
				(h) => h.role === "user" || h.role === "assistant" || h.role === "tool",
			)
			.slice(-4)
			.map((h) => ({
				role: h.role as "user" | "assistant" | "tool",
				content: h.content,
			})),
		{ role: "user", content: userContent },
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
			// Default is maxIterations(5): multi-step scraping (骨架分析 + 分段
			// 提取) easily burns 5 turns before the model gets to answer, leaving
			// an empty reply. Give the loop more headroom.
			agentLoopStrategy: maxIterations(10),
		});

		for await (const chunk of stream as AsyncIterable<
			Record<string, unknown>
		>) {
			if (signal?.aborted) break;

			if (chunk.type === "RUN_ERROR") {
				const errMsg = (chunk.error as any)?.message || JSON.stringify(chunk);
				throw new Error(errMsg);
			}

			// Handle text content streaming
			if (
				chunk.type === EventType.TEXT_MESSAGE_CONTENT ||
				chunk.type === EventType.TEXT_MESSAGE_CHUNK ||
				chunk.type === EventType.TEXT_MESSAGE_CONTENT
			) {
				const delta = (chunk.delta || chunk.content || "") as string;
				if (delta) {
					accumulatedAnswer += delta;
					emit({ type: "text_chunk", delta });
				}
			}
		}

		if (signal?.aborted) {
			emit({
				type: "run_end",
				answer: accumulatedAnswer || "（已停止本次回答）",
				dbMutated: hasDbMutated,
				timestamp: new Date().toLocaleTimeString(),
			});
			return;
		}

		// Loop budget can be exhausted right after a tool call, before the model
		// produces any text. When tools did gather material, force one tool-free
		// synthesis turn so the user never gets an empty "生成失败" fallback.
		if (!accumulatedAnswer.trim() && completedStepSummaries.length > 0) {
			const synthStream = await chat({
				adapter,
				systemPrompts: [prepared.systemPrompt],
				messages: [
					...messages,
					{
						role: "user",
						content: `（系统接续）你之前已通过工具调用收集到以下资料：\n\n${completedStepSummaries.join("\n\n")}\n\n请直接基于以上资料回答用户最初的问题。如果资料不完整，先给出已有部分，并简要说明缺什么。不要重复调用工具，不要回复"无法获取"。`,
					},
				],
				stream: true,
			});
			for await (const chunk of synthStream as AsyncIterable<
				Record<string, unknown>
			>) {
				if (signal?.aborted) break;
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
