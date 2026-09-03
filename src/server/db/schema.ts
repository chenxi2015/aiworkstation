import type { SqliteDatabase } from "./types.ts";

/**
 * Initialize database tables, indexes and run schema migrations
 */
export function initSchema(db: SqliteDatabase): void {
	db.exec(`
    -- 1. Folders / Groups table
    CREATE TABLE IF NOT EXISTS folders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT '工作台',
      description TEXT DEFAULT '',
      color TEXT DEFAULT '',
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

	// Graceful migration for existing SQLite DBs without embedding columns or color column
	try {
		const bookmarkCols = db
			.prepare("PRAGMA table_info(bookmarks)")
			.all() as Array<{
			name: string;
		}>;
		const bookmarkColNames = new Set(bookmarkCols.map((c) => c.name));

		if (!bookmarkColNames.has("embedding")) {
			db.exec("ALTER TABLE bookmarks ADD COLUMN embedding TEXT DEFAULT NULL");
		}
		if (!bookmarkColNames.has("embedding_text")) {
			db.exec(
				"ALTER TABLE bookmarks ADD COLUMN embedding_text TEXT DEFAULT ''",
			);
		}

		const folderCols = db.prepare("PRAGMA table_info(folders)").all() as Array<{
			name: string;
		}>;
		const folderColNames = new Set(folderCols.map((c) => c.name));
		if (!folderColNames.has("color")) {
			db.exec("ALTER TABLE folders ADD COLUMN color TEXT DEFAULT ''");
		}
	} catch (err) {
		console.warn("[DatabaseSchema] Migration pragma error:", err);
	}
}
