import { chat, EventType, maxIterations } from "@tanstack/ai";
import { openaiCompatibleText } from "@tanstack/ai-openai/compatible";
import { getAiContribution } from "../../modules/ai-contributions.ts";
import type {
	AgentChatParams,
	AgentStep,
	AgentStreamEvent,
} from "./agentTypes.ts";
import { createBookmarkServerTools } from "./bookmarkTools.ts";
import {
	createDraftArticleTool,
	createEditorServerTools,
	createRewritePipelineTool,
} from "./editorTools.ts";
import { createFsServerTools } from "./fs/index.ts";
import { prepareRagAgentContext, resolveLlmConfig } from "./ragContext.ts";
import { resolveRequiredToolIntent } from "./toolIntentRouter.ts";
import { createCanvasServerTools } from "./tools/canvasTools.ts";
import { createExcalidrawServerTools } from "./tools/excalidrawTools.ts";
import type { BookmarkToolHooks } from "./tools/types.ts";
export type StreamEventEmitter = (event: AgentStreamEvent) => void;

/**
 * Resolve client action directive dynamically from function tool naming or metadata
 */
export function resolveToolActionDirective(toolName: string): string | undefined {
	if (
		toolName.startsWith("canvas_") ||
		toolName.startsWith("excalidraw_")
	) {
		return "canvas";
	}
	if (toolName === "trigger_paragraph_rewrite") {
		return "rewrite";
	}
	if (toolName === "draft_article") {
		return "draft";
	}
	return undefined;
}

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
		module,
		activeDocumentId,
		activeMaterialId,
		activeNotePath,
	} = params;

	const q = question?.trim();
	if (!q) {
		emit({ type: "error", message: "Question cannot be empty" });
		return;
	}

	const runId = `run_${Date.now()}`;
	emit({ type: "run_start", runId });

	let hasDbMutated = false;
	let stepCounter = 0;
	const activeSteps = new Map<string, AgentStep>();
	const completedStepSummaries: string[] = [];
	let failedToolSummary = "";
	const toolHooks: BookmarkToolHooks = {
		onMutated: () => {
			hasDbMutated = true;
		},
		onReferencesFound: (refs) => {
			emit({ type: "references", references: refs });
		},
		onToolStart: (toolName, args) => {
			stepCounter += 1;
			const stepId = `step_${stepCounter}_${toolName}`;
			const action = resolveToolActionDirective(toolName);
			const step: AgentStep = {
				id: stepId,
				toolName,
				args,
				status: "running",
				timestamp: new Date().toLocaleTimeString(),
				...(action ? { action } : {}),
			};
			activeSteps.set(stepId, step);
			emit({ type: "step_start", step });
			return stepId;
		},
		onToolEnd: (toolName, summary, ok, durationMs, navigation, stepId) => {
			const existing = stepId ? activeSteps.get(stepId) : undefined;
			if (ok && summary) {
				completedStepSummaries.push(`【${toolName}】\n${summary}`);
			} else if (!ok) {
				failedToolSummary = summary;
			}
			const action = existing?.action || resolveToolActionDirective(toolName);
			const step: AgentStep = {
				id: existing?.id || stepId || `step_${stepCounter}_${toolName}`,
				toolName,
				args: existing?.args,
				status: ok ? "completed" : "failed",
				summary,
				durationMs,
				timestamp: new Date().toLocaleTimeString(),
				...(action ? { action } : {}),
				...(navigation ? { navigation } : {}),
			};
			if (stepId) {
				activeSteps.delete(stepId);
			}
			emit({ type: "step_end", step });
		},
	};

	// 1. Instantiate module tools before retrieval so explicit actions still work
	// when the bookmark database is empty.
	const activeSkillItem = (params.contextItems || []).find(
		(item) =>
			(item.type as string) === "skill" ||
			item.id.startsWith("skill_") ||
			item.data?.dirPath ||
			item.data?.skillName,
	);
	const activeSkillDir =
		(activeSkillItem?.data?.dirPath as string) ||
		(activeSkillItem?.data?.skillName as string) ||
		activeSkillItem?.title;

	const allTools = [
		...createBookmarkServerTools(toolHooks, activeSkillDir),
		...createFsServerTools(toolHooks),
		// draft_article is globally available from any module: generates decoupled drafts
		createDraftArticleTool(toolHooks, { sessionId: params.sessionId }),
		...(module === "editor" || Boolean(activeDocumentId)
			? createEditorServerTools(toolHooks, activeDocumentId, { module })
			: []),
		...(module === "obsidian" || Boolean(activeNotePath)
			? [createRewritePipelineTool(toolHooks)]
			: []),
		// Canvas / Excalidraw tools are registered globally: create + draw run
		// headlessly on the server (no page bridge required), while view-state
		// tools (center / tidy / update) degrade gracefully when no board is open.
		...createCanvasServerTools(toolHooks, { activeNotePath }),
		...createExcalidrawServerTools(toolHooks, { activeNotePath }),
	];
	const tools = Array.from(
		new Map(allTools.map((tool) => [(tool as any).name, tool])).values(),
	);
	// Module contributions now act as a soft prioritization layer: declared tools
	// are promoted to the front of the LLM tool list, but no tool is excluded.
	// Intent-routed tools remain callable across modules (headless-capable ones
	// execute server-side without a page bridge).
	const declaredTools = module ? getAiContribution(module).tools : undefined;
	const promoted = new Set(declaredTools ?? []);
	const effectiveTools = declaredTools?.length
		? [...tools].sort((a, b) => {
				const an = (a as { name?: string }).name ?? "";
				const bn = (b as { name?: string }).name ?? "";
				return Number(promoted.has(bn)) - Number(promoted.has(an));
			})
		: tools;
	const availableToolNames = new Set(
		effectiveTools.map((tool) => (tool as { name?: string }).name ?? ""),
	);
	// View-state tools are module-locked: when the intent router wants a
	// context-dependent action but its target view is not open, short-circuit
	// with a navigation hint instead of letting the LLM flail or no-op.
	const CONTEXT_DEPENDENT_HINTS: Record<string, string> = {
		canvas_tidy_layout:
			"规整白板排版需要目标白板正处于打开状态。请先跳转到「笔记」模块打开对应 .canvas 白板，再发起规整请求。",
		canvas_center_view:
			"居中白板视野需要目标白板正处于打开状态。请先跳转到「笔记」模块打开对应 .canvas 白板。",
		canvas_update_node:
			"更新白板节点需要目标白板正处于打开状态。请先跳转到「笔记」模块打开对应 .canvas 白板。",
		canvas_create_group:
			"创建分组框需要目标白板正处于打开状态。请先跳转到「笔记」模块打开对应 .canvas 白板。",
		excalidraw_center_view:
			"居中画板视野需要目标画板正处于打开状态。请先跳转到「笔记」模块打开对应 .excalidraw 画板。",
		excalidraw_update_element:
			"更新画板元素需要目标画板正处于打开状态。请先跳转到「笔记」模块打开对应 .excalidraw 画板。",
		excalidraw_clear_canvas:
			"清空画板需要目标画板正处于打开状态。请先跳转到「笔记」模块打开对应 .excalidraw 画板。",
	};
	const isViewOpenFor = (toolName: string): boolean => {
		if (toolName.startsWith("excalidraw_"))
			return Boolean(activeNotePath?.endsWith(".excalidraw"));
		if (toolName.startsWith("canvas_"))
			return Boolean(activeNotePath?.endsWith(".canvas"));
		return true;
	};

	const requiredToolIntent = resolveRequiredToolIntent({
		question: q,
		module,
		activeNotePath,
		availableToolNames,
	});
	if (
		requiredToolIntent &&
		CONTEXT_DEPENDENT_HINTS[requiredToolIntent.toolName] &&
		!isViewOpenFor(requiredToolIntent.toolName)
	) {
		emit({
			type: "run_end",
			answer: CONTEXT_DEPENDENT_HINTS[requiredToolIntent.toolName],
			dbMutated: false,
			timestamp: new Date().toLocaleTimeString(),
		});
		return;
	}
	const requiredTool = requiredToolIntent
		? effectiveTools.find(
				(tool) =>
					(tool as { name?: string }).name === requiredToolIntent.toolName,
			)
		: undefined;
	if (requiredToolIntent && !requiredTool) {
		emit({
			type: "run_end",
			answer: `当前模块未开放完成该操作所需的工具（${requiredToolIntent.toolName}），没有执行任何修改。`,
			dbMutated: false,
			timestamp: new Date().toLocaleTimeString(),
		});
		return;
	}

	// 1. Prepare RAG Context & System Prompt
	const prepared = await prepareRagAgentContext({
		question: q,
		folderId,
		folderName,
		embeddingConfig,
		contextItems: params.contextItems,
		module,
		activeDocumentId,
		activeMaterialId,
		activeNotePath,
		allowEmptyBookmarkContext: Boolean(requiredToolIntent),
	});

	if (prepared.emptyFallbackMessage && !requiredToolIntent) {
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

	// 3. Create adapter
	const adapter = openaiCompatibleText(model, {
		baseURL: baseUrl,
		apiKey,
		strictFallbackWarning: false,
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
		let continuationMessages = messages;
		if (requiredTool && requiredToolIntent) {
			const requiredToolStream = await chat({
				adapter,
				systemPrompts: [prepared.systemPrompt],
				messages,
				tools: [requiredTool],
				modelOptions: {
					tool_choice: "required",
					parallel_tool_calls: false,
				},
				stream: true,
				agentLoopStrategy: maxIterations(1),
			});
			for await (const chunk of requiredToolStream as AsyncIterable<
				Record<string, unknown>
			>) {
				if (signal?.aborted) break;
				if (chunk.type === "RUN_ERROR") {
					const errMsg = (chunk.error as any)?.message || JSON.stringify(chunk);
					throw new Error(errMsg);
				}
			}

			if (signal?.aborted) {
				emit({
					type: "run_end",
					answer: "（已停止本次回答）",
					dbMutated: hasDbMutated,
					timestamp: new Date().toLocaleTimeString(),
				});
				return;
			}

			if (stepCounter === 0 || failedToolSummary) {
				emit({
					type: "run_end",
					answer: failedToolSummary
						? `工具 ${requiredToolIntent.toolName} 执行失败：${failedToolSummary}`
						: `模型未发起必需的工具调用（${requiredToolIntent.toolName}），没有执行任何修改。请确认当前模型/API 支持 function calling。`,
					dbMutated: hasDbMutated,
					timestamp: new Date().toLocaleTimeString(),
				});
				return;
			}

			continuationMessages = [
				...messages,
				{
					role: "user",
					content: `【工具执行回执】已按本轮意图调用 ${requiredToolIntent.toolName}。\n${completedStepSummaries.join("\n\n")}\n\n请基于真实执行结果继续完成用户请求；不要重复已经成功的操作。如还需其他工具，可继续调用。`,
				},
			];
		}
		const continuationTools = requiredTool
			? effectiveTools.filter((tool) => {
					const name = (tool as { name?: string }).name;
					return name !== requiredToolIntent?.toolName;
				})
			: effectiveTools;

		const stream = await chat({
			adapter,
			systemPrompts: [prepared.systemPrompt],
			messages: continuationMessages,
			tools: continuationTools,
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
					...continuationMessages,
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
