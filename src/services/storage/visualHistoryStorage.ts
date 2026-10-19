import type {
	VisualChatSession,
	VisualGenerationItem,
} from "../../types/visualGeneration.ts";
import {
	clearAllVisualSessionsFromDb,
	deleteVisualSessionFromDb,
	fetchVisualSessionsFromDb,
	removeVisualItemFromDb,
	removeVisualItemsFromDb,
	renameVisualSessionInDb,
	saveVisualSessionToDb,
} from "../api/visualSessionClient.ts";

const ACTIVE_SESSION_STORAGE_KEY = "aiworkstation_active_visual_session_id";

// In-memory cache for ultra-fast synchronous UI access
let cachedSessions: VisualChatSession[] = [];
let currentDraftSession: VisualChatSession | null = null;
let isInitialized = false;
let initPromise: Promise<VisualChatSession[]> | null = null;
const listeners = new Set<(sessions: VisualChatSession[]) => void>();

function notifyListeners(): void {
	for (const listener of listeners) {
		try {
			listener(cachedSessions);
		} catch (err) {
			console.warn("[VisualHistoryStorage] Listener error:", err);
		}
	}
}

/**
 * Storage service for managing visual conversation sessions purely in SQLite database.
 * Follows draft pattern: creating new sessions does NOT write empty sessions to DB or history list.
 */
export const VisualHistoryStorageService = {
	/**
	 * Subscribe to session updates
	 */
	subscribe(callback: (sessions: VisualChatSession[]) => void): () => void {
		listeners.add(callback);
		return () => listeners.delete(callback);
	},

	/**
	 * Initialize sessions from SQLite database
	 */
	async initFromDb(): Promise<VisualChatSession[]> {
		if (initPromise) return initPromise;

		initPromise = (async () => {
			const dbSessions = await fetchVisualSessionsFromDb();
			cachedSessions = (dbSessions || [])
				.filter((s) => s.items && s.items.length > 0)
				.map((s) => ({
					...s,
					items: (s.items || []).sort((a, b) => a.createdAt - b.createdAt),
				}));

			isInitialized = true;
			notifyListeners();
			return cachedSessions;
		})();

		return initPromise;
	},

	/**
	 * Synchronously get in-memory cached visual sessions, sorted by updatedAt descending.
	 */
	getSessions(): VisualChatSession[] {
		if (!isInitialized && !initPromise && typeof window !== "undefined") {
			this.initFromDb().catch(() => {});
		}
		return cachedSessions;
	},

	/**
	 * Asynchronously fetch latest sessions directly from SQLite database.
	 */
	async fetchSessions(): Promise<VisualChatSession[]> {
		return this.initFromDb();
	},

	/**
	 * Get the currently active session ID.
	 */
	getActiveSessionId(): string | null {
		if (typeof window === "undefined") return null;
		try {
			return localStorage.getItem(ACTIVE_SESSION_STORAGE_KEY);
		} catch {
			return null;
		}
	},

	/**
	 * Set active session ID.
	 */
	setActiveSessionId(id: string): void {
		if (typeof window === "undefined") return;
		try {
			localStorage.setItem(ACTIVE_SESSION_STORAGE_KEY, id);
		} catch {
			// Ignore
		}
	},

	/**
	 * Get the active session, or create a fresh draft if none exists.
	 */
	getCurrentSession(): VisualChatSession {
		const sessions = this.getSessions();
		const activeId = this.getActiveSessionId();

		if (currentDraftSession && currentDraftSession.id === activeId) {
			return currentDraftSession;
		}

		if (activeId) {
			const found = sessions.find((s) => s.id === activeId);
			if (found) {
				return found;
			}
		}

		if (sessions.length > 0) {
			this.setActiveSessionId(sessions[0].id);
			return sessions[0];
		}

		return this.createSession();
	},

	/**
	 * Create a new visual session as an unpersisted draft.
	 * Does not write to DB or cached history until generation succeeds.
	 */
	createSession(initialTitle = "新视觉对话"): VisualChatSession {
		const newSession: VisualChatSession = {
			id: `vsession_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
			title: initialTitle,
			createdAt: Date.now(),
			updatedAt: Date.now(),
			items: [],
		};

		currentDraftSession = newSession;
		this.setActiveSessionId(newSession.id);
		notifyListeners();

		return newSession;
	},

	/**
	 * Switch active session by ID.
	 */
	switchSession(sessionId: string): VisualChatSession | null {
		const sessions = this.getSessions();
		const found = sessions.find((s) => s.id === sessionId);
		if (found) {
			currentDraftSession = null;
			this.setActiveSessionId(found.id);
			notifyListeners();
			return found;
		}
		return null;
	},

	/**
	 * Save or update a specific session in SQLite.
	 */
	saveSession(session: VisualChatSession): void {
		if (!session.items || session.items.length === 0) return;

		const filtered = cachedSessions.filter((s) => s.id !== session.id);
		cachedSessions = [session, ...filtered];
		notifyListeners();

		saveVisualSessionToDb(session).catch((err) => {
			console.error(
				"[VisualHistoryStorage] Failed to save session to DB:",
				err,
			);
		});
	},

	/**
	 * Append a new generated item into the current session and persist to SQLite.
	 */
	addItemToCurrentSession(item: VisualGenerationItem): VisualChatSession {
		const current = this.getCurrentSession();
		const updatedItems = [...current.items, item];

		let newTitle = current.title;
		if (
			current.items.length === 0 ||
			current.title.startsWith("新视觉对话") ||
			current.title.startsWith("视觉对话")
		) {
			newTitle =
				(item.userPrompt || item.prompt).trim().slice(0, 24) || "视觉创作";
		}

		const updatedSession: VisualChatSession = {
			...current,
			title: newTitle,
			updatedAt: Date.now(),
			items: updatedItems,
		};

		if (currentDraftSession?.id === updatedSession.id) {
			currentDraftSession = null;
		}

		const filtered = cachedSessions.filter((s) => s.id !== updatedSession.id);
		cachedSessions = [updatedSession, ...filtered];
		this.setActiveSessionId(updatedSession.id);
		notifyListeners();

		saveVisualSessionToDb(updatedSession).catch((err) => {
			console.error("[VisualHistoryStorage] Failed to save session to DB:", err);
		});

		return updatedSession;
	},

	/**
	 * Remove a specific item from the current session and SQLite.
	 */
	removeItemFromCurrentSession(itemId: string): VisualChatSession {
		const current = this.getCurrentSession();
		const updatedItems = current.items.filter((i) => i.id !== itemId);
		const updatedSession: VisualChatSession = {
			...current,
			updatedAt: Date.now(),
			items: updatedItems,
		};

		const filtered = cachedSessions.filter((s) => s.id !== updatedSession.id);
		cachedSessions = [updatedSession, ...filtered];
		notifyListeners();

		removeVisualItemFromDb(itemId).catch((err) => {
			console.error(
				"[VisualHistoryStorage] Failed to remove item from DB:",
				err,
			);
		});

		return updatedSession;
	},

	/**
	 * Remove multiple items from the current session and SQLite.
	 */
	removeItemsFromCurrentSession(
		itemIds: string[] | Set<string>,
	): VisualChatSession {
		const idSet = itemIds instanceof Set ? itemIds : new Set(itemIds);
		const current = this.getCurrentSession();
		const updatedItems = current.items.filter((i) => !idSet.has(i.id));
		const updatedSession: VisualChatSession = {
			...current,
			updatedAt: Date.now(),
			items: updatedItems,
		};

		const filtered = cachedSessions.filter((s) => s.id !== updatedSession.id);
		cachedSessions = [updatedSession, ...filtered];
		notifyListeners();

		removeVisualItemsFromDb(Array.from(idSet)).catch((err) => {
			console.error(
				"[VisualHistoryStorage] Failed to batch remove items from DB:",
				err,
			);
		});

		return updatedSession;
	},

	/**
	 * Delete a session by ID from SQLite.
	 */
	deleteSession(sessionId: string): VisualChatSession {
		cachedSessions = cachedSessions.filter((s) => s.id !== sessionId);
		notifyListeners();

		deleteVisualSessionFromDb(sessionId).catch((err) => {
			console.error(
				"[VisualHistoryStorage] Failed to delete session from DB:",
				err,
			);
		});

		const activeId = this.getActiveSessionId();
		if (activeId === sessionId || !activeId) {
			if (cachedSessions.length > 0) {
				this.setActiveSessionId(cachedSessions[0].id);
				return cachedSessions[0];
			}
			return this.createSession();
		}

		return this.getCurrentSession();
	},

	/**
	 * Clear all sessions from SQLite and start a new blank session.
	 */
	clearAllSessions(): VisualChatSession {
		cachedSessions = [];
		if (typeof window !== "undefined") {
			try {
				localStorage.removeItem(ACTIVE_SESSION_STORAGE_KEY);
			} catch {
				// Ignore
			}
		}

		clearAllVisualSessionsFromDb().catch((err) => {
			console.error(
				"[VisualHistoryStorage] Failed to clear sessions from DB:",
				err,
			);
		});

		return this.createSession();
	},

	/**
	 * Rename a session in SQLite.
	 */
	renameSession(sessionId: string, newTitle: string): void {
		const cleanTitle = newTitle.trim();
		const target = cachedSessions.find((s) => s.id === sessionId);
		if (target) {
			target.title = cleanTitle || target.title;
			target.updatedAt = Date.now();
			notifyListeners();

			renameVisualSessionInDb(sessionId, target.title).catch((err) => {
				console.error(
					"[VisualHistoryStorage] Failed to rename session in DB:",
					err,
				);
			});
		}
	},

	// ── Backward Compatible Facade Methods ─────────────────────────────────

	getHistory(): VisualGenerationItem[] {
		return this.getCurrentSession().items;
	},

	addItem(item: VisualGenerationItem): void {
		this.addItemToCurrentSession(item);
	},

	removeItem(id: string): void {
		this.removeItemFromCurrentSession(id);
	},

	clear(): void {
		const current = this.getCurrentSession();
		const updated: VisualChatSession = {
			...current,
			items: [],
			updatedAt: Date.now(),
		};
		this.saveSession(updated);
	},

	/**
	 * Export all visual generation sessions as JSON file
	 */
	exportAllSessionsToJson(): void {
		const sessions = this.getSessions();
		const nowFormatted = new Date().toISOString().slice(0, 10);
		const filename = `aiworkstation_visual_history_${nowFormatted}.json`;
		downloadJsonFile(filename, {
			exportedAt: new Date().toISOString(),
			version: "1.0",
			totalSessions: sessions.length,
			sessions,
		});
	},

	/**
	 * Export a single visual session as JSON file
	 */
	exportSessionToJson(session: VisualChatSession): void {
		const dateTag = new Date().toISOString().slice(0, 10);
		const cleanTitle = (session.title || "visual")
			.replace(/[\\/:*?"<>|]/g, "_")
			.slice(0, 30);
		const filename = `${cleanTitle}_${dateTag}.json`;
		downloadJsonFile(filename, {
			exportedAt: new Date().toISOString(),
			session,
		});
	},
};

/**
 * Helper to trigger browser download of JSON file
 */
function downloadJsonFile(filename: string, data: unknown): void {
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
