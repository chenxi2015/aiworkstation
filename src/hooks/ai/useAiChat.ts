import { toast } from "@heroui/react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	type ChatMessage,
	type ChatSession,
	WorkbenchStorageService,
} from "../../services/workbenchStorage";
import { type ChatItem, useChatMessages } from "./useChatMessages";
import { useChatSessions } from "./useChatSessions";

export type { ChatItem };

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
	const [isLoading, setIsLoading] = useState<boolean>(false);
	const abortControllerRef = useRef<AbortController | null>(null);

	// 1. Manage chat sessions
	const {
		sessions,
		currentSessionId,
		setCurrentSessionId,
		syncSession,
		createNewChat: baseCreateNewChat,
		loadSession: baseLoadSession,
		deleteSession: baseDeleteSession,
		clearAllSessions: baseClearAllSessions,
	} = useChatSessions<ChatItem>();

	// 2. Manage active messages
	const {
		messages,
		setMessages,
		editMessage: baseEditMessage,
		deleteMessage: baseDeleteMessage,
		deleteMessages: baseDeleteMessages,
		updateMessageReferences,
	} = useChatMessages({
		onMessagesChange: useCallback(
			(msgs: ChatItem[]) => {
				syncSession(msgs, currentSessionId);
			},
			[syncSession, currentSessionId],
		),
	});

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
			if (!lastMsg || lastMsg.role === "user") {
				return [
					...prev,
					{
						role: "assistant",
						content: "（已停止本次回答）",
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
		baseCreateNewChat(messages);
		setMessages([]);
		setInput("");
	}, [baseCreateNewChat, messages, setMessages]);

	const loadSession = useCallback(
		(session: ChatSession<ChatItem>) => {
			baseLoadSession(session, messages);
			setMessages(session.messages || []);
		},
		[baseLoadSession, messages, setMessages],
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
			},
		) => {
			const textToSend = (userPrompt || input).trim();
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
				WorkbenchStorageService.clearChatHistory();
			}

			const timeStr = new Date().toLocaleTimeString([], {
				hour: "2-digit",
				minute: "2-digit",
			});

			const userMsg: ChatItem = {
				role: "user",
				content: textToSend,
				timestamp: timeStr,
			};

			const historyBase =
				sendOptions?.baseMessages !== undefined
					? sendOptions.baseMessages
					: messages;

			const nextMessages = isNewChat ? [userMsg] : [...historyBase, userMsg];

			setMessages(nextMessages);
			if (isNewChat) {
				WorkbenchStorageService.saveChatHistory([userMsg]);
			}

			if (!userPrompt) setInput("");
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

				const res = await WorkbenchStorageService.chatWithBookmarks(
					{
						question: textToSend,
						history,
						embeddingConfig,
						llmConfig,
						folderId: sendOptions?.folderId,
						folderName: sendOptions?.folderName,
					},
					{ signal: controller.signal },
				);

				const assistantMsg: ChatItem = {
					role: "assistant",
					content: res.answer,
					references: res.references,
					timestamp: new Date().toLocaleTimeString([], {
						hour: "2-digit",
						minute: "2-digit",
					}),
				};

				setMessages((prev) => [...prev, assistantMsg]);
				options?.onResponseReceived?.();
				if (res.dbMutated) {
					options?.onDataMutated?.();
				}
			} catch (error: any) {
				if (controller.signal.aborted || error?.name === "AbortError") {
					console.log("[useAiChat] AI query aborted by user");
					return;
				}
				console.error("[useAiChat] Error:", error);
				toast.danger(error.message || "问答检索失败，请检查网络或 AI 配置");
				setMessages((prev) => [
					...prev,
					{
						role: "assistant",
						content: `请求失败: ${error.message || "未知错误，请检查设置中的 DeepSeek API Key"}`,
						timestamp: new Date().toLocaleTimeString([], {
							hour: "2-digit",
							minute: "2-digit",
						}),
					},
				]);
			} finally {
				setIsLoading(false);
				if (abortControllerRef.current === controller) {
					abortControllerRef.current = null;
				}
			}
		},
		[
			input,
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
			const baseMessages = messages.slice(0, index);
			sendPrompt(trimmed, { baseMessages });
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
				sendPrompt(targetMsg.content, { baseMessages });
			} else {
				let prevUserIndex = -1;
				for (let i = index - 1; i >= 0; i--) {
					if (messages[i].role === "user") {
						prevUserIndex = i;
						break;
					}
				}
				if (prevUserIndex >= 0) {
					const baseMessages = messages.slice(0, prevUserIndex);
					sendPrompt(messages[prevUserIndex].content, { baseMessages });
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
		clearHistory,
		setMessages,
		updateMessageReferences,
	};
}
