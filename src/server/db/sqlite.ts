import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import type {
	AIClassificationResult,
	BookmarkTDKItem,
	Folder,
	ItemType,
	WorkbenchItem,
} from "../../components/workbench/types";

// Determine database file path (stored in local .aiworkstation directory)
const DB_DIR = path.resolve(process.cwd(), ".aiworkstation");
if (!fs.existsSync(DB_DIR)) {
	fs.mkdirSync(DB_DIR, { recursive: true });
}
const DB_PATH = path.join(DB_DIR, "workbench.db");

/**
 * SQLite Database Manager for AI Workstation
 */
class WorkbenchDatabase {
	private db: Database;

	constructor() {
		this.db = new Database(DB_PATH, { timeout: 5000 });
		this.db.pragma("journal_mode = WAL");
		this.db.pragma("busy_timeout = 5000");
		this.db.pragma("foreign_keys = ON");
		this.initTables();
	}

	/**
	 * Initialize tables: folders, bookmarks, and folder_items relationship
	 */
	private initTables(): void {
		this.db.exec(`
      -- 1. Folders / Groups table
      CREATE TABLE IF NOT EXISTS folders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT '工作台',
        description TEXT DEFAULT '',
        icon TEXT DEFAULT '',
        sort_order INTEGER DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      -- 2. Bookmarks / Items table
      CREATE TABLE IF NOT EXISTS bookmarks (
        id TEXT PRIMARY KEY,
        url TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        description TEXT DEFAULT '',
        keywords TEXT DEFAULT '',
        summary TEXT DEFAULT '',
        item_type TEXT NOT NULL DEFAULT 'link',
        tags TEXT DEFAULT '[]',
        favicon TEXT DEFAULT '',
        parent_title TEXT DEFAULT '',
        folder_path TEXT DEFAULT '',
        reason TEXT DEFAULT '',
        source TEXT DEFAULT 'bookmark_sync',
        date_added INTEGER,
        embedding TEXT DEFAULT NULL,
        embedding_text TEXT DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      -- 3. Relationship table: folder_items (Many-to-Many / One-to-Many binding)
      CREATE TABLE IF NOT EXISTS folder_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        folder_id INTEGER NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
        item_id TEXT NOT NULL REFERENCES bookmarks(id) ON DELETE CASCADE,
        sort_order INTEGER DEFAULT 0,
        created_at TEXT NOT NULL,
        UNIQUE(folder_id, item_id)
      );

      -- Indexes for fast queries
      CREATE INDEX IF NOT EXISTS idx_folders_category ON folders(category);
      CREATE INDEX IF NOT EXISTS idx_folder_items_folder_id ON folder_items(folder_id);
      CREATE INDEX IF NOT EXISTS idx_folder_items_item_id ON folder_items(item_id);
      CREATE INDEX IF NOT EXISTS idx_bookmarks_url ON bookmarks(url);
    `);

		// Graceful migration for existing SQLite DBs without embedding columns
		try {
			const columns = this.db
				.prepare("PRAGMA table_info(bookmarks)")
				.all() as Array<{ name: string }>;
			const colNames = new Set(columns.map((c) => c.name));

			if (!colNames.has("embedding")) {
				this.db.exec(
					"ALTER TABLE bookmarks ADD COLUMN embedding TEXT DEFAULT NULL",
				);
			}
			if (!colNames.has("embedding_text")) {
				this.db.exec(
					"ALTER TABLE bookmarks ADD COLUMN embedding_text TEXT DEFAULT ''",
				);
			}
		} catch (err) {
			console.warn("[WorkbenchDatabase] Migration pragma error:", err);
		}
	}

	/**
	 * Get all folders along with their associated items
	 */
	getAllFolders(): Folder[] {
		const folderRows = this.db
			.prepare("SELECT * FROM folders ORDER BY sort_order ASC, id ASC")
			.all() as any[];

		const folders: Folder[] = [];

		for (const f of folderRows) {
			const itemRows = this.db
				.prepare(
					`
        SELECT b.*, fi.sort_order as rel_sort
        FROM folder_items fi
        JOIN bookmarks b ON fi.item_id = b.id
        WHERE fi.folder_id = ?
        ORDER BY fi.sort_order ASC, fi.id ASC
      `,
				)
				.all(f.id) as any[];

			const items: WorkbenchItem[] = itemRows.map((b) => ({
				id: b.id,
				name: b.title,
				type: (b.item_type || "link") as ItemType,
				url: b.url,
				favicon: b.favicon || undefined,
				description: b.description,
				keywords: b.keywords,
				summary: b.summary || b.title,
				tags: JSON.parse(b.tags || "[]"),
				folderId: f.id,
				folderName: f.name,
				category: f.category,
				reason: b.reason,
				createdAt: b.created_at,
				source: b.source,
			}));

			folders.push({
				id: f.id,
				name: f.name,
				category: f.category,
				desc: f.description || "",
				createdAt: f.created_at,
				items,
			});
		}

		return folders;
	}

	/**
	 * Get all unclassified bookmarks (items without folder binding)
	 */
	getUnclassifiedItems(): WorkbenchItem[] {
		const rows = this.db
			.prepare(
				`
      SELECT b.*
      FROM bookmarks b
      LEFT JOIN folder_items fi ON b.id = fi.item_id
      WHERE fi.id IS NULL
      ORDER BY b.created_at DESC
    `,
			)
			.all() as any[];

		return rows.map((b) => ({
			id: b.id,
			name: b.title,
			type: (b.item_type || "link") as ItemType,
			url: b.url,
			favicon: b.favicon || undefined,
			description: b.description,
			keywords: b.keywords,
			summary: b.summary || b.title,
			tags: JSON.parse(b.tags || "[]"),
			folderName: b.parent_title,
			reason: b.reason,
			createdAt: b.created_at,
			source: b.source,
		}));
	}

	/**
	 * Insert batch bookmarks into SQLite (deduplicating by URL)
	 */
	insertBookmarksBatch(items: BookmarkTDKItem[]): number {
		const insertStmt = this.db.prepare(`
      INSERT INTO bookmarks (
        id, url, title, description, keywords, summary, item_type, tags,
        favicon, parent_title, folder_path, source, date_added, created_at, updated_at
      ) VALUES (
        @id, @url, @title, @description, @keywords, @summary, @item_type, @tags,
        @favicon, @parent_title, @folder_path, @source, @date_added, @created_at, @updated_at
      )
      ON CONFLICT(url) DO UPDATE SET
        title = excluded.title,
        favicon = CASE WHEN excluded.favicon != '' THEN excluded.favicon ELSE bookmarks.favicon END,
        description = CASE WHEN excluded.description != '' THEN excluded.description ELSE bookmarks.description END,
        keywords = CASE WHEN excluded.keywords != '' THEN excluded.keywords ELSE bookmarks.keywords END,
        parent_title = CASE WHEN excluded.parent_title != '' THEN excluded.parent_title ELSE bookmarks.parent_title END,
        folder_path = CASE WHEN excluded.folder_path != '' THEN excluded.folder_path ELSE bookmarks.folder_path END,
        updated_at = excluded.updated_at
    `);

		const today = new Date().toISOString().split("T")[0];
		let insertedCount = 0;

		const transaction = this.db.transaction((list: BookmarkTDKItem[]) => {
			for (const bm of list) {
				if (!bm.url) continue;
				const id =
					bm.id?.toString() ||
					`bm_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
				const res = insertStmt.run({
					id,
					url: bm.url,
					title: bm.title || bm.url,
					description: bm.description || "",
					keywords: bm.keywords || "",
					summary: bm.title || "",
					item_type: "link",
					tags: "[]",
					favicon: bm.favicon || "",
					parent_title: bm.parentTitle || "",
					folder_path: bm.folderPath || "",
					source: "bookmark_sync",
					date_added: bm.dateAdded || Date.now(),
					created_at: today,
					updated_at: today,
				});
				if (res.changes > 0) insertedCount++;
			}
		});

		transaction(items);
		return insertedCount;
	}

	/**
	 * Apply AI Classification results into Folders & FolderItems relationship
	 */
	applyAIClassification(results: AIClassificationResult[]): void {
		const today = new Date().toISOString().split("T")[0];

		const findFolderStmt = this.db.prepare(
			"SELECT id FROM folders WHERE LOWER(name) = LOWER(?) AND LOWER(category) = LOWER(?)",
		);
		const findFolderByNameStmt = this.db.prepare(
			"SELECT id FROM folders WHERE LOWER(name) = LOWER(?)",
		);
		const insertFolderStmt = this.db.prepare(`
      INSERT INTO folders (name, category, description, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `);

		const updateBookmarkStmt = this.db.prepare(`
      UPDATE bookmarks SET
        title = @title,
        item_type = @item_type,
        summary = @summary,
        tags = @tags,
        reason = @reason,
        updated_at = @updated_at
      WHERE id = @id OR url = @url
    `);

		const findBookmarkIdStmt = this.db.prepare(
			"SELECT id FROM bookmarks WHERE id = ? OR url = ?",
		);

		const insertRelationStmt = this.db.prepare(`
      INSERT OR IGNORE INTO folder_items (folder_id, item_id, created_at)
      VALUES (?, ?, ?)
    `);

		const transaction = this.db.transaction(
			(list: AIClassificationResult[]) => {
				for (const res of list) {
					// 1. Find or create target folder
					let folderRow = findFolderStmt.get(
						res.folderName,
						res.category,
					) as any;
					if (!folderRow) {
						folderRow = findFolderByNameStmt.get(res.folderName) as any;
					}

					let folderId: number;
					if (folderRow) {
						folderId = folderRow.id;
					} else {
						const ins = insertFolderStmt.run(
							res.folderName,
							res.category || "工作台",
							res.folderDesc || `${res.folderName} 主题工具与资源归集。`,
							today,
							today,
						);
						folderId = ins.lastInsertRowid as number;
					}

					// 2. Update bookmark metadata
					updateBookmarkStmt.run({
						id: res.id.toString(),
						url: res.url,
						title: res.title,
						item_type: res.itemType,
						summary: res.summary,
						tags: JSON.stringify(res.tags || []),
						reason: res.reason || "",
						updated_at: today,
					});

					// 3. Resolve actual bookmark ID
					const bmRow = findBookmarkIdStmt.get(
						res.id.toString(),
						res.url,
					) as any;
					const actualItemId = bmRow ? bmRow.id : res.id.toString();

					// 4. Link item to folder in folder_items
					insertRelationStmt.run(folderId, actualItemId, today);
				}
			},
		);

		transaction(results);
	}

	/**
	 * Create folder
	 */
	createFolder(name: string, category: string, desc: string): Folder {
		const today = new Date().toISOString().split("T")[0];
		const ins = this.db
			.prepare(
				"INSERT INTO folders (name, category, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
			)
			.run(name, category, desc, today, today);

		return {
			id: ins.lastInsertRowid as number,
			name,
			category,
			desc,
			createdAt: today,
			items: [],
		};
	}

	/**
	 * Update folder
	 */
	updateFolder(id: number, name: string, category: string, desc: string): void {
		const today = new Date().toISOString().split("T")[0];
		this.db
			.prepare(
				"UPDATE folders SET name = ?, category = ?, description = ?, updated_at = ? WHERE id = ?",
			)
			.run(name, category, desc, today, id);
	}

	/**
	 * Delete folder (Cascades delete on folder_items)
	 */
	deleteFolder(id: number): void {
		this.db.prepare("DELETE FROM folders WHERE id = ?").run(id);
	}

	/**
	 * Move item between folders
	 */
	moveItem(
		itemId: string,
		sourceFolderId: number | null,
		targetFolderId: number | null,
	): void {
		const today = new Date().toISOString().split("T")[0];
		if (sourceFolderId !== null) {
			this.db
				.prepare("DELETE FROM folder_items WHERE folder_id = ? AND item_id = ?")
				.run(sourceFolderId, itemId);
		}
		if (targetFolderId !== null) {
			this.db
				.prepare(
					"INSERT OR IGNORE INTO folder_items (folder_id, item_id, created_at) VALUES (?, ?, ?)",
				)
				.run(targetFolderId, itemId, today);
		}
	}

	/**
	 * Delete item from folder or globally
	 */
	deleteItem(itemId: string, folderId: number | null): void {
		if (folderId !== null) {
			this.db
				.prepare("DELETE FROM folder_items WHERE folder_id = ? AND item_id = ?")
				.run(folderId, itemId);
		} else {
			this.db.prepare("DELETE FROM bookmarks WHERE id = ?").run(itemId);
		}
	}

	/**
	 * Get embedding coverage statistics
	 */
	getEmbeddingStats(): { total: number; embedded: number; percentage: number } {
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
	): Array<{
		id: string;
		title: string;
		url: string;
		description: string;
		keywords: string;
		summary: string;
		tags: string;
		parent_title: string;
	}> {
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
	getAllBookmarksForSearch(): Array<{
		id: string;
		name: string;
		url: string;
		type: ItemType;
		description: string;
		keywords: string;
		summary: string;
		tags: string[];
		favicon?: string;
		folderId?: number | null;
		folderName?: string;
		category?: string;
		createdAt?: string;
		embedding: number[] | null;
	}> {
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
}

// Singleton database instance
export const workbenchDb = new WorkbenchDatabase();
