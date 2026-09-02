import { useCallback, useEffect, useState } from "react";
import { toast } from "@heroui/react";
import {
	type ChatMessage,
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
 * Custom hook managing conversational RAG state, history, and network requests
 */
export function useAiChat(options?: UseAiChatOptions) {
	const [messages, setMessages] = useState<ChatItem[]>([]);
	const [input, setInput] = useState<string>("");
	const [isLoading, setIsLoading] = useState<boolean>(false);

	// Load chat history on mount
	useEffect(() => {
		try {
			const saved = WorkbenchStorageService.getChatHistory();
			if (saved && Array.isArray(saved) && saved.length > 0) {
				setMessages(saved);
			}
		} catch (e) {
			console.error("[useAiChat] Failed to load chat history:", e);
		}
	}, []);

	// Save chat history on update
	useEffect(() => {
		try {
			WorkbenchStorageService.saveChatHistory(messages);
		} catch (e) {
			console.error("[useAiChat] Failed to save chat history:", e);
		}
	}, [messages]);

	const clearHistory = useCallback(() => {
		setMessages([]);
		try {
			WorkbenchStorageService.clearChatHistory();
		} catch (e) {
			console.error("[useAiChat] Failed to clear chat history:", e);
		}
		toast.success("已清空对话与搜索记录");
	}, []);

	// Send user prompt to LLM and retrieve RAG answer
	const sendPrompt = useCallback(
		async (userPrompt?: string) => {
			const textToSend = (userPrompt || input).trim();
			if (!textToSend || isLoading) return;

			const timeStr = new Date().toLocaleTimeString([], {
				hour: "2-digit",
				minute: "2-digit",
			});

			const userMsg: ChatItem = {
				role: "user",
				content: textToSend,
				timestamp: timeStr,
			};

			setMessages((prev) => [...prev, userMsg]);
			if (!userPrompt) setInput("");
			setIsLoading(true);
			options?.onMessageSent?.();

			try {
				// Convert to ChatMessage history format (take last 8 messages)
				const history: ChatMessage[] = messages.slice(-8).map((m) => ({
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
		[input, isLoading, messages, options],
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

	return {
		messages,
		input,
		isLoading,
		setInput,
		sendPrompt,
		clearHistory,
		setMessages,
		updateMessageReferences,
	};
}
