import type {
	AIClassificationResult,
	BookmarkTDKItem,
	ItemType,
	WorkbenchItem,
} from "../../../components/workbench/types.ts";
import type { SqliteDatabase } from "../types.ts";

/**
 * Repository handling Bookmark CRUD, batch sync, classification and relation binding
 */
export class BookmarkRepository {
	constructor(private db: SqliteDatabase) {}

	/**
	 * Get all unclassified bookmarks (items without any folder binding)
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

		return rows.map((b) => {
			let tags: string[] = [];
			try {
				tags = JSON.parse(b.tags || "[]");
			} catch {
				tags = [];
			}

			return {
				id: b.id,
				name: b.title,
				type: (b.item_type || "link") as ItemType,
				url: b.url,
				favicon: b.favicon || undefined,
				description: b.description,
				keywords: b.keywords,
				summary: b.summary || b.title,
				tags,
				folderName: b.parent_title,
				reason: b.reason,
				createdAt: b.created_at,
				source: b.source,
			};
		});
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
						// "未分类" 是缓冲池伪分类，不能落为文件夹分类
						const folderCategory =
							!res.category || res.category === "未分类"
								? "工作台"
								: res.category;
						const ins = insertFolderStmt.run(
							res.folderName,
							folderCategory,
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
	 * Insert a single manually-added link and bind it to a folder
	 */
	insertLinkIntoFolder(
		folderId: number,
		item: { url: string; title: string; description?: string },
	): string {
		const today = new Date().toISOString().split("T")[0];

		const transaction = this.db.transaction(() => {
			this.db
				.prepare(`
        INSERT INTO bookmarks (
          id, url, title, description, summary, item_type, source,
          date_added, created_at, updated_at
        ) VALUES (
          @id, @url, @title, @description, @summary, 'link', 'manual',
          @date_added, @created_at, @updated_at
        )
        ON CONFLICT(url) DO UPDATE SET
          title = CASE WHEN excluded.title != '' THEN excluded.title ELSE bookmarks.title END,
          description = CASE WHEN excluded.description != '' THEN excluded.description ELSE bookmarks.description END,
          updated_at = excluded.updated_at
      `)
				.run({
					id: `bm_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
					url: item.url,
					title: item.title || item.url,
					description: item.description || "",
					summary: item.title || item.url,
					date_added: Date.now(),
					created_at: today,
					updated_at: today,
				});

			const row = this.db
				.prepare("SELECT id FROM bookmarks WHERE url = ?")
				.get(item.url) as { id: string } | undefined;
			if (!row) throw new Error("Failed to insert bookmark");

			this.db
				.prepare(
					"INSERT OR IGNORE INTO folder_items (folder_id, item_id, created_at) VALUES (?, ?, ?)",
				)
				.run(folderId, row.id, today);

			return row.id;
		});

		return transaction();
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
	 * Link item to folder without removing from existing folders (many-to-many reference)
	 */
	linkItemToFolder(itemId: string, targetFolderId: number): void {
		const today = new Date().toISOString().split("T")[0];
		this.db
			.prepare(
				"INSERT OR IGNORE INTO folder_items (folder_id, item_id, created_at) VALUES (?, ?, ?)",
			)
			.run(targetFolderId, itemId, today);
	}

	/**
	 * Get all bookmark URLs for maintenance tasks (e.g. dead link scanning)
	 */
	getAllUrls(): Array<{ id: string; url: string; title: string }> {
		return this.db
			.prepare("SELECT id, url, title FROM bookmarks ORDER BY created_at DESC")
			.all() as Array<{ id: string; url: string; title: string }>;
	}

	/**
	 * Batch delete bookmarks globally by ids (folder_items cascade via FK)
	 */
	deleteItems(ids: string[]): number {
		if (ids.length === 0) return 0;
		const deleteStmt = this.db.prepare("DELETE FROM bookmarks WHERE id = ?");
		const transaction = this.db.transaction((list: string[]) => {
			let count = 0;
			for (const id of list) {
				const res = deleteStmt.run(id);
				if (res.changes > 0) count++;
			}
			return count;
		});
		return transaction(ids);
	}

	/**
	 * Clear all workbench data (folders, bookmarks and their relations)
	 */
	clearAll(): void {
		const transaction = this.db.transaction(() => {
			this.db.prepare("DELETE FROM folder_items").run();
			this.db.prepare("DELETE FROM bookmarks").run();
			this.db.prepare("DELETE FROM folders").run();
		});
		transaction();
		this.db.exec("VACUUM");
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
}
