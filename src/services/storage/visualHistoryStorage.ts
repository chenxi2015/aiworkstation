import type {
	VisualChatSession,
	VisualGenerationItem,
} from "../../types/visualGeneration.ts";

const SESSIONS_STORAGE_KEY = "aiworkstation_visual_sessions_v1";
const ACTIVE_SESSION_STORAGE_KEY = "aiworkstation_active_visual_session_id";
const LEGACY_STORAGE_KEY = "aiworkstation_visual_history_records";
const MAX_SESSIONS = 50;

/**
 * Storage service for managing multiple visual conversation sessions locally.
 * Supports auto-migration from legacy single-array history and preserves chronological order.
 */
export const VisualHistoryStorageService = {
	/**
	 * Get all visual sessions, sorted by updatedAt descending (most recent first).
	 */
	getSessions(): VisualChatSession[] {
		if (typeof window === "undefined") return [];
		try {
			const raw = localStorage.getItem(SESSIONS_STORAGE_KEY);
			if (raw) {
				const parsed = JSON.parse(raw);
				if (Array.isArray(parsed) && parsed.length > 0) {
					return parsed.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
				}
			}

			// Migration check from legacy single-array storage
			const legacyRaw = localStorage.getItem(LEGACY_STORAGE_KEY);
			if (legacyRaw) {
				const legacyItems: VisualGenerationItem[] = JSON.parse(legacyRaw);
				if (Array.isArray(legacyItems) && legacyItems.length > 0) {
					// Sort chronologically ascending
					const sortedItems = [...legacyItems].sort(
						(a, b) => a.createdAt - b.createdAt,
					);
					const initialSession: VisualChatSession = {
						id: `vsession_${Date.now()}`,
						title: sortedItems[0]?.prompt?.slice(0, 24) || "视觉对话 1",
						createdAt: sortedItems[0]?.createdAt || Date.now(),
						updatedAt: Date.now(),
						items: sortedItems,
					};
					this.saveSessions([initialSession]);
					this.setActiveSessionId(initialSession.id);
					return [initialSession];
				}
			}

			return [];
		} catch (err) {
			console.warn("[VisualHistoryStorage] Failed to read sessions:", err);
			return [];
		}
	},

	/**
	 * Persist all visual sessions.
	 */
	saveSessions(sessions: VisualChatSession[]): void {
		if (typeof window === "undefined") return;
		try {
			const trimmed = sessions.slice(0, MAX_SESSIONS);
			localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(trimmed));
		} catch (err) {
			console.warn("[VisualHistoryStorage] Failed to save sessions:", err);
		}
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
			// Ignore storage write failure
		}
	},

	/**
	 * Get the active session, or create a fresh one if none exists.
	 */
	getCurrentSession(): VisualChatSession {
		const sessions = this.getSessions();
		const activeId = this.getActiveSessionId();

		if (activeId) {
			const found = sessions.find((s) => s.id === activeId);
			if (found) {
				// Ensure items are chronologically ascending
				found.items = [...found.items].sort(
					(a, b) => a.createdAt - b.createdAt,
				);
				return found;
			}
		}

		if (sessions.length > 0) {
			this.setActiveSessionId(sessions[0].id);
			return sessions[0];
		}

		// Create a brand new session
		return this.createSession();
	},

	/**
	 * Create a new visual session and make it active.
	 */
	createSession(initialTitle = "新视觉对话"): VisualChatSession {
		const newSession: VisualChatSession = {
			id: `vsession_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
			title: initialTitle,
			createdAt: Date.now(),
			updatedAt: Date.now(),
			items: [],
		};

		const sessions = this.getSessions();
		const updated = [newSession, ...sessions];
		this.saveSessions(updated);
		this.setActiveSessionId(newSession.id);
		return newSession;
	},

	/**
	 * Switch active session by ID.
	 */
	switchSession(sessionId: string): VisualChatSession | null {
		const sessions = this.getSessions();
		const found = sessions.find((s) => s.id === sessionId);
		if (found) {
			this.setActiveSessionId(found.id);
			found.items = [...found.items].sort((a, b) => a.createdAt - b.createdAt);
			return found;
		}
		return null;
	},

	/**
	 * Save or update a specific session.
	 */
	saveSession(session: VisualChatSession): void {
		const sessions = this.getSessions();
		const filtered = sessions.filter((s) => s.id !== session.id);
		// Keep items chronologically sorted
		session.items = [...session.items].sort(
			(a, b) => a.createdAt - b.createdAt,
		);
		const updated = [session, ...filtered];
		this.saveSessions(updated);
	},

	/**
	 * Append a new generated item into the current session in chronological order.
	 */
	addItemToCurrentSession(item: VisualGenerationItem): VisualChatSession {
		const current = this.getCurrentSession();
		const existing = current.items.filter((i) => i.id !== item.id);
		// Append to the end to maintain chronological sequence
		const updatedItems = [...existing, item].sort(
			(a, b) => a.createdAt - b.createdAt,
		);

		// If this is the first turn or default title, derive title from prompt
		let newTitle = current.title;
		if (
			current.items.length === 0 ||
			current.title.startsWith("新视觉对话") ||
			current.title.startsWith("视觉对话")
		) {
			newTitle = item.prompt.trim().slice(0, 24) || "视觉创作";
		}

		const updatedSession: VisualChatSession = {
			...current,
			title: newTitle,
			updatedAt: Date.now(),
			items: updatedItems,
		};

		this.saveSession(updatedSession);
		return updatedSession;
	},

	/**
	 * Remove a specific item from the current session.
	 */
	removeItemFromCurrentSession(itemId: string): VisualChatSession {
		const current = this.getCurrentSession();
		const updatedItems = current.items.filter((i) => i.id !== itemId);
		const updatedSession: VisualChatSession = {
			...current,
			updatedAt: Date.now(),
			items: updatedItems,
		};
		this.saveSession(updatedSession);
		return updatedSession;
	},

	/**
	 * Remove multiple items from the current session.
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
		this.saveSession(updatedSession);
		return updatedSession;
	},

	/**
	 * Delete a session by ID. If current session is deleted, switches to next available or creates new.
	 */
	deleteSession(sessionId: string): VisualChatSession {
		const sessions = this.getSessions().filter((s) => s.id !== sessionId);
		this.saveSessions(sessions);

		const activeId = this.getActiveSessionId();
		if (activeId === sessionId || !activeId) {
			if (sessions.length > 0) {
				this.setActiveSessionId(sessions[0].id);
				return sessions[0];
			}
			return this.createSession();
		}

		return this.getCurrentSession();
	},

	/**
	 * Clear all sessions and start a new blank session.
	 */
	clearAllSessions(): VisualChatSession {
		if (typeof window !== "undefined") {
			try {
				localStorage.removeItem(SESSIONS_STORAGE_KEY);
				localStorage.removeItem(ACTIVE_SESSION_STORAGE_KEY);
				localStorage.removeItem(LEGACY_STORAGE_KEY);
			} catch (err) {
				console.warn("[VisualHistoryStorage] Failed to clear:", err);
			}
		}
		return this.createSession();
	},

	/**
	 * Rename a session.
	 */
	renameSession(sessionId: string, newTitle: string): void {
		const sessions = this.getSessions();
		const target = sessions.find((s) => s.id === sessionId);
		if (target) {
			target.title = newTitle.trim() || target.title;
			target.updatedAt = Date.now();
			this.saveSession(target);
		}
	},

	// ── Backward Compatible Facade Methods ─────────────────────────────────

	/** Legacy compatibility: get items of current session */
	getHistory(): VisualGenerationItem[] {
		return this.getCurrentSession().items;
	},

	/** Legacy compatibility: add item */
	addItem(item: VisualGenerationItem): void {
		this.addItemToCurrentSession(item);
	},

	/** Legacy compatibility: remove item */
	removeItem(id: string): void {
		this.removeItemFromCurrentSession(id);
	},

	/** Legacy compatibility: clear items of current session */
	clear(): void {
		const current = this.getCurrentSession();
		const updated: VisualChatSession = {
			...current,
			items: [],
			updatedAt: Date.now(),
		};
		this.saveSession(updated);
	},
};
