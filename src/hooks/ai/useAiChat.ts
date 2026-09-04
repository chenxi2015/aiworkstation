import { useCallback, useEffect, useState } from "react";
import { toast } from "@heroui/react";
import {
	type ChatMessage,
	type ChatSession,
	WorkbenchStorageService,
} from "../../services/workbenchStorage";
import type { Category, Folder, SearchResultItem } from "../../components/workbench/types";

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
	const [sessions, setSessions] = useState<ChatSession[]>([]);
	const [currentSessionId, setCurrentSessionId] = useState<string>(() => `session_${Date.now()}`);
	const [input, setInput] = useState<string>("");
	const [isLoading, setIsLoading] = useState<boolean>(false);

	// Load chat history & sessions on mount
	useEffect(() => {
		try {
			const savedSessions = WorkbenchStorageService.getChatSessions();
			if (savedSessions && Array.isArray(savedSessions) && savedSessions.length > 0) {
				setSessions(savedSessions);
			}

			const saved = WorkbenchStorageService.getChatHistory();
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
				const rawTitle = firstUserMsg ? firstUserMsg.content.slice(0, 24) : "新对话";
				const title = rawTitle.length >= 24 ? `${rawTitle}...` : rawTitle;

				const existingIndex = prev.findIndex((s) => s.id === sessId);
				let updated: ChatSession[];
				if (existingIndex >= 0) {
					updated = prev.map((s, idx) =>
						idx === existingIndex
							? { ...s, title: s.title || title, updatedAt: nowStr, messages: msgs }
							: s,
					);
				} else {
					const newSession: ChatSession = {
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
		(session: ChatSession) => {
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

			if (isNewChat) {
				setMessages([userMsg]);
				WorkbenchStorageService.saveChatHistory([userMsg]);
			} else {
				setMessages((prev) => [...prev, userMsg]);
			}

			if (!userPrompt) setInput("");
			setIsLoading(true);
			options?.onMessageSent?.();

			try {
				// Convert to ChatMessage history format (take last 8 messages)
				// For new chat, pass empty history to prevent context pollution
				const history: ChatMessage[] = isNewChat
					? []
					: messages.slice(-8).map((m) => ({
							role: m.role,
							content: m.content,
					  }));

				const settings = WorkbenchStorageService.getSettings();
				const llmConfig = {
					apiKey: settings.deepseekApiKey,
					baseUrl: settings.deepseekBaseUrl,
					model: settings.deepseekModel,
				};

				const embeddingConfig = {
					apiKey: settings.embeddingApiKey || settings.deepseekApiKey || "",
					baseUrl: settings.embeddingBaseUrl,
					model: settings.embeddingModel,
				};

				const res = await WorkbenchStorageService.chatWithBookmarks({
					question: textToSend,
					history,
					embeddingConfig,
					llmConfig,
					folderId: sendOptions?.folderId,
					folderName: sendOptions?.folderName,
				});

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
			}
		},
		[input, isLoading, messages, options, currentSessionId, syncSession],
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
		createNewChat,
		loadSession,
		deleteSession,
		clearAllSessions,
		clearHistory,
		setMessages,
		updateMessageReferences,
	};
}
