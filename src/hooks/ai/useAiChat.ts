import { toast } from "@heroui/react";
import { useSelector } from "@tanstack/react-store";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AgentStepNavigation } from "../../types/agent.ts";
import type { ChatContextItem } from "../../types/chatContext";
import type {
	Category,
	Folder,
	SearchResultItem,
} from "../../components/workbench/types.ts";
import {
	agentSessionActions,
	agentSessionStore,
	type SessionRuntime,
} from "../../stores/agentSessionStore";
import {
	agentSessionManager,
	type SendPromptOptions,
} from "../../services/ai/agentSessionManager";
import {
	type ChatSession,
	WorkbenchStorageService,
} from "../../services/workbenchStorage";
import {
	type ChatItem,
	type ChatMessagePart,
} from "./useChatMessages";

export type { ChatItem, ChatMessagePart };

export interface UseAiChatOptions {
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

/**
 * Helper to trigger browser download of JSON file
 */
function downloadJsonFile(filename: string, data: unknown) {
	if (typeof window === "undefined") return;
	const jsonStr = JSON.stringify(data, null, 2);
	const blob = new Blob([jsonStr], { type: "application/json;charset=utf-8;" });
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.download = filename;
	document.body.appendChild(link);
	link.click();
	document.body.removeChild(link);
	URL.revokeObjectURL(url);
}

/**
 * Facade hook connecting UI components to the persistent agentSessionStore & agentSessionManager
 */
export function useAiChat(options?: UseAiChatOptions) {
	const [input, setInput] = useState<string>("");
	const [contextItems, setContextItems] = useState<ChatContextItem[]>([]);

	// 1. Subscribe to reactive agent session store
	const activeSessionId = useSelector(
		agentSessionStore,
		(s) => s.activeSessionId,
	);
	const sessionsMap = useSelector(agentSessionStore, (s) => s.sessions);
	const sessionOrder = useSelector(agentSessionStore, (s) => s.order);

	const currentSession: SessionRuntime | undefined = sessionsMap[activeSessionId];
	const messages: ChatItem[] = currentSession?.messages || [];
	const isLoading: boolean = currentSession?.status === "running";

	// Convert runtime sessions map to standard ChatSession[] ordered for drawer/history
	const sessions: ChatSession<ChatItem>[] = useMemo(() => {
		return sessionOrder
			.map((id) => sessionsMap[id])
			.filter((s): s is SessionRuntime => Boolean(s))
			.map((s) => ({
				id: s.id,
				title: s.title,
				createdAt: s.createdAt || "",
				updatedAt: s.updatedAt || "",
				messages: s.messages,
			}));
	}, [sessionOrder, sessionsMap]);

	// Stable options ref
	const optionsRef = useRef(options);
	optionsRef.current = options;

	// Load chat sessions on mount solely from SQLite
	useEffect(() => {
		let isMounted = true;

		async function loadSessionsFromDb() {
			try {
				const dbSessions =
					await WorkbenchStorageService.fetchChatSessions<ChatItem>();
				if (dbSessions && isMounted) {
					agentSessionActions.initSessions(dbSessions);
				}
			} catch (e) {
				console.error("[useAiChat] Failed to load sessions from SQLite:", e);
			}
		}

		loadSessionsFromDb();

		return () => {
			isMounted = false;
		};
	}, []);

	// Context items management
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

	// Create a new blank session without interrupting ongoing background streams
	const createNewChat = useCallback(() => {
		const newId = `session_${Date.now()}`;
		agentSessionActions.setActiveSessionId(newId);
		setInput("");
		toast.success("已开启新对话");
	}, []);

	// Load a selected historical session
	const loadSession = useCallback((session: ChatSession<ChatItem>) => {
		agentSessionActions.ensureSession(session.id, session.title, session.messages);
		agentSessionActions.setActiveSessionId(session.id);
		toast.success(`已载入「${session.title || "历史对话"}」`);
	}, []);

	// Delete a single historical session
	const deleteSession = useCallback((sessionId: string) => {
		agentSessionManager.stopSession(sessionId);
		agentSessionActions.removeSession(sessionId);
		void WorkbenchStorageService.deleteChatSession(sessionId);
	}, []);

	// Clear all sessions
	const clearAllSessions = useCallback(() => {
		agentSessionManager.stopAllSessions();
		agentSessionActions.clearAll();
		void WorkbenchStorageService.clearChatSessions();
	}, []);

	const clearHistory = useCallback(() => {
		createNewChat();
	}, [createNewChat]);

	// Stop ongoing AI response generation for current active session
	const stopChat = useCallback(() => {
		agentSessionManager.stopSession(activeSessionId);
		toast.info("已停止回答");
	}, [activeSessionId]);

	// Manual message updates (edit/delete)
	const setMessages = useCallback(
		(updater: ChatItem[] | ((prev: ChatItem[]) => ChatItem[])) => {
			agentSessionActions.setSessionMessages(activeSessionId, updater);
			agentSessionManager.persistSession(activeSessionId);
		},
		[activeSessionId],
	);

	const editMessage = useCallback(
		(index: number, newContent: string) => {
			const trimmed = newContent.trim();
			if (!trimmed) return;
			agentSessionActions.setSessionMessages(activeSessionId, (prev) =>
				prev.map((m, i) => (i === index ? { ...m, content: trimmed } : m)),
			);
			agentSessionManager.persistSession(activeSessionId);
			toast.success("已更新消息内容");
		},
		[activeSessionId],
	);

	const deleteMessages = useCallback(
		(indices: number[] | Set<number>) => {
			const indexSet = indices instanceof Set ? indices : new Set(indices);
			agentSessionActions.setSessionMessages(activeSessionId, (prev) =>
				prev.filter((_, i) => !indexSet.has(i)),
			);
			agentSessionManager.persistSession(activeSessionId);
			toast.success(
				indexSet.size > 1
					? `已删除 ${indexSet.size} 条消息`
					: "已删除该条消息",
			);
		},
		[activeSessionId],
	);

	const deleteMessage = useCallback(
		(index: number) => {
			deleteMessages([index]);
		},
		[deleteMessages],
	);

	const updateMessageReferences = useCallback(
		(movedItems: SearchResultItem[], targetFolder: Folder) => {
			const movedKeys = new Set(movedItems.map((i) => i.id || i.url));
			agentSessionActions.setSessionMessages(activeSessionId, (prev) =>
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
			agentSessionManager.persistSession(activeSessionId);
		},
		[activeSessionId],
	);

	// Send user prompt to LLM and retrieve RAG answer
	const sendPrompt = useCallback(
		async (
			userPrompt?: string,
			sendOptions?: SendPromptOptions,
		) => {
			const rawText = (userPrompt || input).trim();
			const activeAttachments =
				sendOptions?.contextItems !== undefined
					? sendOptions.contextItems
					: [...contextItems];

			const hasOnlyImages =
				activeAttachments.length > 0 &&
				activeAttachments.every((item) => item.type === "image");
			const hasImages = activeAttachments.some(
				(item) => item.type === "image" || item.data?.materialKind === "image",
			);
			const defaultPrompt = hasOnlyImages
				? "请分析附带的图片内容，详细提取图中的文字、关键信息与图表细节"
				: hasImages
					? "请结合附带的图片与上下文进行深入分析与说明"
					: "请结合上述引用的上下文进行深度分析与总结";

			const textToSend =
				rawText || (activeAttachments.length > 0 ? defaultPrompt : "");

			if (!textToSend) return;

			// Only block if current session is already running
			if (isLoading) {
				toast.warning("AI 正在回答中，请稍候...");
				return;
			}

			let targetSessionId = activeSessionId;
			if (sendOptions?.newChat) {
				targetSessionId = `session_${Date.now()}`;
				agentSessionActions.setActiveSessionId(targetSessionId);
				toast.success("已开启新对话");
			}

			if (!userPrompt) setInput("");
			if (sendOptions?.contextItems === undefined) {
				setContextItems([]);
			}

			await agentSessionManager.sendPrompt(
				targetSessionId,
				textToSend,
				{
					...sendOptions,
					contextItems:
						activeAttachments.length > 0 ? activeAttachments : undefined,
				},
				{
					onMessageSent: () => optionsRef.current?.onMessageSent?.(),
					onResponseReceived: () =>
						optionsRef.current?.onResponseReceived?.(),
					onDataMutated: () => optionsRef.current?.onDataMutated?.(),
					onTriggerRewritePipeline: (instruction) =>
						optionsRef.current?.onTriggerRewritePipeline?.(instruction),
					onCanvasAction: (toolName, args, nav) =>
						optionsRef.current?.onCanvasAction?.(toolName, args, nav),
				},
			);
		},
		[activeSessionId, contextItems, input, isLoading],
	);

	// Edit user prompt and regenerate answer
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
			void sendPrompt(trimmed, {
				baseMessages,
				contextItems: targetMsg?.contextItems,
			});
		},
		[isLoading, messages, sendPrompt],
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
				void sendPrompt(targetMsg.content, {
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
					void sendPrompt(userMsg.content, {
						baseMessages,
						contextItems: userMsg.contextItems,
					});
				} else {
					void sendPrompt(targetMsg.content);
				}
			}
		},
		[isLoading, messages, sendPrompt],
	);

	// Export all sessions
	const exportAllSessionsToJson = useCallback(async () => {
		try {
			const dateTag = new Date().toISOString().slice(0, 10);
			const filename = `aiworkstation_chat_history_${dateTag}.json`;
			const exportData =
				await WorkbenchStorageService.exportChatSessionsJson();
			downloadJsonFile(
				filename,
				exportData || {
					exportedAt: new Date().toISOString(),
					version: "1.0",
					totalSessions: sessions.length,
					sessions,
				},
			);
			toast.success("已成功导出所有对话记录");
		} catch (err) {
			console.error("[useAiChat] Failed to export JSON:", err);
			toast.danger("导出对话记录失败");
		}
	}, [sessions]);

	// Export single session
	const exportSessionToJson = useCallback(
		(session: ChatSession<ChatItem>) => {
			try {
				const dateTag = new Date().toISOString().slice(0, 10);
				const cleanTitle = (session.title || "chat")
					.replace(/[\\/:*?"<>|]/g, "_")
					.slice(0, 30);
				const filename = `${cleanTitle}_${dateTag}.json`;

				downloadJsonFile(filename, {
					exportedAt: new Date().toISOString(),
					session,
				});
				toast.success(`已导出「${session.title}」`);
			} catch (err) {
				console.error("[useAiChat] Failed to export single session:", err);
				toast.danger("导出单条会话失败");
			}
		},
		[],
	);

	return {
		messages,
		sessions,
		currentSessionId: activeSessionId,
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
		updateMessageReferences,
		setMessages,
		contextItems,
		addContextItem,
		removeContextItem,
		clearContextItems,
	};
}
