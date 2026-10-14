import { Store } from "@tanstack/store";
import type { ChatItem } from "../hooks/ai/useChatMessages";
import type { ChatSession } from "../services/workbenchStorage";

export interface SessionRuntime {
	id: string;
	title: string;
	messages: ChatItem[];
	status: "idle" | "running" | "error";
	error?: string;
	createdAt?: string;
	updatedAt?: string;
	hasUnread?: boolean;
}

export interface AgentSessionState {
	activeSessionId: string;
	sessions: Record<string, SessionRuntime>;
	order: string[];
}

const LAST_ACTIVE_SESSION_KEY = "aiworkstation_last_active_chat_session_id";

function getInitialActiveSessionId(): string {
	if (typeof window !== "undefined") {
		try {
			const saved = localStorage.getItem(LAST_ACTIVE_SESSION_KEY);
			if (saved) return saved;
		} catch {
			// Ignore localStorage access failures
		}
	}
	return `session_${Date.now()}`;
}

const initialActiveId = getInitialActiveSessionId();

const initialState: AgentSessionState = {
	activeSessionId: initialActiveId,
	sessions: {
		[initialActiveId]: {
			id: initialActiveId,
			title: "新对话",
			messages: [],
			status: "idle",
		},
	},
	order: [initialActiveId],
};

export const agentSessionStore = new Store<AgentSessionState>(initialState);

export const agentSessionActions = {
	/**
	 * Change current active session displayed in UI
	 */
	setActiveSessionId: (id: string) => {
		if (typeof window !== "undefined") {
			try {
				localStorage.setItem(LAST_ACTIVE_SESSION_KEY, id);
			} catch {
				// Ignore localStorage write failures
			}
		}

		agentSessionStore.setState((prev) => {
			const existing = prev.sessions[id];
			const updatedSessions: Record<string, SessionRuntime> = existing
				? {
						...prev.sessions,
						[id]: { ...existing, hasUnread: false },
					}
				: {
						...prev.sessions,
						[id]: {
							id,
							title: "新对话",
							messages: [],
							status: "idle" as const,
						},
					};

			const updatedOrder = prev.order.includes(id)
				? prev.order
				: [id, ...prev.order];

			return {
				...prev,
				activeSessionId: id,
				sessions: updatedSessions,
				order: updatedOrder,
			};
		});
	},

	/**
	 * Populate sessions initialized from SQLite database
	 */
	initSessions: (
		dbSessions: ChatSession<ChatItem>[],
		preferredActiveId?: string,
	) => {
		agentSessionStore.setState((prev) => {
			const sessionsMap = { ...prev.sessions };
			const order: string[] = [];

			for (const ds of dbSessions) {
				order.push(ds.id);
				// Preserve runtime status if session is already running in memory
				const existing = sessionsMap[ds.id];
				sessionsMap[ds.id] = {
					id: ds.id,
					title: ds.title || "新对话",
					messages: existing?.messages?.length ? existing.messages : ds.messages || [],
					status: existing?.status || "idle",
					createdAt: ds.createdAt,
					updatedAt: ds.updatedAt,
					hasUnread: existing?.hasUnread || false,
				};
			}

			// Ensure activeSessionId exists in sessions map
			let activeId = preferredActiveId || prev.activeSessionId;
			if (!sessionsMap[activeId]) {
				if (order.length > 0) {
					activeId = order[0];
				} else {
					sessionsMap[activeId] = {
						id: activeId,
						title: "新对话",
						messages: [],
						status: "idle",
					};
					order.push(activeId);
				}
			}

			return {
				...prev,
				activeSessionId: activeId,
				sessions: sessionsMap,
				order,
			};
		});
	},

	/**
	 * Ensure session exists in store with optional initial payload
	 */
	ensureSession: (
		id: string,
		initialTitle = "新对话",
		initialMessages: ChatItem[] = [],
	): SessionRuntime => {
		const state = agentSessionStore.state;
		if (state.sessions[id]) {
			return state.sessions[id];
		}

		const newSession: SessionRuntime = {
			id,
			title: initialTitle,
			messages: initialMessages,
			status: "idle",
		};

		agentSessionStore.setState((prev) => ({
			...prev,
			sessions: {
				...prev.sessions,
				[id]: newSession,
			},
			order: prev.order.includes(id) ? prev.order : [id, ...prev.order],
		}));

		return newSession;
	},

	/**
	 * Update message list for specific session
	 */
	setSessionMessages: (
		id: string,
		messages:
			| ChatItem[]
			| ((prevMsgs: ChatItem[]) => ChatItem[]),
	) => {
		agentSessionStore.setState((prev) => {
			const session = prev.sessions[id];
			if (!session) return prev;

			const newMessages =
				typeof messages === "function" ? messages(session.messages) : messages;

			// Automatically infer session title from first user message if still default
			let title = session.title;
			if (title === "新对话" || !title) {
				const firstUser = newMessages.find((m) => m.role === "user");
				if (firstUser?.content) {
					const raw = firstUser.content.trim().slice(0, 24);
					title = raw.length >= 24 ? `${raw}...` : raw;
				}
			}

			return {
				...prev,
				sessions: {
					...prev.sessions,
					[id]: {
						...session,
						title,
						messages: newMessages,
					},
				},
			};
		});
	},

	/**
	 * Update status of specific session
	 */
	setSessionStatus: (
		id: string,
		status: "idle" | "running" | "error",
		error?: string,
	) => {
		agentSessionStore.setState((prev) => {
			const session = prev.sessions[id];
			if (!session) return prev;

			const isCurrentlyActive = prev.activeSessionId === id;
			const hasUnread =
				status === "idle" && session.status === "running" && !isCurrentlyActive
					? true
					: session.hasUnread;

			return {
				...prev,
				sessions: {
					...prev.sessions,
					[id]: {
						...session,
						status,
						error,
						hasUnread,
					},
				},
			};
		});
	},

	/**
	 * Remove a session from memory
	 */
	removeSession: (id: string) => {
		agentSessionStore.setState((prev) => {
			const newSessions = { ...prev.sessions };
			delete newSessions[id];
			const newOrder = prev.order.filter((sid) => sid !== id);

			let nextActiveId = prev.activeSessionId;
			if (nextActiveId === id) {
				nextActiveId = newOrder[0] || `session_${Date.now()}`;
				if (!newSessions[nextActiveId]) {
					newSessions[nextActiveId] = {
						id: nextActiveId,
						title: "新对话",
						messages: [],
						status: "idle",
					};
					newOrder.push(nextActiveId);
				}
			}

			return {
				...prev,
				activeSessionId: nextActiveId,
				sessions: newSessions,
				order: newOrder,
			};
		});
	},

	/**
	 * Clear all sessions from memory
	 */
	clearAll: () => {
		const freshId = `session_${Date.now()}`;
		agentSessionStore.setState(() => ({
			activeSessionId: freshId,
			sessions: {
				[freshId]: {
					id: freshId,
					title: "新对话",
					messages: [],
					status: "idle",
				},
			},
			order: [freshId],
		}));
	},
};
