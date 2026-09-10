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
      parent_id INTEGER DEFAULT NULL,
      description TEXT DEFAULT '',
      color TEXT DEFAULT '',
      icon TEXT DEFAULT '',
      view_prefs TEXT DEFAULT '',
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
      payload TEXT DEFAULT '',
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

    -- 4. Settings table (Key-Value configuration persistence)
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    -- 5. Chat Sessions table (AI conversational history persistence)
    CREATE TABLE IF NOT EXISTS chat_sessions (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      messages TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    -- 6. Tags table
    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      color TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    -- 7. Relationship table: bookmark_tags (Many-to-Many binding)
    CREATE TABLE IF NOT EXISTS bookmark_tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bookmark_id TEXT NOT NULL REFERENCES bookmarks(id) ON DELETE CASCADE,
      tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      UNIQUE(bookmark_id, tag_id)
    );

    -- 8. Creator materials table (manual entry or bookmark snapshot)
    CREATE TABLE IF NOT EXISTS materials (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_type TEXT NOT NULL,          -- 'manual' | 'bookmark'
      bookmark_id TEXT,                   -- source_type='bookmark' 时关联 bookmarks.id
      folder_id INTEGER DEFAULT NULL,     -- 归属 material_folders.id；NULL = 未归档
      title TEXT NOT NULL,
      content TEXT NOT NULL,              -- 文本素材正文/摘录（bookmark 来源为快照）；文件型素材存摘要说明，正文在 assets 文件里
      note TEXT,                          -- 用户批注：这条素材想表达什么
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT,
      updated_at TEXT
    );

    -- 9. Creator drafts table (AI 二创产物 + 版本链)
    CREATE TABLE IF NOT EXISTS drafts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      material_id INTEGER NOT NULL REFERENCES materials(id),
      platform TEXT NOT NULL,             -- 'xhs' | 'twitter' | 'wechat' | 'script'（短视频脚本）
      content TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      parent_draft_id INTEGER,            -- 版本链：由哪条草稿改来
      origin TEXT NOT NULL,               -- 'ai' | 'human'
      status TEXT NOT NULL DEFAULT 'draft_ready',
      created_at TEXT,
      updated_at TEXT
    );

    -- 10. Creator assets table (大文件落文件系统，DB 只存关联)
    CREATE TABLE IF NOT EXISTS assets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      material_id INTEGER NOT NULL REFERENCES materials(id),
      rel_path TEXT NOT NULL,             -- 相对 filesRootDir 的路径（不存绝对路径！）
      kind TEXT NOT NULL,                 -- 'video' | 'markdown' | 'image' | 'audio' | 'other'
      filename TEXT NOT NULL,
      mime TEXT,
      size_bytes INTEGER,
      created_at TEXT
    );

    -- 11. Creator material folders table (素材库文件夹：视频/文档/图片/书签的归集)
    CREATE TABLE IF NOT EXISTS material_folders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      color TEXT DEFAULT '',
      sort_order INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    -- 12. Editor documents table（创作模块核心实体，docs/editor-plan.md 第五节）
    CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',   -- TipTap JSON（富文本单一事实源）
      content_text TEXT DEFAULT '',       -- 纯文本冗余：检索/字数统计用
      style_preset TEXT DEFAULT '',       -- 行文风格 preset key（公文/自媒体/报告/自定义）
      status TEXT NOT NULL DEFAULT 'editing',  -- editing | finalized | archived
      created_at TEXT,
      updated_at TEXT
    );

    -- 13. Editor document versions table（AI 回写前自动快照 + 手动存档）
    CREATE TABLE IF NOT EXISTS document_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id INTEGER NOT NULL REFERENCES documents(id),
      content TEXT NOT NULL,              -- TipTap JSON 快照
      version INTEGER NOT NULL,
      origin TEXT NOT NULL,               -- 'human' | 'ai'
      note TEXT,                          -- 快照说明
      created_at TEXT
    );

    -- Indexes for fast queries
    CREATE INDEX IF NOT EXISTS idx_folders_category ON folders(category);
    CREATE INDEX IF NOT EXISTS idx_folder_items_folder_id ON folder_items(folder_id);
    CREATE INDEX IF NOT EXISTS idx_folder_items_item_id ON folder_items(item_id);
    CREATE INDEX IF NOT EXISTS idx_bookmarks_url ON bookmarks(url);
    CREATE INDEX IF NOT EXISTS idx_chat_sessions_updated_at ON chat_sessions(updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_materials_status ON materials(status);
    CREATE INDEX IF NOT EXISTS idx_drafts_material_id ON drafts(material_id);
    CREATE INDEX IF NOT EXISTS idx_drafts_status ON drafts(status);
    CREATE INDEX IF NOT EXISTS idx_assets_material_id ON assets(material_id);
    CREATE INDEX IF NOT EXISTS idx_tags_name ON tags(name);
    CREATE INDEX IF NOT EXISTS idx_bookmark_tags_bookmark_id ON bookmark_tags(bookmark_id);
    CREATE INDEX IF NOT EXISTS idx_bookmark_tags_tag_id ON bookmark_tags(tag_id);
    CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status);
    CREATE INDEX IF NOT EXISTS idx_documents_updated_at ON documents(updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_document_versions_document_id ON document_versions(document_id);
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
		if (!folderColNames.has("parent_id")) {
			db.exec("ALTER TABLE folders ADD COLUMN parent_id INTEGER DEFAULT NULL");
		}
		if (!folderColNames.has("view_prefs")) {
			db.exec("ALTER TABLE folders ADD COLUMN view_prefs TEXT DEFAULT ''");
		}

		const materialCols = db
			.prepare("PRAGMA table_info(materials)")
			.all() as Array<{ name: string }>;
		if (!materialCols.some((c) => c.name === "folder_id")) {
			db.exec(
				"ALTER TABLE materials ADD COLUMN folder_id INTEGER DEFAULT NULL",
			);
		}
		// 索引依赖 folder_id 列，必须放在列迁移之后（老库无该列时建索引会报错）
		db.exec(
			"CREATE INDEX IF NOT EXISTS idx_materials_folder_id ON materials(folder_id)",
		);
		if (!bookmarkColNames.has("payload")) {
			db.exec("ALTER TABLE bookmarks ADD COLUMN payload TEXT DEFAULT ''");
		}

		// Graceful backfill migration: populate tags and bookmark_tags from existing bookmarks.tags if table is empty
		const countRow = db
			.prepare("SELECT COUNT(*) as cnt FROM bookmark_tags")
			.get() as { cnt: number } | undefined;
		if (countRow && countRow.cnt === 0) {
			const rowsWithTags = db
				.prepare(
					"SELECT id, tags, created_at FROM bookmarks WHERE tags IS NOT NULL AND tags != '[]' AND tags != ''",
				)
				.all() as Array<{ id: string; tags: string; created_at: string }>;

			if (rowsWithTags.length > 0) {
				const now = new Date().toISOString();
				const insertTagStmt = db.prepare(
					"INSERT OR IGNORE INTO tags (name, color, created_at, updated_at) VALUES (?, '', ?, ?)",
				);
				const getTagStmt = db.prepare("SELECT id FROM tags WHERE name = ?");
				const insertRelStmt = db.prepare(
					"INSERT OR IGNORE INTO bookmark_tags (bookmark_id, tag_id, created_at) VALUES (?, ?, ?)",
				);

				const migrateTx = db.transaction(() => {
					for (const row of rowsWithTags) {
						try {
							const parsed = JSON.parse(row.tags);
							if (Array.isArray(parsed)) {
								for (const tagName of parsed) {
									if (typeof tagName === "string" && tagName.trim()) {
										const trimmed = tagName.trim();
										insertTagStmt.run(trimmed, now, now);
										const tagRow = getTagStmt.get(trimmed) as
											| { id: number }
											| undefined;
										if (tagRow) {
											insertRelStmt.run(
												row.id,
												tagRow.id,
												row.created_at || now,
											);
										}
									}
								}
							}
						} catch {
							// Ignore malformed JSON in legacy data
						}
					}
				});
				migrateTx();
			}
		}
	} catch (err) {
		console.warn("[DatabaseSchema] Migration pragma error:", err);
	}
}
