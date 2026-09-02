import type {
	ItemType,
	WorkbenchItem,
} from "../../../components/workbench/types.ts";
import type {
	BookmarkQueryParams,
	EmbeddingStats,
	NeedingEmbeddingBookmark,
	SearchBookmarkItem,
	SqliteDatabase,
} from "../types.ts";

/**
 * Repository handling embedding vector persistence, hybrid search snapshot, and dynamic queries
 */
export class SearchRepository {
	constructor(private db: SqliteDatabase) {}

	/**
	 * Get embedding coverage statistics
	 */
	getEmbeddingStats(): EmbeddingStats {
		const totalRow = this.db
			.prepare("SELECT COUNT(*) as cnt FROM bookmarks")
			.get() as { cnt: number };
		const embeddedRow = this.db
			.prepare(
				"SELECT COUNT(*) as cnt FROM bookmarks WHERE embedding IS NOT NULL AND length(embedding) > 2",
			)
			.get() as { cnt: number };

		const total = totalRow?.cnt || 0;
		const embedded = embeddedRow?.cnt || 0;
		const percentage = total > 0 ? Math.round((embedded / total) * 100) : 0;
		return { total, embedded, percentage };
	}

	/**
	 * Get bookmarks that need embedding vector calculation (or force all if needed)
	 */
	getBookmarksNeedingEmbedding(
		limit = 50,
		forceAll = false,
	): NeedingEmbeddingBookmark[] {
		const query = forceAll
			? `SELECT id, title, url, description, keywords, summary, tags, parent_title FROM bookmarks ORDER BY updated_at DESC LIMIT ?`
			: `SELECT id, title, url, description, keywords, summary, tags, parent_title FROM bookmarks WHERE embedding IS NULL OR length(embedding) <= 2 ORDER BY updated_at DESC LIMIT ?`;

		return this.db.prepare(query).all(limit) as any[];
	}

	/**
	 * Save computed embedding vector and indexing text into bookmark
	 */
	updateBookmarkEmbedding(
		id: string,
		embedding: number[],
		embeddingText: string,
	): void {
		this.db
			.prepare(
				"UPDATE bookmarks SET embedding = ?, embedding_text = ?, updated_at = ? WHERE id = ?",
			)
			.run(
				JSON.stringify(embedding),
				embeddingText,
				new Date().toISOString().split("T")[0],
				id,
			);
	}

	/**
	 * Fetch all bookmarks enriched with folder details and parsed embeddings for fast hybrid search
	 */
	getAllBookmarksForSearch(): SearchBookmarkItem[] {
		const rows = this.db
			.prepare(
				`
      SELECT 
        b.id,
        b.title as name,
        b.url,
        b.item_type as type,
        b.description,
        b.keywords,
        b.summary,
        b.tags,
        b.favicon,
        b.created_at,
        b.embedding,
        f.id as folder_id,
        f.name as folder_name,
        f.category
      FROM bookmarks b
      LEFT JOIN folder_items fi ON b.id = fi.item_id
      LEFT JOIN folders f ON fi.folder_id = f.id
    `,
			)
			.all() as any[];

		return rows.map((r) => {
			let emb: number[] | null = null;
			if (r.embedding && typeof r.embedding === "string") {
				try {
					emb = JSON.parse(r.embedding);
				} catch {
					emb = null;
				}
			}
			let parsedTags: string[] = [];
			try {
				parsedTags = JSON.parse(r.tags || "[]");
			} catch {
				parsedTags = [];
			}

			return {
				id: r.id,
				name: r.name,
				url: r.url,
				type: (r.type || "link") as ItemType,
				description: r.description || "",
				keywords: r.keywords || "",
				summary: r.summary || r.name,
				tags: parsedTags,
				favicon: r.favicon || undefined,
				folderId: r.folder_id || null,
				folderName: r.folder_name || undefined,
				category: r.category || undefined,
				createdAt: r.created_at,
				embedding: emb,
			};
		});
	}

	/**
	 * Query bookmarks by structured conditions (time range, folder, category, tag, keyword)
	 */
	queryBookmarks(params: BookmarkQueryParams = {}): WorkbenchItem[] {
		const { limit = 30, sortBy = "date_added", sortOrder = "DESC" } = params;

		const conditions: string[] = [];
		const sqlArgs: any[] = [];

		this.applyTimeFilter(params, conditions, sqlArgs);
		this.applyEntityFilter(params, conditions, sqlArgs);

		const whereClause =
			conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

		// Determine safe sort field
		let orderField = "b.date_added";
		if (sortBy === "created_at") orderField = "b.created_at";
		else if (sortBy === "updated_at") orderField = "b.updated_at";
		const direction = sortOrder.toUpperCase() === "ASC" ? "ASC" : "DESC";

		const query = `
      SELECT 
        b.id,
        b.title as name,
        b.url,
        b.item_type as type,
        b.description,
        b.keywords,
        b.summary,
        b.tags,
        b.favicon,
        b.date_added,
        b.created_at,
        b.source,
        b.reason,
        f.id as folder_id,
        f.name as folder_name,
        f.category
      FROM bookmarks b
      LEFT JOIN folder_items fi ON b.id = fi.item_id
      LEFT JOIN folders f ON fi.folder_id = f.id
      ${whereClause}
      ORDER BY ${orderField} ${direction}, b.id DESC
      LIMIT ?
    `;

		sqlArgs.push(Math.min(Math.max(limit, 1), 100));

		const rows = this.db.prepare(query).all(...sqlArgs) as any[];

		return rows.map((r) => {
			let parsedTags: string[] = [];
			try {
				parsedTags = JSON.parse(r.tags || "[]");
			} catch {
				parsedTags = [];
			}

			return {
				id: r.id,
				name: r.name,
				url: r.url,
				type: (r.type || "link") as ItemType,
				description: r.description || "",
				keywords: r.keywords || "",
				summary: r.summary || r.name,
				tags: parsedTags,
				favicon: r.favicon || undefined,
				folderId: r.folder_id || null,
				folderName: r.folder_name || undefined,
				category: r.category || undefined,
				createdAt: r.created_at,
				dateAdded: r.date_added || undefined,
				source: r.source || "bookmark_sync",
				reason: r.reason || undefined,
			};
		});
	}

	/**
	 * Helper: build time range conditions
	 */
	private applyTimeFilter(
		params: BookmarkQueryParams,
		conditions: string[],
		sqlArgs: any[],
	): void {
		const { startDate, endDate, startTimeMs, endTimeMs } = params;

		if (typeof startTimeMs === "number" && startTimeMs > 0) {
			conditions.push(
				"(b.date_added >= ? OR (b.date_added IS NULL AND b.created_at >= ?))",
			);
			sqlArgs.push(startTimeMs);
			sqlArgs.push(new Date(startTimeMs).toISOString().split("T")[0]);
		} else if (startDate) {
			const startMs = new Date(`${startDate}T00:00:00`).getTime();
			conditions.push("(b.date_added >= ? OR b.created_at >= ?)");
			sqlArgs.push(startMs);
			sqlArgs.push(startDate);
		}

		if (typeof endTimeMs === "number" && endTimeMs > 0) {
			conditions.push(
				"(b.date_added <= ? OR (b.date_added IS NULL AND b.created_at <= ?))",
			);
			sqlArgs.push(endTimeMs);
			sqlArgs.push(new Date(endTimeMs).toISOString().split("T")[0]);
		} else if (endDate) {
			const endMs = new Date(`${endDate}T23:59:59.999`).getTime();
			conditions.push("(b.date_added <= ? OR b.created_at <= ?)");
			sqlArgs.push(endMs);
			sqlArgs.push(endDate);
		}
	}

	/**
	 * Helper: build folder, category, tag and keyword conditions
	 */
	private applyEntityFilter(
		params: BookmarkQueryParams,
		conditions: string[],
		sqlArgs: any[],
	): void {
		const { folderName, category, tag, keyword } = params;

		if (folderName && folderName.trim()) {
			conditions.push("(f.name LIKE ? OR b.parent_title LIKE ?)");
			sqlArgs.push(`%${folderName.trim()}%`);
			sqlArgs.push(`%${folderName.trim()}%`);
		}

		if (category && category.trim()) {
			conditions.push("f.category = ?");
			sqlArgs.push(category.trim());
		}

		if (tag && tag.trim()) {
			conditions.push("b.tags LIKE ?");
			sqlArgs.push(`%${tag.trim()}%`);
		}

		if (keyword && keyword.trim()) {
			conditions.push(
				"(b.title LIKE ? OR b.summary LIKE ? OR b.description LIKE ? OR b.keywords LIKE ?)",
			);
			const kw = `%${keyword.trim()}%`;
			sqlArgs.push(kw, kw, kw, kw);
		}
	}
}
