import type {
	VisualChatSession,
	VisualGenerationItem,
} from "../../../types/visualGeneration.ts";
import type { SqliteDatabase } from "../types.ts";

interface VisualSessionRow {
	id: string;
	title: string;
	items: string;
	created_at: number;
	updated_at: number;
}

/**
 * Repository for managing AI visual conversation sessions in SQLite.
 * Uses a single-table design with items stored as JSON, avoiding any item ID uniqueness issues.
 */
export class VisualSessionRepository {
	constructor(private db: SqliteDatabase) {}

	/**
	 * Retrieve all visual sessions ordered by updated_at descending.
	 */
	getAllSessions(): VisualChatSession[] {
		// Clean up any empty sessions with no items
		try {
			this.db
				.prepare(
					"DELETE FROM visual_sessions WHERE items = '[]' OR items IS NULL OR trim(items) = ''",
				)
				.run();
		} catch {
			// Ignore cleanup errors
		}

		const rows = this.db
			.prepare(
				"SELECT id, title, items, created_at, updated_at FROM visual_sessions ORDER BY updated_at DESC",
			)
			.all() as VisualSessionRow[];

		return rows
			.map((row) => {
				let parsedItems: VisualGenerationItem[] = [];
				try {
					parsedItems = JSON.parse(row.items || "[]");
				} catch {
					parsedItems = [];
				}
				return {
					id: row.id,
					title: row.title,
					createdAt: Number(row.created_at),
					updatedAt: Number(row.updated_at),
					items: parsedItems,
				};
			})
			.filter((session) => session.items.length > 0);
	}

	/**
	 * Retrieve a single visual session by ID.
	 */
	getSessionById(id: string): VisualChatSession | null {
		const row = this.db
			.prepare(
				"SELECT id, title, items, created_at, updated_at FROM visual_sessions WHERE id = ?",
			)
			.get(id) as VisualSessionRow | undefined;

		if (!row) return null;

		let parsedItems: VisualGenerationItem[] = [];
		try {
			parsedItems = JSON.parse(row.items || "[]");
		} catch {
			parsedItems = [];
		}

		return {
			id: row.id,
			title: row.title,
			createdAt: Number(row.created_at),
			updatedAt: Number(row.updated_at),
			items: parsedItems,
		};
	}

	/**
	 * Save or update a session with its items list in SQLite.
	 */
	saveSession(session: VisualChatSession): void {
		if (!session.items || session.items.length === 0) {
			// Do not persist empty visual sessions to DB
			return;
		}

		const itemsJson = JSON.stringify(session.items || []);
		this.db
			.prepare(
				`INSERT INTO visual_sessions (id, title, items, created_at, updated_at)
				 VALUES (?, ?, ?, ?, ?)
				 ON CONFLICT(id) DO UPDATE SET
				   title = excluded.title,
				   items = excluded.items,
				   updated_at = excluded.updated_at`,
			)
			.run(
				session.id,
				session.title,
				itemsJson,
				session.createdAt || Date.now(),
				session.updatedAt || Date.now(),
			);
	}

	/**
	 * Append a new generated item into a session.
	 */
	addItem(
		sessionId: string,
		item: VisualGenerationItem,
		sessionTitle?: string,
	): void {
		const current = this.getSessionById(sessionId);
		const now = Date.now();
		const items = current?.items || [];
		items.push(item);

		const effectiveTitle =
			sessionTitle ||
			current?.title ||
			(item.userPrompt || item.prompt).trim().slice(0, 24) ||
			"视觉创作";

		this.saveSession({
			id: sessionId,
			title: effectiveTitle,
			createdAt: current?.createdAt || now,
			updatedAt: now,
			items,
		});
	}

	/**
	 * Remove a specific item from a session.
	 */
	removeItem(itemId: string): void {
		const sessions = this.getAllSessions();
		for (const session of sessions) {
			const index = session.items.findIndex((i) => i.id === itemId);
			if (index !== -1) {
				session.items.splice(index, 1);
				session.updatedAt = Date.now();
				this.saveSession(session);
				break;
			}
		}
	}

	/**
	 * Remove multiple items across sessions.
	 */
	removeItems(itemIds: string[]): void {
		if (!itemIds || itemIds.length === 0) return;
		const idSet = new Set(itemIds);
		const sessions = this.getAllSessions();
		for (const session of sessions) {
			const initialLen = session.items.length;
			session.items = session.items.filter((i) => !idSet.has(i.id));
			if (session.items.length !== initialLen) {
				session.updatedAt = Date.now();
				this.saveSession(session);
			}
		}
	}

	/**
	 * Delete a session by ID.
	 */
	deleteSession(id: string): void {
		this.db.prepare("DELETE FROM visual_sessions WHERE id = ?").run(id);
	}

	/**
	 * Clear all visual sessions.
	 */
	clearAllSessions(): void {
		this.db.prepare("DELETE FROM visual_sessions").run();
	}

	/**
	 * Rename a session.
	 */
	renameSession(id: string, title: string): void {
		this.db
			.prepare(
				"UPDATE visual_sessions SET title = ?, updated_at = ? WHERE id = ?",
			)
			.run(title.trim(), Date.now(), id);
	}
}
