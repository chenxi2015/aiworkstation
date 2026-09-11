import { toast } from "@heroui/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { streamAgentChat } from "../../services/api/agentStreamClient";
import {
	type ChatMessage,
	type ChatSession,
	WorkbenchStorageService,
} from "../../services/workbenchStorage";
import { workbenchContextStore } from "../../stores/workbenchContextStore";
import type { ChatContextItem } from "../../types/chatContext";
import {
	type ChatItem,
	type ChatMessagePart,
	useChatMessages,
} from "./useChatMessages";
import { useChatSessions } from "./useChatSessions";

export type { ChatItem, ChatMessagePart };

export interface UseAiChatOptions {
	onMessageSent?: () => void;
	onResponseReceived?: () => void;
	onDataMutated?: () => void;
}

/**
 * Facade hook managing conversational RAG state, history sessions, and network requests
 */
export function useAiChat(options?: UseAiChatOptions) {
	const [input, setInput] = useState<string>("");
	const [contextItems, setContextItems] = useState<ChatContextItem[]>([]);
	const [isLoading, setIsLoading] = useState<boolean>(false);
	const abortControllerRef = useRef<AbortController | null>(null);

	const addContextItem = useCallback((item: ChatContextItem) => {
		setContextItems((prev) => {
			if (
				prev.some(
					(existing) =>
						existing.id === item.id ||
						(item.url && existing.url && existing.url === item.url),
				)
			) {
				return prev;
			}
			return [...prev, item];
		});
	}, []);

	const removeContextItem = useCallback((id: string) => {
		setContextItems((prev) => prev.filter((item) => item.id !== id));
	}, []);

	const clearContextItems = useCallback(() => {
		setContextItems([]);
	}, []);

	const onSessionLoadedRef = useRef<(msgs: ChatItem[]) => void>(() => {});
	const onSessionClearedRef = useRef<() => void>(() => {});

	// 1. Manage chat sessions
	const {
		sessions,
		currentSessionId,
		currentSessionIdRef,
		setCurrentSessionId,
		syncSession,
		createNewChat: baseCreateNewChat,
		loadSession: baseLoadSession,
		deleteSession: baseDeleteSession,
		clearAllSessions: baseClearAllSessions,
		exportAllSessionsToJson,
		exportSessionToJson,
	} = useChatSessions<ChatItem>({
		onSessionLoaded: (msgs) => onSessionLoadedRef.current(msgs),
		onSessionCleared: () => onSessionClearedRef.current(),
	});

	// 2. Manage active messages
	const {
		messages,
		setMessages,
		loadMessages,
		editMessage: baseEditMessage,
		deleteMessage: baseDeleteMessage,
		deleteMessages: baseDeleteMessages,
		updateMessageReferences,
	} = useChatMessages({
		onMessagesChange: useCallback(
			(msgs: ChatItem[]) => {
				syncSession(msgs, currentSessionIdRef.current);
			},
			[syncSession, currentSessionIdRef],
		),
	});

	// Wire session lifecycle events to messages state
	useEffect(() => {
		onSessionLoadedRef.current = (msgs) => loadMessages(msgs);
		onSessionClearedRef.current = () => setMessages([]);
	}, [loadMessages, setMessages]);

	// Stop / abort current ongoing AI answer generation
	const stopChat = useCallback(() => {
		if (abortControllerRef.current) {
			abortControllerRef.current.abort();
			abortControllerRef.current = null;
		}
		setIsLoading(false);
		toast.info("已停止回答");
		setMessages((prev) => {
			const lastMsg = prev[prev.length - 1];
			if (lastMsg && lastMsg.role === "assistant") {
				return [
					...prev.slice(0, -1),
					{
						...lastMsg,
						isStreaming: false,
						content: lastMsg.content || "（已停止本次回答）",
					},
				];
			}
			if (!lastMsg || lastMsg.role === "user") {
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
	}, [setMessages]);

	// Clean up pending requests on unmount
	useEffect(() => {
		return () => {
			abortControllerRef.current?.abort();
		};
	}, []);

	// Wrapped session actions that coordinate messages state
	const createNewChat = useCallback(() => {
		baseCreateNewChat();
		setMessages([]);
		setInput("");
	}, [baseCreateNewChat, setMessages]);

	const loadSession = useCallback(
		(session: ChatSession<ChatItem>) => {
			baseLoadSession(session);
			loadMessages(session.messages || []);
		},
		[baseLoadSession, loadMessages],
	);

	const deleteSession = useCallback(
		(sessionId: string) => {
			if (currentSessionId === sessionId) {
				setMessages([]);
			}
			baseDeleteSession(sessionId);
		},
		[currentSessionId, baseDeleteSession, setMessages],
	);

	const clearAllSessions = useCallback(() => {
		setMessages([]);
		baseClearAllSessions();
	}, [setMessages, baseClearAllSessions]);

	const clearHistory = useCallback(() => {
		createNewChat();
	}, [createNewChat]);

	const editMessage = useCallback(
		(index: number, newContent: string) => {
			baseEditMessage(index, newContent);
		},
		[baseEditMessage],
	);

	const deleteMessage = useCallback(
		(index: number) => {
			baseDeleteMessage(index);
		},
		[baseDeleteMessage],
	);

	const deleteMessages = useCallback(
		(indices: number[] | Set<number>) => {
			baseDeleteMessages(indices);
		},
		[baseDeleteMessages],
	);

	// Send user prompt to LLM and retrieve RAG answer
	const sendPrompt = useCallback(
		async (
			userPrompt?: string,
			sendOptions?: {
				newChat?: boolean;
				folderId?: number | null;
				folderName?: string;
				baseMessages?: ChatItem[];
				contextItems?: ChatContextItem[];
				module?: string;
				activeDocumentId?: number | null;
			},
		) => {
			const rawText = (userPrompt || input).trim();
			const activeAttachments =
				sendOptions?.contextItems !== undefined
					? sendOptions.contextItems
					: [...contextItems];
			const textToSend =
				rawText ||
				(activeAttachments.length > 0
					? "请结合上述引用的上下文进行深度分析与总结"
					: "");
			if (!textToSend) return;
			if (isLoading) {
				toast.warning("AI 正在回答中，请稍候...");
				return;
			}

			const isNewChat = Boolean(sendOptions?.newChat);
			let activeSessionId = currentSessionId;

			if (isNewChat) {
				if (messages.length > 0) {
					syncSession(messages, currentSessionId);
					toast.success("已开启新对话");
				}
				activeSessionId = `session_${Date.now()}`;
				setCurrentSessionId(activeSessionId);
			}

			const timeStr = new Date().toLocaleTimeString([], {
				hour: "2-digit",
				minute: "2-digit",
			});

			const userMsg: ChatItem = {
				role: "user",
				content: textToSend,
				contextItems:
					activeAttachments.length > 0 ? activeAttachments : undefined,
				timestamp: timeStr,
			};

			const historyBase =
				sendOptions?.baseMessages !== undefined
					? sendOptions.baseMessages
					: messages;

			const nextMessages = isNewChat ? [userMsg] : [...historyBase, userMsg];

			setMessages(nextMessages);

			if (!userPrompt) setInput("");
			// Clear attached contexts after successfully queuing send only if using input contextItems
			if (sendOptions?.contextItems === undefined) {
				setContextItems([]);
			}
			setIsLoading(true);
			options?.onMessageSent?.();

			const controller = new AbortController();
			abortControllerRef.current = controller;

			try {
				const history: ChatMessage[] = isNewChat
					? []
					: historyBase.slice(-8).map((m) => ({
							role: m.role,
							content: m.content,
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

				// Append initial assistant streaming message placeholder
				const initialAssistantMsg: ChatItem = {
					role: "assistant",
					content: "",
					steps: [],
					parts: [],
					isStreaming: true,
					timestamp: new Date().toLocaleTimeString([], {
						hour: "2-digit",
						minute: "2-digit",
					}),
				};
				setMessages((prev) => [...prev, initialAssistantMsg]);

				await streamAgentChat(
					{
						question: textToSend,
						history,
						embeddingConfig,
						llmConfig,
						folderId: sendOptions?.folderId,
						folderName: sendOptions?.folderName,
						contextItems:
							activeAttachments.length > 0 ? activeAttachments : undefined,
						module:
							sendOptions?.module ?? workbenchContextStore.state.activeModule,
						activeDocumentId:
							sendOptions?.activeDocumentId != null
								? sendOptions.activeDocumentId
								: (workbenchContextStore.state.activeDocument?.id ?? undefined),
						activeMaterialId:
							workbenchContextStore.state.activeMaterial?.id ?? undefined,
					},
					{
						onStepStart: (step) => {
							setMessages((prev) => {
								const last = prev[prev.length - 1];
								if (!last || last.role !== "assistant") return prev;

								const existingParts = last.parts ? [...last.parts] : [];
								const lastPart = existingParts[existingParts.length - 1];

								let nextParts: ChatMessagePart[];
								if (lastPart && lastPart.type === "step_group") {
									nextParts = [
										...existingParts.slice(0, -1),
										{
											...lastPart,
											steps: [...lastPart.steps, step],
										},
									];
								} else {
									nextParts = [
										...existingParts,
										{
											type: "step_group",
											steps: [step],
										},
									];
								}

								return [
									...prev.slice(0, -1),
									{
										...last,
										steps: [...(last.steps || []), step],
										parts: nextParts,
									},
								];
							});
						},
						onStepEnd: (step) => {
							setMessages((prev) => {
								const last = prev[prev.length - 1];
								if (!last || last.role !== "assistant") return prev;
								const updatedSteps = (last.steps || []).map((s) =>
									s.id === step.id ||
									(s.toolName === step.toolName && s.status === "running")
										? step
										: s,
								);

								const existingParts = last.parts ? [...last.parts] : [];
								const nextParts = existingParts.map((p) => {
									if (p.type !== "step_group") return p;
									return {
										...p,
										steps: p.steps.map((s) =>
											s.id === step.id ||
											(s.toolName === step.toolName && s.status === "running")
												? step
												: s,
										),
									};
								});

								return [
									...prev.slice(0, -1),
									{
										...last,
										steps: updatedSteps,
										parts: nextParts,
									},
								];
							});
						},
						onTextChunk: (delta) => {
							setMessages((prev) => {
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
									nextParts = [
										...existingParts,
										{
											type: "text",
											text: delta,
										},
									];
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
						},
						onReferences: (refs) => {
							setMessages((prev) => {
								const last = prev[prev.length - 1];
								if (!last || last.role !== "assistant") return prev;
								return [
									...prev.slice(0, -1),
									{
										...last,
										references: refs,
									},
								];
							});
						},
						onRunEnd: (answer, dbMutated) => {
							setMessages((prev) => {
								const last = prev[prev.length - 1];
								if (!last || last.role !== "assistant") return prev;

								let finalParts = last.parts ? [...last.parts] : [];
								const finalContent = answer || last.content;

								const hasTextPart = finalParts.some(
									(p) => p.type === "text" && p.text.trim().length > 0,
								);
								if (!hasTextPart && finalContent) {
									finalParts.push({ type: "text", text: finalContent });
								}

								finalParts = finalParts.map((p) => {
									if (p.type !== "step_group") return p;
									return {
										...p,
										steps: p.steps.map((s) =>
											s.status === "running"
												? { ...s, status: "completed" }
												: s,
										),
									};
								});

								return [
									...prev.slice(0, -1),
									{
										...last,
										content: finalContent,
										parts: finalParts,
										isStreaming: false,
									},
								];
							});
							options?.onResponseReceived?.();
							if (dbMutated) {
								options?.onDataMutated?.();
							}
						},
						onError: (errMsg) => {
							toast.danger(errMsg);
							setMessages((prev) => {
								const last = prev[prev.length - 1];
								if (!last || last.role !== "assistant") return prev;
								const existingParts = last.parts ? [...last.parts] : [];
								existingParts.push({
									type: "text",
									text: `\n\n${errMsg}`,
								});
								return [
									...prev.slice(0, -1),
									{
										...last,
										content: last.content
											? `${last.content}\n\n${errMsg}`
											: errMsg,
										parts: existingParts,
										isStreaming: false,
									},
								];
							});
						},
					},
					{ signal: controller.signal },
				);
			} catch (error: unknown) {
				const isAbort =
					controller.signal.aborted ||
					(error instanceof Error && error.name === "AbortError");
				if (isAbort) {
					console.log("[useAiChat] AI query aborted by user");
					return;
				}
				console.error("[useAiChat] Error:", error);
				const errMsg =
					error instanceof Error
						? error.message
						: "问答检索失败，请检查网络或 AI 配置";
				toast.danger(errMsg);
				setMessages((prev) => {
					const last = prev[prev.length - 1];
					if (last && last.role === "assistant") {
						return [
							...prev.slice(0, -1),
							{
								...last,
								isStreaming: false,
								content:
									last.content ||
									`请求失败: ${errMsg || "未知错误，请检查设置中的 AI Model API Key"}`,
							},
						];
					}
					return [
						...prev,
						{
							role: "assistant",
							content: `请求失败: ${errMsg || "未知错误，请检查设置中的 AI Model API Key"}`,
							timestamp: new Date().toLocaleTimeString([], {
								hour: "2-digit",
								minute: "2-digit",
							}),
						},
					];
				});
			} finally {
				setIsLoading(false);
				if (abortControllerRef.current === controller) {
					abortControllerRef.current = null;
				}
			}
		},
		[
			input,
			contextItems,
			isLoading,
			messages,
			options,
			currentSessionId,
			syncSession,
			setMessages,
			setCurrentSessionId,
		],
	);

	// Edit user prompt and regenerate answer from that point
	const editAndResendMessage = useCallback(
		(index: number, newContent: string) => {
			const trimmed = newContent.trim();
			if (!trimmed) return;
			if (isLoading) {
				toast.warning("AI 正在回答中，请稍候...");
				return;
			}
			const targetMsg = messages[index];
			const baseMessages = messages.slice(0, index);
			sendPrompt(trimmed, {
				baseMessages,
				contextItems: targetMsg?.contextItems,
			});
		},
		[messages, isLoading, sendPrompt],
	);

	// Resend / regenerate message
	const resendMessage = useCallback(
		(index: number) => {
			if (isLoading) {
				toast.warning("AI 正在回答中，请稍候...");
				return;
			}
			const targetMsg = messages[index];
			if (!targetMsg) return;

			if (targetMsg.role === "user") {
				const baseMessages = messages.slice(0, index);
				sendPrompt(targetMsg.content, {
					baseMessages,
					contextItems: targetMsg.contextItems,
				});
			} else {
				let prevUserIndex = -1;
				for (let i = index - 1; i >= 0; i--) {
					if (messages[i].role === "user") {
						prevUserIndex = i;
						break;
					}
				}
				if (prevUserIndex >= 0) {
					const userMsg = messages[prevUserIndex];
					const baseMessages = messages.slice(0, prevUserIndex);
					sendPrompt(userMsg.content, {
						baseMessages,
						contextItems: userMsg.contextItems,
					});
				} else {
					sendPrompt(targetMsg.content);
				}
			}
		},
		[messages, isLoading, sendPrompt],
	);

	return {
		messages,
		sessions,
		currentSessionId,
		input,
		isLoading,
		setInput,
		sendPrompt,
		stopChat,
		editAndResendMessage,
		editMessage,
		resendMessage,
		deleteMessage,
		deleteMessages,
		createNewChat,
		loadSession,
		deleteSession,
		clearAllSessions,
		exportAllSessionsToJson,
		exportSessionToJson,
		clearHistory,
		setMessages,
		updateMessageReferences,
		contextItems,
		addContextItem,
		removeContextItem,
		clearContextItems,
	};
}
