/**
 * Chat session data structures and legacy storage cleanup
 */

export interface ChatSession<T = any> {
	id: string;
	title: string;
	createdAt: string;
	updatedAt: string;
	messages: T[];
}

export const LEGACY_STORAGE_KEYS = {
	CHAT_HISTORY: "aiworkstation_chat_history_v1",
	CHAT_SESSIONS: "aiworkstation_chat_sessions_v1",
} as const;

/**
 * Purge all legacy chat data from localStorage to free browser storage budget
 */
export function purgeLegacyChatLocalStorage(): void {
	if (typeof window === "undefined") return;
	try {
		window.localStorage.removeItem(LEGACY_STORAGE_KEYS.CHAT_HISTORY);
		window.localStorage.removeItem(LEGACY_STORAGE_KEYS.CHAT_SESSIONS);
	} catch {
		// Ignore if localStorage is restricted
	}
}
