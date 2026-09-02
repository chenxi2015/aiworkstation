import type {
	Folder,
	ItemType,
	WorkbenchItem,
} from "../../../components/workbench/types.ts";
import type { SqliteDatabase } from "../types.ts";

/**
 * Repository handling Folder CRUD and folder item associations
 */
export class FolderRepository {
	constructor(private db: SqliteDatabase) {}

	/**
	 * Get all folders along with their associated items
	 */
	getAllFolders(): Folder[] {
		const folderRows = this.db
			.prepare("SELECT * FROM folders ORDER BY sort_order ASC, id ASC")
			.all() as any[];

		const itemsStmt = this.db.prepare(`
      SELECT b.*, fi.sort_order as rel_sort
      FROM folder_items fi
      JOIN bookmarks b ON fi.item_id = b.id
      WHERE fi.folder_id = ?
      ORDER BY fi.sort_order ASC, fi.id ASC
    `);

		const folders: Folder[] = [];

		for (const f of folderRows) {
			const itemRows = itemsStmt.all(f.id) as any[];

			const items: WorkbenchItem[] = itemRows.map((b) => {
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
					folderId: f.id,
					folderName: f.name,
					category: f.category,
					reason: b.reason,
					createdAt: b.created_at,
					source: b.source,
				};
			});

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
	 * Create a new folder
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
	 * Update folder metadata
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
	 * Delete folder (cascades deletion on folder_items)
	 */
	deleteFolder(id: number): void {
		this.db.prepare("DELETE FROM folders WHERE id = ?").run(id);
	}
}
