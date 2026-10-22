import type { ChatItem } from "../../hooks/ai/useChatMessages";
import {
	dispatchOpenCheckoutModal,
	MEMBERSHIP_ERROR_CODES,
	membershipErrorMessage,
} from "../../lib/cloud/cloudEvents";
import {
	agentSessionActions,
	agentSessionStore,
} from "../../stores/agentSessionStore";
import type { AgentStep } from "../../types/agent";
import { streamAgentChat } from "../api/agentStreamClient";
import {
	type ChatSession,
	WorkbenchStorageService,
} from "../workbenchStorage";
import {
	createInitialAssistantMessage,
	createUserMessage,
	resolveAgentChatParams,
	concludeRunningParts,
	concludeRunningSteps,
	reduceError,
	reduceReferences,
	reduceRunEnd,
	reduceStepEnd,
	reduceStepStart,
	reduceStop,
	reduceTextChunk,
	type AgentSessionCallbacks,
	type SendPromptOptions,
} from "./session";

// Re-export public types and helper functions for external consumers
export type { AgentSessionCallbacks, SendPromptOptions };
export { concludeRunningParts, concludeRunningSteps };

/**
 * Singleton manager to orchestrate background AI agent streams per conversation session
 */
export class AgentSessionManager {
	// Independent abort controllers for each running session
	private abortControllers = new Map<string, AbortController>();

	/**
	 * Check whether a session is currently running an agent execution
	 */
	public isSessionRunning(sessionId: string): boolean {
		const session = agentSessionStore.state.sessions[sessionId];
		return session?.status === "running";
	}

	/**
	 * Abort and stop generation for a specific session without affecting other sessions
	 */
	public stopSession(sessionId: string): void {
		const controller = this.abortControllers.get(sessionId);
		if (controller) {
			controller.abort();
			this.abortControllers.delete(sessionId);
		}

		agentSessionActions.setSessionStatus(sessionId, "idle");
		agentSessionActions.setSessionMessages(sessionId, (prev) => {
			const last = prev[prev.length - 1];
			if (last && last.role === "assistant") {
				return [...prev.slice(0, -1), reduceStop(last)];
			}
			if (!last || last.role === "user") {
				return [
					...prev,
					{
						role: "assistant",
						content: "（已停止本次回答）",
						isStreaming: false,
						timestamp: new Date().toLocaleTimeString([], {
							hour: "2-digit",
							minute: "2-digit",
						}),
					},
				];
			}
			return prev;
		});

		this.persistSession(sessionId);
	}

	/**
	 * Abort all ongoing sessions (e.g. on window unload or clear all)
	 */
	public stopAllSessions(): void {
		for (const [sessionId, controller] of this.abortControllers.entries()) {
			controller.abort();
			agentSessionActions.setSessionStatus(sessionId, "idle");
		}
		this.abortControllers.clear();
	}

	/**
	 * Save current session state into SQLite storage
	 */
	public persistSession(sessionId: string): void {
		const session = agentSessionStore.state.sessions[sessionId];
		if (!session || session.messages.length === 0) return;

		const nowStr = new Date().toLocaleString([], {
			month: "2-digit",
			day: "2-digit",
			hour: "2-digit",
			minute: "2-digit",
		});

		const chatSessionToSave: ChatSession<ChatItem> = {
			id: sessionId,
			title: session.title,
			createdAt: session.createdAt || nowStr,
			updatedAt: nowStr,
			messages: session.messages,
		};

		void WorkbenchStorageService.saveChatSession(chatSessionToSave);
	}

	/**
	 * Dispatch a prompt to the AI agent for a specific session in the background
	 */
	public async sendPrompt(
		sessionId: string,
		rawText: string,
		options: SendPromptOptions = {},
		callbacks?: AgentSessionCallbacks,
	): Promise<void> {
		if (this.isSessionRunning(sessionId)) {
			return;
		}

		const textToSend = rawText.trim();
		if (!textToSend) return;

		// 1. Prepare messages and user bubble
		const timeStr = new Date().toLocaleTimeString([], {
			hour: "2-digit",
			minute: "2-digit",
		});

		const userMsg = createUserMessage(textToSend, options, timeStr);
		const session = agentSessionActions.ensureSession(sessionId);
		const historyBase =
			options.baseMessages !== undefined
				? options.baseMessages
				: session.messages;

		const nextMessages = options.newChat
			? [userMsg]
			: [...historyBase, userMsg];

		const initialAssistantMsg = createInitialAssistantMessage(timeStr);

		agentSessionActions.setSessionMessages(sessionId, [
			...nextMessages,
			initialAssistantMsg,
		]);
		agentSessionActions.setSessionStatus(sessionId, "running");
		callbacks?.onMessageSent?.();

		// 2. Set up abort controller
		const controller = new AbortController();
		this.abortControllers.set(sessionId, controller);

		try {
			const agentParams = resolveAgentChatParams(
				textToSend,
				historyBase,
				options,
			);

			await streamAgentChat(
				agentParams,
				{
					onStepStart: (step) => {
						this.handleStepStart(sessionId, step, callbacks);
					},
					onStepEnd: (step) => {
						this.handleStepEnd(sessionId, step);
					},
					onTextChunk: (delta) => {
						this.handleTextChunk(sessionId, delta);
					},
					onReferences: (references) => {
						this.handleReferences(sessionId, references);
					},
					onRunEnd: (answer, dbMutated) => {
						this.handleRunEnd(sessionId, answer, dbMutated, callbacks);
					},
					onError: (errMsg, code) => {
						this.handleError(sessionId, errMsg, code);
					},
				},
				{ signal: controller.signal },
			);
		} catch (error: any) {
			if (error.name === "AbortError" || controller.signal.aborted) {
				console.log(
					`[AgentSessionManager] Session ${sessionId} aborted by user`,
				);
			} else {
				console.error(
					`[AgentSessionManager] Session ${sessionId} Error:`,
					error,
				);
				this.handleError(sessionId, error.message || "请求发生未知异常");
			}
		} finally {
			if (this.abortControllers.get(sessionId) === controller) {
				this.abortControllers.delete(sessionId);
			}
			agentSessionActions.setSessionStatus(sessionId, "idle");
			this.persistSession(sessionId);
		}
	}

	private handleStepStart(
		sessionId: string,
		step: AgentStep,
		callbacks?: AgentSessionCallbacks,
	) {
		this.dispatchClientAction(step, callbacks);

		agentSessionActions.setSessionMessages(sessionId, (prev) => {
			const last = prev[prev.length - 1];
			if (!last || last.role !== "assistant") return prev;
			return [...prev.slice(0, -1), reduceStepStart(last, step)];
		});
	}

	private handleStepEnd(sessionId: string, step: AgentStep) {
		agentSessionActions.setSessionMessages(sessionId, (prev) => {
			const last = prev[prev.length - 1];
			if (!last || last.role !== "assistant") return prev;
			return [...prev.slice(0, -1), reduceStepEnd(last, step)];
		});
	}

	private handleTextChunk(sessionId: string, delta: string) {
		agentSessionActions.setSessionMessages(sessionId, (prev) => {
			const last = prev[prev.length - 1];
			if (!last || last.role !== "assistant") return prev;
			return [...prev.slice(0, -1), reduceTextChunk(last, delta)];
		});
	}

	private handleReferences(sessionId: string, references: any[]) {
		agentSessionActions.setSessionMessages(sessionId, (prev) => {
			const last = prev[prev.length - 1];
			if (!last || last.role !== "assistant") return prev;
			return [...prev.slice(0, -1), reduceReferences(last, references)];
		});
	}

	private handleRunEnd(
		sessionId: string,
		answer: string,
		dbMutated: boolean,
		callbacks?: AgentSessionCallbacks,
	) {
		agentSessionActions.setSessionMessages(sessionId, (prev) => {
			const last = prev[prev.length - 1];
			if (!last || last.role !== "assistant") return prev;
			return [...prev.slice(0, -1), reduceRunEnd(last, answer)];
		});

		if (dbMutated) {
			callbacks?.onDataMutated?.();
		}
		callbacks?.onResponseReceived?.();
	}

	private handleError(sessionId: string, errMsg: string, code?: string) {
		// 云端网关的会员/权益类拒绝：按结构化 code 渲染文案并自动弹出开通/续费弹窗。
		// 接口层只透传 code（MEMBERSHIP_REQUIRED / MEMBERSHIP_EXPIRED /
		// CAPABILITY_NOT_ENTITLED），文案与动作在这里统一映射。
		const isMembershipError = code && MEMBERSHIP_ERROR_CODES.includes(code);
		if (isMembershipError) {
			dispatchOpenCheckoutModal();
			errMsg = membershipErrorMessage(code);
		}
		agentSessionActions.setSessionMessages(sessionId, (prev) => {
			const last = prev[prev.length - 1];
			if (last && last.role === "assistant") {
				return [...prev.slice(0, -1), reduceError(last, errMsg)];
			}

			const errorText = `请求失败: ${errMsg || "未知错误，请检查设置中的 AI Model API Key"}`;
			return [
				...prev,
				{
					role: "assistant",
					content: errorText,
					timestamp: new Date().toLocaleTimeString([], {
						hour: "2-digit",
						minute: "2-digit",
					}),
				},
			];
		});
	}

	private dispatchClientAction(
		step: AgentStep,
		callbacks?: AgentSessionCallbacks,
	) {
		const actionType = step.action;
		if (actionType === "rewrite") {
			const instruction =
				typeof step.args?.instruction === "string"
					? step.args.instruction
					: undefined;
			callbacks?.onTriggerRewritePipeline?.(instruction);
		} else if (actionType === "canvas") {
			if (
				step.toolName !== "draft_excalidraw" &&
				step.toolName !== "draft_canvas"
			) {
				callbacks?.onCanvasAction?.(step.toolName, step.args, step.navigation);
			}
		}
	}
}

export const agentSessionManager = new AgentSessionManager();
