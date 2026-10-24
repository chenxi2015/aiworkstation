import { chat, EventType, maxIterations } from "@tanstack/ai";
import { openaiCompatibleText } from "@tanstack/ai-openai/compatible";
import {
	CAPABILITY_NOT_ENTITLED_CODE,
	MEMBERSHIP_EXPIRED_CODE,
	MEMBERSHIP_REQUIRED_CODE,
} from "../../lib/cloud/cloudEvents.ts";
import type {
	AgentChatParams,
	AgentStep,
	AgentStreamEvent,
} from "./agentTypes.ts";
import { resolveImagePartsFromContext } from "./multimodal/resolveImages.ts";
import {
	isOfficialLlmProvider,
	prepareRagAgentContext,
	resolveLlmConfig,
} from "./ragContext.ts";
import { createAgentTools } from "./tools/registry.ts";
import { type AgentToolHooks, getAgentToolMetadata } from "./tools/types.ts";

export type StreamEventEmitter = (event: AgentStreamEvent) => void;

/**
 * 识别云端网关的会员/权益类拒绝（HTTP 403），并解析出结构化错误码。
 * 仅在官方通道下生效；自备 Key 通道的 403 视为上游服务商错误。
 * 返回 null 表示非会员类错误；否则返回 MEMBERSHIP_REQUIRED /
 * MEMBERSHIP_EXPIRED / CAPABILITY_NOT_ENTITLED 之一。
 */
function matchMembershipErrorCode(error: unknown): string | null {
	if (!isOfficialLlmProvider()) return null;
	const anyErr = error as Record<string, unknown> | null;
	const message = error instanceof Error ? error.message : String(error);

	// 优先使用网关返回的结构化业务码
	if (message.includes(MEMBERSHIP_EXPIRED_CODE)) return MEMBERSHIP_EXPIRED_CODE;
	if (message.includes(CAPABILITY_NOT_ENTITLED_CODE))
		return CAPABILITY_NOT_ENTITLED_CODE;
	if (message.includes(MEMBERSHIP_REQUIRED_CODE))
		return MEMBERSHIP_REQUIRED_CODE;

	const status = anyErr?.status ?? anyErr?.statusCode;
	if (status === 403 || status === "403") return MEMBERSHIP_REQUIRED_CODE;
	if (
		message.includes("40301") ||
		message.includes("会员专享") ||
		(/\b403\b/.test(message) && message.includes("会员"))
	) {
		return MEMBERSHIP_REQUIRED_CODE;
	}
	return null;
}

/**
 * Execute the TanStack AI streaming agent loop with step-by-step tracking.
 *
 * Tool selection is fully model-driven: the registry provisions exactly the
 * tool subset usable in the current view context, and each tool carries its
 * client dispatch directive in metadata.clientAction (surfaced as
 * step.action). Tool failures flow back to the model as error tool-results
 * (see wrapExecution), so the loop recovers in-band instead of aborting.
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
	const toolActionByName = new Map<string, string>();
	const toolHooks: AgentToolHooks = {
		onMutated: () => {
			hasDbMutated = true;
		},
		onReferencesFound: (refs) => {
			emit({ type: "references", references: refs });
		},
		onToolStart: (toolName, args) => {
			stepCounter += 1;
			const stepId = `step_${stepCounter}_${toolName}`;
			const action = toolActionByName.get(toolName);
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
		onToolEnd: (
			toolName,
			summary,
			ok,
			durationMs,
			navigation,
			stepId,
			actionPayload,
		) => {
			const existing = stepId ? activeSteps.get(stepId) : undefined;
			const action = existing?.action ?? toolActionByName.get(toolName);
			const step: AgentStep = {
				id: existing?.id || stepId || `step_${stepCounter}_${toolName}`,
				toolName,
				args: existing?.args,
				status: ok ? "completed" : "failed",
				summary,
				durationMs,
				timestamp: new Date().toLocaleTimeString(),
				...(action ? { action } : {}),
				...(actionPayload ? { actionPayload } : {}),
				...(navigation ? { navigation } : {}),
			};
			if (stepId) {
				activeSteps.delete(stepId);
			}
			emit({ type: "step_end", step });
		},
	};

	// Provision exactly the tool subset usable in the current view context
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

	const noteContextItem = (params.contextItems || []).find(
		(item) => item.type === "note" && item.notePath,
	);
	const effectiveNotePath = activeNotePath || noteContextItem?.notePath;

	const tools = createAgentTools(toolHooks, {
		module,
		activeDocumentId,
		activeMaterialId,
		activeNotePath: effectiveNotePath,
		sessionId: params.sessionId,
		activeSkillDir,
		signal,
	});
	for (const tool of tools) {
		const name = (tool as { name?: string }).name;
		const action = getAgentToolMetadata(tool)?.clientAction;
		if (name && action) {
			toolActionByName.set(name, action);
		}
	}

	// Prepare RAG context & system prompt
	const prepared = await prepareRagAgentContext({
		question: q,
		folderId,
		folderName,
		embeddingConfig,
		contextItems: params.contextItems,
		module,
		activeDocumentId,
		activeMaterialId,
		activeNotePath: effectiveNotePath,
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
		const noKeyTip = isOfficialLlmProvider()
			? "提示：「官方极速通道」需要先登录会员账号（云端网关将自动校验会员身份）；也可以在设置中切换为自备 API Key 通道。"
			: "提示：如需启用 AI 智能总结与多步 Agent，请在右上角「设置」中填入 LLM API Key。";
		emit({
			type: "run_end",
			answer: `已为你检索到 ${prepared.contextReferences.length} 个相关收藏。\n\n${noKeyTip}`,
			dbMutated: false,
			timestamp: new Date().toLocaleTimeString(),
		});
		return;
	}

	const adapter = openaiCompatibleText(model, {
		baseURL: baseUrl,
		apiKey,
		strictFallbackWarning: false,
	});

	// Multimodal image support for current turn
	const currentImageParts = await resolveImagePartsFromContext(
		params.contextItems,
	);
	let userContent: any = q;
	if (currentImageParts.length > 0) {
		userContent = [{ type: "text", content: q }, ...currentImageParts];
	}

	// Multimodal image support for history messages (preserving images in recent user turn)
	const filteredHistory = history
		.filter(
			(h) => h.role === "user" || h.role === "assistant" || h.role === "tool",
		)
		.slice(-4);

	const messages: any[] = [
		...(await Promise.all(
			filteredHistory.map(async (h, idx) => {
				if (h.role === "user" && h.contextItems && h.contextItems.length > 0) {
					const historyImageParts = await resolveImagePartsFromContext(
						h.contextItems,
					);
					// Retain full image data for the most recent historical user message to enable visual continuation
					const isRecentUserTurn = idx >= filteredHistory.length - 2;
					if (historyImageParts.length > 0 && isRecentUserTurn) {
						return {
							role: "user" as const,
							content: [
								{ type: "text", content: h.content },
								...historyImageParts,
							],
						};
					}
				}
				return {
					role: h.role as "user" | "assistant" | "tool",
					content: h.content,
				};
			}),
		)),
		{ role: "user", content: userContent },
	];

	let accumulatedAnswer = "";
	try {
		const stream = await chat({
			adapter,
			systemPrompts: [prepared.systemPrompt],
			messages,
			tools,
			stream: true,
			// Multi-step scraping (骨架分析 + 分段提取) burns several turns before
			// the model answers; 10 gives the loop comfortable headroom.
			agentLoopStrategy: maxIterations(10),
		});

		for await (const chunk of stream as AsyncIterable<
			Record<string, unknown>
		>) {
			if (signal?.aborted) break;

			if (chunk.type === "RUN_ERROR") {
				const chunkError = chunk.error as any;
				const errMsg = chunkError?.message || JSON.stringify(chunk);
				const runError = new Error(errMsg);
				// Preserve upstream error metadata (HTTP status / business code) so
				// downstream handlers can distinguish membership rejections (403).
				if (chunkError && typeof chunkError === "object") {
					if (chunkError.code !== undefined)
						(runError as any).code = chunkError.code;
					if (chunkError.status !== undefined)
						(runError as any).status = chunkError.status;
				}
				throw runError;
			}

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

		if (signal?.aborted) {
			emit({
				type: "run_end",
				answer: accumulatedAnswer || "（已停止本次回答）",
				dbMutated: hasDbMutated,
				timestamp: new Date().toLocaleTimeString(),
			});
			return;
		}

		emit({
			type: "run_end",
			answer:
				accumulatedAnswer ||
				(stepCounter > 0
					? "操作已执行完毕，详见上方时间轴各步骤的执行结果。"
					: "未能成功生成回答，请稍后再试。"),
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

		const membershipCode = matchMembershipErrorCode(error);
		if (membershipCode) {
			// 只透传结构化 code，展示文案由 UI 层按 code 渲染
			// （membershipErrorMessage in src/lib/cloud/cloudEvents.ts）
			emit({
				type: "error",
				code: membershipCode,
				message: membershipCode,
			});
			return;
		}

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
