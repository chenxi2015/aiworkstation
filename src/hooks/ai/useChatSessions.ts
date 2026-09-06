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
 * Sub-hook for managing conversational session history and SQLite multi-session persistence
 */
export function useChatSessions<
	TMessage extends { role: string; content: string },
>(props?: UseChatSessionsProps<TMessage>) {
	const [sessions, setSessions] = useState<ChatSession<TMessage>[]>([]);
	const [currentSessionId, setCurrentSessionId] = useState<string>(
		() => `session_${Date.now()}`,
	);

	// Load chat sessions on mount solely from SQLite
	useEffect(() => {
		let isMounted = true;

		async function loadSessionsFromDb() {
			try {
				const dbSessions =
					await WorkbenchStorageService.fetchChatSessions<TMessage>();

				if (dbSessions && isMounted) {
					setSessions(dbSessions);

					// Auto-restore the latest active conversation from SQLite on refresh
					if (dbSessions.length > 0) {
						const latest = dbSessions[0];
						if (latest && latest.messages && latest.messages.length > 0) {
							setCurrentSessionId(latest.id);
							props?.onSessionLoaded?.(latest.messages);
						}
					}
				}
			} catch (e) {
				console.error(
					"[useChatSessions] Failed to load sessions from SQLite:",
					e,
				);
			}
		}

		loadSessionsFromDb();

		return () => {
			isMounted = false;
		};
	}, []);

	// Synchronize current messages with sessions list and SQLite database
	const syncSession = useCallback((msgs: TMessage[], sessId: string) => {
		try {
			if (msgs.length === 0) return;

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

			let sessionToPersist: ChatSession<TMessage>;

			setSessions((prev) => {
				const existingIndex = prev.findIndex((s) => s.id === sessId);
				if (existingIndex >= 0) {
					const updated = prev.map((s, idx) => {
						if (idx === existingIndex) {
							sessionToPersist = {
								...s,
								title: s.title || title,
								updatedAt: nowStr,
								messages: msgs,
							};
							return sessionToPersist;
						}
						return s;
					});
					return updated;
				}

				sessionToPersist = {
					id: sessId,
					title,
					createdAt: nowStr,
					updatedAt: nowStr,
					messages: msgs,
				};
				return [sessionToPersist, ...prev];
			});

			// Persist single session to SQLite in background
			if (sessionToPersist!) {
				WorkbenchStorageService.saveChatSession(sessionToPersist);
			}
		} catch (e) {
			console.error("[useChatSessions] Failed to sync session:", e);
		}
	}, []);

	// Create a new blank session
	const createNewChat = useCallback(
		(currentMessages?: TMessage[]) => {
			if (currentMessages && currentMessages.length > 0) {
				syncSession(currentMessages, currentSessionId);
			}
			const newId = `session_${Date.now()}`;
			setCurrentSessionId(newId);
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
			props?.onSessionLoaded?.(session.messages || []);
			toast.success(`已载入「${session.title || "历史对话"}」`);
		},
		[currentSessionId, syncSession, props],
	);

	// Delete a single historical session from SQLite
	const deleteSession = useCallback(
		(sessionId: string) => {
			WorkbenchStorageService.deleteChatSession(sessionId);
			setSessions((prev) => prev.filter((s) => s.id !== sessionId));
			if (currentSessionId === sessionId) {
				setCurrentSessionId(`session_${Date.now()}`);
				props?.onSessionCleared?.();
			}
			toast.success("已删除该会话记录");
		},
		[currentSessionId, props],
	);

	// Clear all sessions in SQLite
	const clearAllSessions = useCallback(() => {
		setSessions([]);
		setCurrentSessionId(`session_${Date.now()}`);
		WorkbenchStorageService.clearChatSessions();
		props?.onSessionCleared?.();
		toast.success("已清空所有对话记录");
	}, [props]);

	// Export all sessions as formatted JSON file
	const exportAllSessionsToJson = useCallback(async () => {
		try {
			const exportData = await WorkbenchStorageService.exportChatSessionsJson();
			const nowFormatted = new Date().toISOString().slice(0, 10);
			const filename = `aiworkstation_chat_history_${nowFormatted}.json`;

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
			console.error("[useChatSessions] Failed to export JSON:", err);
			toast.danger("导出对话记录失败");
		}
	}, [sessions]);

	// Export a single session as JSON file
	const exportSessionToJson = useCallback((session: ChatSession<TMessage>) => {
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
			console.error("[useChatSessions] Failed to export single session:", err);
			toast.danger("导出单条会话失败");
		}
	}, []);

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
		exportAllSessionsToJson,
		exportSessionToJson,
	};
}
