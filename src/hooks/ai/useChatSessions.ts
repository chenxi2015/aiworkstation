import { toast } from "@heroui/react";
import { useCallback, useEffect, useRef, useState } from "react";
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

const LAST_ACTIVE_SESSION_KEY = "aiworkstation_last_active_chat_session_id";

/**
 * Read the last active session ID from localStorage
 */
function getSavedActiveSessionId(): string | null {
	if (typeof window === "undefined") return null;
	try {
		return localStorage.getItem(LAST_ACTIVE_SESSION_KEY);
	} catch {
		return null;
	}
}

/**
 * Persist the active session ID to localStorage
 */
function saveActiveSessionId(id: string | null): void {
	if (typeof window === "undefined") return;
	try {
		if (id) {
			localStorage.setItem(LAST_ACTIVE_SESSION_KEY, id);
		} else {
			localStorage.removeItem(LAST_ACTIVE_SESSION_KEY);
		}
	} catch {
		// Ignore localStorage write failures
	}
}

/**
 * Sub-hook for managing conversational session history and SQLite multi-session persistence
 */
export function useChatSessions<
	TMessage extends { role: string; content: string },
>(props?: UseChatSessionsProps<TMessage>) {
	const [sessions, setSessions] = useState<ChatSession<TMessage>[]>([]);
	const sessionsRef = useRef<ChatSession<TMessage>[]>([]);
	const initialSessionId = getSavedActiveSessionId() || `session_${Date.now()}`;
	const [currentSessionId, setCurrentSessionIdState] = useState<string>(initialSessionId);
	const currentSessionIdRef = useRef<string>(initialSessionId);

	// Keep sessionsRef in sync with state
	useEffect(() => {
		sessionsRef.current = sessions;
	}, [sessions]);

	const setCurrentSessionId = useCallback((id: string) => {
		currentSessionIdRef.current = id;
		setCurrentSessionIdState(id);
		saveActiveSessionId(id);
	}, []);

	// Load chat sessions on mount solely from SQLite
	useEffect(() => {
		let isMounted = true;

		async function loadSessionsFromDb() {
			try {
				const dbSessions =
					await WorkbenchStorageService.fetchChatSessions<TMessage>();

				if (dbSessions && isMounted) {
					sessionsRef.current = dbSessions;
					setSessions(dbSessions);

					// Restore the user's last active session (either switched to or most recent)
					if (dbSessions.length > 0) {
						const lastActiveId = getSavedActiveSessionId();
						const matched = lastActiveId
							? dbSessions.find((s) => s.id === lastActiveId)
							: null;
						const targetSession = matched || dbSessions[0];

						if (
							targetSession &&
							targetSession.messages &&
							targetSession.messages.length > 0
						) {
							setCurrentSessionId(targetSession.id);
							props?.onSessionLoaded?.(targetSession.messages);
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
	}, [setCurrentSessionId]);

	// Synchronize current messages with sessions list and SQLite database
	const syncSession = useCallback((msgs: TMessage[], sessId: string) => {
		try {
			if (!msgs || msgs.length === 0) return;

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

			const prev = sessionsRef.current;
			const existingIndex = prev.findIndex((s) => s.id === sessId);
			let sessionToPersist: ChatSession<TMessage>;

			if (existingIndex >= 0) {
				const existing = prev[existingIndex];
				sessionToPersist = {
					...existing,
					title: existing.title || title,
					updatedAt: nowStr,
					messages: msgs,
				};
				const nextSessions = [
					sessionToPersist,
					...prev.filter((_, idx) => idx !== existingIndex),
				];
				sessionsRef.current = nextSessions;
				setSessions(nextSessions);
			} else {
				sessionToPersist = {
					id: sessId,
					title,
					createdAt: nowStr,
					updatedAt: nowStr,
					messages: msgs,
				};
				const nextSessions = [sessionToPersist, ...prev];
				sessionsRef.current = nextSessions;
				setSessions(nextSessions);
			}

			// Persist single session to SQLite in background deterministically
			WorkbenchStorageService.saveChatSession(sessionToPersist);
			saveActiveSessionId(sessId);
		} catch (e) {
			console.error("[useChatSessions] Failed to sync session:", e);
		}
	}, []);

	// Create a new blank session
	const createNewChat = useCallback(() => {
		const newId = `session_${Date.now()}`;
		setCurrentSessionId(newId);
		props?.onSessionCleared?.();
		toast.success("已开启新对话");
	}, [setCurrentSessionId, props]);

	// Load a selected historical session (pure read operation, does not overwrite history)
	const loadSession = useCallback(
		(session: ChatSession<TMessage>) => {
			setCurrentSessionId(session.id);
			props?.onSessionLoaded?.(session.messages || []);
			toast.success(`已载入「${session.title || "历史对话"}」`);
		},
		[props, setCurrentSessionId],
	);

	// Delete a single historical session from SQLite
	const deleteSession = useCallback(
		(sessionId: string) => {
			WorkbenchStorageService.deleteChatSession(sessionId);
			setSessions((prev) => {
				const remaining = prev.filter((s) => s.id !== sessionId);
				sessionsRef.current = remaining;
				if (currentSessionId === sessionId) {
					const next = remaining[0];
					if (next && next.messages && next.messages.length > 0) {
						setCurrentSessionId(next.id);
						props?.onSessionLoaded?.(next.messages);
					} else {
						const newId = `session_${Date.now()}`;
						setCurrentSessionId(newId);
						props?.onSessionCleared?.();
					}
				}
				return remaining;
			});
			toast.success("已删除该会话记录");
		},
		[currentSessionId, setCurrentSessionId, props],
	);

	// Clear all sessions in SQLite
	const clearAllSessions = useCallback(() => {
		sessionsRef.current = [];
		setSessions([]);
		const newId = `session_${Date.now()}`;
		setCurrentSessionId(newId);
		WorkbenchStorageService.clearChatSessions();
		props?.onSessionCleared?.();
		toast.success("已清空所有对话记录");
	}, [props, setCurrentSessionId]);

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
		currentSessionIdRef,
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
