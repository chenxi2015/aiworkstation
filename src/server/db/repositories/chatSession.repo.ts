import type { SqliteDatabase } from "../types.ts";

export interface ChatSessionRecord<T = any> {
	id: string;
	title: string;
	createdAt: string;
	updatedAt: string;
	messages: T[];
}

/**
 * Sanitize messages by removing transient UI flags (isStreaming) and closing running steps
 */
function sanitizeSessionMessages<T = any>(messages: T[]): T[] {
	if (!Array.isArray(messages)) return [];
	return messages.map((m: any) => {
		if (!m || typeof m !== "object") return m;
		const copy = { ...m, isStreaming: false };
		// Mark unclosed steps as completed/interrupted
		if (Array.isArray(copy.steps)) {
			copy.steps = copy.steps.map((step: any) => {
				if (!step || typeof step !== "object") return step;
				if (step.status === "running") {
					return { ...step, status: "completed" };
				}
				return step;
			});
		}
		return copy;
	});
}

/**
 * Repository for managing AI chat sessions in SQLite
 */
export class ChatSessionRepository {
	constructor(private db: SqliteDatabase) {}

	/**
	 * Retrieve all chat sessions sorted by last updated timestamp descending
	 */
	getAllSessions<T = any>(): ChatSessionRecord<T>[] {
		const stmt = this.db.prepare(
			"SELECT id, title, messages, created_at, updated_at FROM chat_sessions ORDER BY updated_at DESC",
		);
		const rows = stmt.all() as Array<{
			id: string;
			title: string;
			messages: string;
			created_at: string;
			updated_at: string;
		}>;

		return rows.map((row) => {
			let parsedMessages: T[] = [];
			try {
				parsedMessages = JSON.parse(row.messages || "[]");
			} catch (err) {
				console.warn(
					`[ChatSessionRepository] Failed to parse messages for session ${row.id}:`,
					err,
				);
			}

			return {
				id: row.id,
				title: row.title,
				createdAt: row.created_at,
				updatedAt: row.updated_at,
				messages: sanitizeSessionMessages(parsedMessages),
			};
		});
	}

	/**
	 * Find a single chat session by ID
	 */
	getSessionById<T = any>(id: string): ChatSessionRecord<T> | null {
		const stmt = this.db.prepare(
			"SELECT id, title, messages, created_at, updated_at FROM chat_sessions WHERE id = ?",
		);
		const row = stmt.get(id) as
			| {
					id: string;
					title: string;
					messages: string;
					created_at: string;
					updated_at: string;
			  }
			| undefined;

		if (!row) return null;

		let parsedMessages: T[] = [];
		try {
			parsedMessages = JSON.parse(row.messages || "[]");
		} catch {
			parsedMessages = [];
		}

		return {
			id: row.id,
			title: row.title,
			createdAt: row.created_at,
			updatedAt: row.updated_at,
			messages: sanitizeSessionMessages(parsedMessages),
		};
	}

	/**
	 * Upsert a single chat session
	 */
	saveSession<T = any>(session: ChatSessionRecord<T>): void {
		const stmt = this.db.prepare(`
			INSERT INTO chat_sessions (id, title, messages, created_at, updated_at)
			VALUES (@id, @title, @messages, @createdAt, @updatedAt)
			ON CONFLICT(id) DO UPDATE SET
				title = excluded.title,
				messages = excluded.messages,
				updated_at = excluded.updated_at
		`);

		const sanitizedMessages = sanitizeSessionMessages(session.messages || []);

		stmt.run({
			id: session.id,
			title: session.title || "新对话",
			messages: JSON.stringify(sanitizedMessages),
			createdAt: session.createdAt || new Date().toISOString(),
			updatedAt: session.updatedAt || new Date().toISOString(),
		});
	}

	/**
	 * Delete a single chat session by ID
	 */
	deleteSession(id: string): void {
		this.db.prepare("DELETE FROM chat_sessions WHERE id = ?").run(id);
	}

	/**
	 * Clear all chat sessions
	 */
	clearAllSessions(): void {
		this.db.prepare("DELETE FROM chat_sessions").run();
	}

	/**
	 * Export all chat sessions formatted for JSON file download
	 */
	exportAllToJson(): {
		exportedAt: string;
		version: string;
		totalSessions: number;
		sessions: ChatSessionRecord[];
	} {
		const sessions = this.getAllSessions();
		return {
			exportedAt: new Date().toISOString(),
			version: "1.0",
			totalSessions: sessions.length,
			sessions,
		};
	}
}
