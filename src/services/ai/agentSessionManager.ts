import type { ChatItem, ChatMessagePart } from "../../hooks/ai/useChatMessages";
import {
	agentSessionActions,
	agentSessionStore,
} from "../../stores/agentSessionStore";
import { workbenchContextStore } from "../../stores/workbenchContextStore";
import type {
	AgentChatParams,
	AgentStep,
	AgentStepNavigation,
} from "../../types/agent";
import type { ChatContextItem } from "../../types/chatContext";
import { streamAgentChat } from "../api/agentStreamClient";
import {
	type ChatSession,
	WorkbenchStorageService,
} from "../workbenchStorage";

export interface AgentSessionCallbacks {
	onMessageSent?: () => void;
	onResponseReceived?: () => void;
	onDataMutated?: () => void;
	onTriggerRewritePipeline?: (instruction?: string) => void;
	onCanvasAction?: (
		toolName: string,
		args: any,
		navigation?: AgentStepNavigation,
	) => void;
}

export interface SendPromptOptions {
	newChat?: boolean;
	folderId?: number | null;
	folderName?: string;
	baseMessages?: ChatItem[];
	contextItems?: ChatContextItem[];
	module?: string;
	activeDocumentId?: number | null;
	activeMaterialId?: number | null;
	activeNotePath?: string | null;
}

/**
 * Singleton manager to orchestrate background AI agent streams per conversation session
 */
class AgentSessionManager {
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
				return [
					...prev.slice(0, -1),
					{
						...last,
						isStreaming: false,
						content: last.content || "（已停止本次回答）",
					},
				];
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

		const userMsg: ChatItem = {
			role: "user",
			content: textToSend,
			contextItems:
				options.contextItems && options.contextItems.length > 0
					? options.contextItems
					: undefined,
			timestamp: timeStr,
		};

		const session = agentSessionActions.ensureSession(sessionId);
		const historyBase =
			options.baseMessages !== undefined
				? options.baseMessages
				: session.messages;

		const nextMessages = options.newChat
			? [userMsg]
			: [...historyBase, userMsg];

		// Initial assistant placeholder
		const initialAssistantMsg: ChatItem = {
			role: "assistant",
			content: "",
			steps: [],
			parts: [],
			isStreaming: true,
			timestamp: timeStr,
		};

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
			const history = options.newChat
				? []
				: historyBase.slice(-8).map((m) => ({
						role: m.role,
						content: m.content,
						contextItems: m.contextItems,
					}));

			const settings = WorkbenchStorageService.getSettings();
			const llmConfig = {
				apiKey: settings.apiKey,
				baseUrl: settings.baseUrl,
				model: settings.model,
			};

			const embeddingConfig = {
				apiKey: settings.embeddingApiKey || settings.apiKey || "",
				baseUrl: settings.embeddingBaseUrl,
				model: settings.embeddingModel,
			};

			const resolvedModule =
				options.module ?? workbenchContextStore.state.activeModule;

			const effectiveDocId =
				options.activeDocumentId !== undefined
					? (options.activeDocumentId ?? undefined)
					: workbenchContextStore.state.detachedDocumentId ===
							workbenchContextStore.state.activeDocument?.id
						? undefined
						: (workbenchContextStore.state.activeDocument?.id ?? undefined);

			const effectiveMaterialId =
				options.activeMaterialId !== undefined
					? (options.activeMaterialId ?? undefined)
					: workbenchContextStore.state.detachedMaterialId ===
							workbenchContextStore.state.activeMaterial?.id
						? undefined
						: (workbenchContextStore.state.activeMaterial?.id ?? undefined);

			const effectiveNotePath =
				options.activeNotePath !== undefined
					? (options.activeNotePath ?? undefined)
					: workbenchContextStore.state.detachedNotePath ===
							workbenchContextStore.state.activeNote?.path
						? undefined
						: (workbenchContextStore.state.activeNote?.path ?? undefined);

			const agentParams: AgentChatParams = {
				question: textToSend,
				history,
				embeddingConfig,
				llmConfig,
				folderId: options.folderId,
				folderName: options.folderName,
				contextItems:
					options.contextItems && options.contextItems.length > 0
						? options.contextItems
						: undefined,
				module: resolvedModule,
				activeDocumentId: effectiveDocId,
				activeMaterialId: effectiveMaterialId,
				activeNotePath: effectiveNotePath,
			};

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
					onError: (errMsg) => {
						this.handleError(sessionId, errMsg);
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
		// Client actions route purely on the server-declared action directive
		// (tool metadata.clientAction → step.action); no name-prefix guessing.
		const actionType = step.action;

		if (actionType === "rewrite") {
			const instruction =
				typeof step.args?.instruction === "string"
					? step.args.instruction
					: undefined;
			callbacks?.onTriggerRewritePipeline?.(instruction);
		} else if (actionType === "canvas") {
			// Do NOT trigger canvas action on create board steps during start:
			// creations are decoupled as drafts and finalized via user confirmation.
			if (
				step.toolName !== "draft_excalidraw" &&
				step.toolName !== "draft_canvas"
			) {
				callbacks?.onCanvasAction?.(step.toolName, step.args, step.navigation);
			}
		}

		agentSessionActions.setSessionMessages(sessionId, (prev) => {
			const last = prev[prev.length - 1];
			if (!last || last.role !== "assistant") return prev;

			const existingSteps = last.steps || [];
			const stepIndex = existingSteps.findIndex((s) => s.id === step.id);
			const updatedSteps =
				stepIndex >= 0
					? existingSteps.map((s, idx) => (idx === stepIndex ? step : s))
					: [...existingSteps, step];

			const existingParts = last.parts ? [...last.parts] : [];
			const lastPart = existingParts[existingParts.length - 1];
			let nextParts: ChatMessagePart[];

			if (lastPart && lastPart.type === "step_group") {
				const inGroupIndex = lastPart.steps.findIndex((s) => s.id === step.id);
				const nextStepsInGroup =
					inGroupIndex >= 0
						? lastPart.steps.map((s, idx) => (idx === inGroupIndex ? step : s))
						: [...lastPart.steps, step];

				nextParts = [
					...existingParts.slice(0, -1),
					{ type: "step_group", steps: nextStepsInGroup },
				];
			} else {
				nextParts = [...existingParts, { type: "step_group", steps: [step] }];
			}

			return [
				...prev.slice(0, -1),
				{
					...last,
					steps: updatedSteps,
					parts: nextParts,
				},
			];
		});
	}

	private handleStepEnd(sessionId: string, step: AgentStep) {
		agentSessionActions.setSessionMessages(sessionId, (prev) => {
			const last = prev[prev.length - 1];
			if (!last || last.role !== "assistant") return prev;

			let matched = false;
			const updatedSteps = (last.steps || []).map((s) => {
				if (s.id === step.id) {
					matched = true;
					return step;
				}
				return s;
			});

			const finalSteps = matched
				? updatedSteps
				: (() => {
						let didReplace = false;
						return updatedSteps.map((s) => {
							if (
								!didReplace &&
								s.toolName === step.toolName &&
								s.status === "running"
							) {
								didReplace = true;
								return step;
							}
							return s;
						});
					})();

			const existingParts = last.parts ? [...last.parts] : [];
			let matchedPart = false;
			const nextParts = existingParts.map((p) => {
				if (p.type !== "step_group") return p;
				return {
					...p,
					steps: p.steps.map((s) => {
						if (s.id === step.id) {
							matchedPart = true;
							return step;
						}
						return s;
					}),
				};
			});

			const finalParts = matchedPart
				? nextParts
				: (() => {
						let didReplace = false;
						return nextParts.map((p) => {
							if (p.type !== "step_group") return p;
							return {
								...p,
								steps: p.steps.map((s) => {
									if (
										!didReplace &&
										s.toolName === step.toolName &&
										s.status === "running"
									) {
										didReplace = true;
										return step;
									}
									return s;
								}),
							};
						});
					})();

			const isDraftAction =
				step.action === "draft" ||
				Boolean(step.navigation?.draftId) ||
				step.toolName === "draft_article";
			const draftPayload =
				isDraftAction && step.navigation?.draftId
					? {
							draftId: step.navigation.draftId,
							title: step.navigation.title || "未命名草稿",
							wordCount: step.navigation.wordCount || 0,
							kind:
								step.navigation.draftKind ||
								(step.toolName.startsWith("excalidraw_")
									? ("excalidraw" as const)
									: step.toolName.startsWith("canvas_")
										? ("canvas" as const)
										: ("article" as const)),
							status: "pending" as const,
						}
					: last.draft;

			return [
				...prev.slice(0, -1),
				{
					...last,
					steps: finalSteps,
					parts: finalParts,
					...(draftPayload ? { draft: draftPayload } : {}),
				},
			];
		});
	}

	private handleTextChunk(sessionId: string, delta: string) {
		agentSessionActions.setSessionMessages(sessionId, (prev) => {
			const last = prev[prev.length - 1];
			if (!last || last.role !== "assistant") return prev;

			const existingParts = last.parts ? [...last.parts] : [];
			const lastPart = existingParts[existingParts.length - 1];

			let nextParts: ChatMessagePart[];
			if (lastPart && lastPart.type === "text") {
				nextParts = [
					...existingParts.slice(0, -1),
					{
						...lastPart,
						text: lastPart.text + delta,
					},
				];
			} else {
				nextParts = [...existingParts, { type: "text", text: delta }];
			}

			return [
				...prev.slice(0, -1),
				{
					...last,
					content: last.content + delta,
					parts: nextParts,
				},
			];
		});
	}

	private handleReferences(sessionId: string, references: any[]) {
		agentSessionActions.setSessionMessages(sessionId, (prev) => {
			const last = prev[prev.length - 1];
			if (!last || last.role !== "assistant") return prev;
			return [
				...prev.slice(0, -1),
				{
					...last,
					references,
				},
			];
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

			const finalContent =
				last.content ||
				answer ||
				(last.steps && last.steps.length > 0
					? "任务已执行完毕。"
					: "未获取到回复内容。");

			return [
				...prev.slice(0, -1),
				{
					...last,
					isStreaming: false,
					content: finalContent,
				},
			];
		});

		if (dbMutated) {
			callbacks?.onDataMutated?.();
		}
		callbacks?.onResponseReceived?.();
	}

	private handleError(sessionId: string, errMsg: string) {
		agentSessionActions.setSessionMessages(sessionId, (prev) => {
			const last = prev[prev.length - 1];
			const errorText = `请求失败: ${errMsg || "未知错误，请检查设置中的 AI Model API Key"}`;

			if (last && last.role === "assistant") {
				return [
					...prev.slice(0, -1),
					{
						...last,
						isStreaming: false,
						content: last.content
							? `${last.content}\n\n${errorText}`
							: errorText,
					},
				];
			}

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
}

export const agentSessionManager = new AgentSessionManager();
