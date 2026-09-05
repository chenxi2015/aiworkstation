import { toast } from "@heroui/react";
import { useCallback, useEffect, useState } from "react";
import {
	type ChatSession,
	WorkbenchStorageService,
} from "../../services/workbenchStorage";

export interface UseChatSessionsProps<TMessage> {
	onSessionLoaded?: (messages: TMessage[]) => void;
	onSessionCleared?: () => void;
}

/**
 * Sub-hook for managing conversational session history and multi-session persistence
 */
export function useChatSessions<
	TMessage extends { role: string; content: string },
>(props?: UseChatSessionsProps<TMessage>) {
	const [sessions, setSessions] = useState<ChatSession<TMessage>[]>([]);
	const [currentSessionId, setCurrentSessionId] = useState<string>(
		() => `session_${Date.now()}`,
	);

	// Load chat sessions on mount
	useEffect(() => {
		try {
			const savedSessions = WorkbenchStorageService.getChatSessions<TMessage>();
			if (
				savedSessions &&
				Array.isArray(savedSessions) &&
				savedSessions.length > 0
			) {
				setSessions(savedSessions);
			}
		} catch (e) {
			console.error("[useChatSessions] Failed to load sessions:", e);
		}
	}, []);

	// Synchronize current messages with sessions list and localStorage
	const syncSession = useCallback(
		(msgs: TMessage[], sessId: string) => {
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
					let updated: ChatSession<TMessage>[];
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
						const newSession: ChatSession<TMessage> = {
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
				console.error("[useChatSessions] Failed to sync session:", e);
			}
		},
		[],
	);

	// Create a new blank session
	const createNewChat = useCallback(
		(currentMessages?: TMessage[]) => {
			if (currentMessages && currentMessages.length > 0) {
				syncSession(currentMessages, currentSessionId);
			}
			const newId = `session_${Date.now()}`;
			setCurrentSessionId(newId);
			WorkbenchStorageService.clearChatHistory();
			props?.onSessionCleared?.();
			toast.success("已开启新对话");
		},
		[currentSessionId, syncSession, props],
	);

	// Load a selected historical session
	const loadSession = useCallback(
		(session: ChatSession<TMessage>, currentMessages?: TMessage[]) => {
			if (
				currentMessages &&
				currentMessages.length > 0 &&
				currentSessionId !== session.id
			) {
				syncSession(currentMessages, currentSessionId);
			}
			setCurrentSessionId(session.id);
			WorkbenchStorageService.saveChatHistory(session.messages || []);
			props?.onSessionLoaded?.(session.messages || []);
			toast.success(`已载入「${session.title || "历史对话"}」`);
		},
		[currentSessionId, syncSession, props],
	);

	// Delete a single historical session
	const deleteSession = useCallback(
		(sessionId: string) => {
			WorkbenchStorageService.deleteChatSession(sessionId);
			setSessions((prev) => prev.filter((s) => s.id !== sessionId));
			if (currentSessionId === sessionId) {
				setCurrentSessionId(`session_${Date.now()}`);
				WorkbenchStorageService.clearChatHistory();
				props?.onSessionCleared?.();
			}
			toast.success("已删除该会话记录");
		},
		[currentSessionId, props],
	);

	// Clear all sessions
	const clearAllSessions = useCallback(() => {
		setSessions([]);
		setCurrentSessionId(`session_${Date.now()}`);
		WorkbenchStorageService.clearChatHistory();
		WorkbenchStorageService.clearChatSessions();
		props?.onSessionCleared?.();
		toast.success("已清空所有对话记录");
	}, [props]);

	return {
		sessions,
		setSessions,
		currentSessionId,
		setCurrentSessionId,
		syncSession,
		createNewChat,
		loadSession,
		deleteSession,
		clearAllSessions,
	};
}
