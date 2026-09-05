/**
 * Local chat sessions and history storage management
 */

export interface ChatSession<T = any> {
	id: string;
	title: string;
	createdAt: string;
	updatedAt: string;
	messages: T[];
}

export const STORAGE_KEYS = {
	CHAT_HISTORY: "aiworkstation_chat_history_v1",
	CHAT_SESSIONS: "aiworkstation_chat_sessions_v1",
} as const;

/**
 * Load legacy chat history from localStorage
 */
export function getChatHistory<T = any>(): T[] {
	if (typeof window === "undefined") return [];
	try {
		const raw = window.localStorage.getItem(STORAGE_KEYS.CHAT_HISTORY);
		if (raw) {
			return JSON.parse(raw);
		}
	} catch (err) {
		console.error("Failed to load chat history from localStorage:", err);
	}
	return [];
}

/**
 * Persist legacy chat history to localStorage
 */
export function saveChatHistory<T = any>(history: T[]): void {
	if (typeof window === "undefined") return;
	try {
		window.localStorage.setItem(
			STORAGE_KEYS.CHAT_HISTORY,
			JSON.stringify(history),
		);
	} catch (err) {
		console.error("Failed to save chat history to localStorage:", err);
	}
}

/**
 * Clear legacy chat history
 */
export function clearChatHistory(): void {
	if (typeof window === "undefined") return;
	try {
		window.localStorage.removeItem(STORAGE_KEYS.CHAT_HISTORY);
	} catch (err) {
		console.error("Failed to clear chat history from localStorage:", err);
	}
}

/**
 * Load all chat sessions from localStorage
 */
export function getChatSessions<T = any>(): ChatSession<T>[] {
	if (typeof window === "undefined") return [];
	try {
		const raw = window.localStorage.getItem(STORAGE_KEYS.CHAT_SESSIONS);
		if (raw) {
			return JSON.parse(raw);
		}
	} catch (err) {
		console.error("Failed to load chat sessions from localStorage:", err);
	}
	return [];
}

/**
 * Persist all chat sessions to localStorage
 */
export function saveChatSessions<T = any>(sessions: ChatSession<T>[]): void {
	if (typeof window === "undefined") return;
	try {
		window.localStorage.setItem(
			STORAGE_KEYS.CHAT_SESSIONS,
			JSON.stringify(sessions),
		);
	} catch (err) {
		console.error("Failed to save chat sessions to localStorage:", err);
	}
}

/**
 * Delete a single chat session by ID
 */
export function deleteChatSession(sessionId: string): void {
	if (typeof window === "undefined") return;
	try {
		const sessions = getChatSessions().filter((s) => s.id !== sessionId);
		saveChatSessions(sessions);
	} catch (err) {
		console.error("Failed to delete chat session:", err);
	}
}

/**
 * Clear all saved chat sessions
 */
export function clearChatSessions(): void {
	if (typeof window === "undefined") return;
	try {
		window.localStorage.removeItem(STORAGE_KEYS.CHAT_SESSIONS);
	} catch (err) {
		console.error("Failed to clear chat sessions from localStorage:", err);
	}
}

/**
 * Clear all local chat data (legacy history + sessions)
 */
export function clearAllChatData(): void {
	if (typeof window === "undefined") return;
	try {
		window.localStorage.removeItem(STORAGE_KEYS.CHAT_HISTORY);
		window.localStorage.removeItem(STORAGE_KEYS.CHAT_SESSIONS);
	} catch (err) {
		console.error("Failed to clear chat data from localStorage:", err);
	}
}
