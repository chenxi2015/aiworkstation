import { toast } from "@heroui/react";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
	Category,
	Folder,
	SearchResultItem,
} from "../../components/workbench/types";
import {
	type ChatMessage,
	type ChatSession,
	WorkbenchStorageService,
} from "../../services/workbenchStorage";

export interface ChatItem {
	role: "user" | "assistant";
	content: string;
	references?: SearchResultItem[];
	timestamp?: string;
}

export interface UseAiChatOptions {
	onMessageSent?: () => void;
	onResponseReceived?: () => void;
	onDataMutated?: () => void;
}

/**
 * Custom hook managing conversational RAG state, history sessions, and network requests
 */
export function useAiChat(options?: UseAiChatOptions) {
	const [messages, setMessages] = useState<ChatItem[]>([]);
	const [sessions, setSessions] = useState<ChatSession<ChatItem>[]>([]);
	const [currentSessionId, setCurrentSessionId] = useState<string>(
		() => `session_${Date.now()}`,
	);
	const [input, setInput] = useState<string>("");
	const [isLoading, setIsLoading] = useState<boolean>(false);
	const abortControllerRef = useRef<AbortController | null>(null);

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
			// Only append cancellation notice if the last message was the user query
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
	}, []);

	// Clean up pending requests on unmount
	useEffect(() => {
		return () => {
			abortControllerRef.current?.abort();
		};
	}, []);

	// Load chat history & sessions on mount
	useEffect(() => {
		try {
			const savedSessions =
				WorkbenchStorageService.getChatSessions<ChatItem>();
			if (
				savedSessions &&
				Array.isArray(savedSessions) &&
				savedSessions.length > 0
			) {
				setSessions(savedSessions);
			}

			const saved = WorkbenchStorageService.getChatHistory<ChatItem>();
			if (saved && Array.isArray(saved) && saved.length > 0) {
				setMessages(saved);
			}
		} catch (e) {
			console.error("[useAiChat] Failed to load chat history:", e);
		}
	}, []);

	// Synchronize current messages with sessions state and localStorage
	const syncSession = useCallback((msgs: ChatItem[], sessId: string) => {
		try {
			WorkbenchStorageService.saveChatHistory(msgs);
			if (msgs.length === 0) return;

			setSessions((prev) => {
				const nowStr = new Date().toLocaleString([], {
					month: "2-digit",
					day: "2-digit",
					hour: "2-digit",
					minute: "2-digit",
				});
				const firstUserMsg = msgs.find((m) => m.role === "user");
				const rawTitle = firstUserMsg
					? firstUserMsg.content.slice(0, 24)
					: "新对话";
				const title = rawTitle.length >= 24 ? `${rawTitle}...` : rawTitle;

				const existingIndex = prev.findIndex((s) => s.id === sessId);
				let updated: ChatSession<ChatItem>[];
				if (existingIndex >= 0) {
					updated = prev.map((s, idx) =>
						idx === existingIndex
							? {
									...s,
									title: s.title || title,
									updatedAt: nowStr,
									messages: msgs,
								}
							: s,
					);
				} else {
					const newSession: ChatSession<ChatItem> = {
						id: sessId,
						title,
						createdAt: nowStr,
						updatedAt: nowStr,
						messages: msgs,
					};
					updated = [newSession, ...prev].slice(0, 30);
				}
				WorkbenchStorageService.saveChatSessions(updated);
				return updated;
			});
		} catch (e) {
			console.error("[useAiChat] Failed to sync session:", e);
		}
	}, []);

	// Create a new blank chat session
	const createNewChat = useCallback(() => {
		if (messages.length > 0) {
			syncSession(messages, currentSessionId);
		}
		const newId = `session_${Date.now()}`;
		setCurrentSessionId(newId);
		setMessages([]);
		setInput("");
		WorkbenchStorageService.clearChatHistory();
		toast.success("已开启新对话");
	}, [messages, currentSessionId, syncSession]);

	// Load a selected historical session
	const loadSession = useCallback(
		(session: ChatSession<ChatItem>) => {
			if (messages.length > 0 && currentSessionId !== session.id) {
				syncSession(messages, currentSessionId);
			}
			setCurrentSessionId(session.id);
			setMessages(session.messages || []);
			WorkbenchStorageService.saveChatHistory(session.messages || []);
			toast.success(`已载入「${session.title || "历史对话"}」`);
		},
		[messages, currentSessionId, syncSession],
	);

	// Delete a single historical session
	const deleteSession = useCallback(
		(sessionId: string) => {
			WorkbenchStorageService.deleteChatSession(sessionId);
			setSessions((prev) => prev.filter((s) => s.id !== sessionId));
			if (currentSessionId === sessionId) {
				setMessages([]);
				setCurrentSessionId(`session_${Date.now()}`);
				WorkbenchStorageService.clearChatHistory();
			}
			toast.success("已删除该会话记录");
		},
		[currentSessionId],
	);

	// Clear all sessions and current messages
	const clearAllSessions = useCallback(() => {
		setMessages([]);
		setSessions([]);
		setCurrentSessionId(`session_${Date.now()}`);
		WorkbenchStorageService.clearChatHistory();
		WorkbenchStorageService.clearChatSessions();
		toast.success("已清空所有对话记录");
	}, []);

	const clearHistory = useCallback(() => {
		createNewChat();
	}, [createNewChat]);

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
				// Convert to ChatMessage history format (take last 8 messages)
				// For new chat, pass empty history to prevent context pollution
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
				// Silently ignore if aborted by the user
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
		[input, isLoading, messages, options, currentSessionId, syncSession],
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

	// Update content of a message without re-submitting to AI
	const editMessage = useCallback(
		(index: number, newContent: string) => {
			const trimmed = newContent.trim();
			if (!trimmed) return;
			setMessages((prev) => {
				const updated = prev.map((m, i) =>
					i === index ? { ...m, content: trimmed } : m,
				);
				syncSession(updated, currentSessionId);
				return updated;
			});
			toast.success("已更新消息内容");
		},
		[currentSessionId, syncSession],
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
				// For assistant message, find nearest previous user question
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

	// Delete multiple messages by indices from the active thread
	const deleteMessages = useCallback(
		(indices: number[] | Set<number>) => {
			const indexSet = indices instanceof Set ? indices : new Set(indices);
			if (indexSet.size === 0) return;
			setMessages((prev) => {
				const updated = prev.filter((_, i) => !indexSet.has(i));
				syncSession(updated, currentSessionId);
				return updated;
			});
			toast.success(`已删除 ${indexSet.size} 条消息`);
		},
		[currentSessionId, syncSession],
	);

	// Delete a single message from the active thread
	const deleteMessage = useCallback(
		(index: number) => {
			deleteMessages([index]);
		},
		[deleteMessages],
	);

	// Update in-memory reference cards when items are moved to another folder
	const updateMessageReferences = useCallback(
		(movedItems: SearchResultItem[], targetFolder: Folder) => {
			const movedKeys = new Set(movedItems.map((i) => i.id || i.url));
			setMessages((prev) =>
				prev.map((msg) => {
					if (!msg.references) return msg;
					return {
						...msg,
						references: msg.references.map((r) => {
							if (movedKeys.has(r.id || r.url)) {
								return {
									...r,
									folderId: targetFolder.id,
									folderName: targetFolder.name,
									category: targetFolder.category as Category,
								};
							}
							return r;
						}),
					};
				}),
			);
		},
		[],
	);

	// Save chat history & sync session on messages change
	useEffect(() => {
		if (messages.length > 0) {
			syncSession(messages, currentSessionId);
		}
	}, [messages, currentSessionId, syncSession]);

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
