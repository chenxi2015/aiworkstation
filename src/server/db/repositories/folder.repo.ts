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
				parentId: f.parent_id ?? null,
				desc: f.description || "",
				color: f.color || undefined,
				createdAt: f.created_at,
				items,
			});
		}

		return folders;
	}

	/**
	 * Create a new folder
	 */
	createFolder(
		name: string,
		category: string,
		desc: string,
		color?: string,
	): Folder {
		const today = new Date().toISOString().split("T")[0];
		const maxSort = this.db
			.prepare(
				"SELECT COALESCE(MAX(sort_order), -1) as max_sort FROM folders WHERE category = ? AND parent_id IS NULL",
			)
			.get(category) as { max_sort: number };
		const ins = this.db
			.prepare(
				"INSERT INTO folders (name, category, description, color, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
			)
			.run(
				name,
				category,
				desc,
				color || "",
				maxSort.max_sort + 1,
				today,
				today,
			);

		return {
			id: ins.lastInsertRowid as number,
			name,
			category,
			parentId: null,
			desc,
			color: color || undefined,
			createdAt: today,
			items: [],
		};
	}

	/**
	 * Update folder metadata
	 */
	updateFolder(
		id: number,
		name: string,
		category: string,
		desc: string,
		color?: string,
	): void {
		const today = new Date().toISOString().split("T")[0];
		this.db
			.prepare(
				"UPDATE folders SET name = ?, category = ?, description = ?, color = ?, updated_at = ? WHERE id = ?",
			)
			.run(name, category, desc, color || "", today, id);
	}

	/**
	 * Delete folder (cascades deletion on folder_items)
	 * Child folders are promoted to top-level before deletion
	 */
	deleteFolder(id: number): void {
		const transaction = this.db.transaction((folderId: number) => {
			this.db
				.prepare("UPDATE folders SET parent_id = NULL WHERE parent_id = ?")
				.run(folderId);
			this.db.prepare("DELETE FROM folders WHERE id = ?").run(folderId);
		});
		transaction(id);
	}

	/**
	 * Get the parent folder id of a folder (null when top-level or missing)
	 */
	getFolderParentId(id: number): number | null {
		const row = this.db
			.prepare("SELECT parent_id FROM folders WHERE id = ?")
			.get(id) as { parent_id: number | null } | undefined;
		return row?.parent_id ?? null;
	}

	/**
	 * Check whether `candidateId` is `ancestorId` itself or one of its descendants.
	 * Walks up the parent chain from candidateId.
	 */
	isSelfOrDescendant(candidateId: number, ancestorId: number): boolean {
		let current: number | null = candidateId;
		const stmt = this.db.prepare("SELECT parent_id FROM folders WHERE id = ?");
		const visited = new Set<number>();
		while (current !== null) {
			if (current === ancestorId) return true;
			if (visited.has(current)) return false;
			visited.add(current);
			const row = stmt.get(current) as { parent_id: number | null } | undefined;
			current = row?.parent_id ?? null;
		}
		return false;
	}

	/**
	 * Move a folder into another folder (or to top-level when targetParentId is null).
	 * Nested folders always inherit the parent's category so they stay visible
	 * inside the same category tab. Throws when the move would create a cycle.
	 */
	moveFolder(id: number, targetParentId: number | null): void {
		let inheritCategory: string | null = null;
		if (targetParentId !== null) {
			if (this.isSelfOrDescendant(targetParentId, id)) {
				throw new Error("无法将文件夹移动到其自身或子文件夹中");
			}
			const target = this.db
				.prepare("SELECT id, category FROM folders WHERE id = ?")
				.get(targetParentId);
			if (!target) {
				throw new Error("目标文件夹不存在");
			}
			inheritCategory = (target as { category: string }).category;
		}
		const today = new Date().toISOString().split("T")[0];
		const maxSort =
			targetParentId === null
				? (this.db
						.prepare(
							"SELECT COALESCE(MAX(sort_order), -1) as max_sort FROM folders WHERE parent_id IS NULL",
						)
						.get() as { max_sort: number })
				: (this.db
						.prepare(
							"SELECT COALESCE(MAX(sort_order), -1) as max_sort FROM folders WHERE parent_id = ?",
						)
						.get(targetParentId) as { max_sort: number });
		if (inheritCategory !== null) {
			this.db
				.prepare(
					"UPDATE folders SET parent_id = ?, category = ?, sort_order = ?, updated_at = ? WHERE id = ?",
				)
				.run(targetParentId, inheritCategory, maxSort.max_sort + 1, today, id);
		} else {
			this.db
				.prepare(
					"UPDATE folders SET parent_id = ?, sort_order = ?, updated_at = ? WHERE id = ?",
				)
				.run(targetParentId, maxSort.max_sort + 1, today, id);
		}
	}

	/**
	 * Persist sibling order: orderedIds are the folder ids of one container
	 * (same parent) in their new visual order.
	 */
	reorderFolders(orderedIds: number[]): void {
		const stmt = this.db.prepare(
			"UPDATE folders SET sort_order = ? WHERE id = ?",
		);
		const transaction = this.db.transaction((ids: number[]) => {
			ids.forEach((id, index) => {
				stmt.run(index, id);
			});
		});
		transaction(orderedIds);
	}

	/**
	 * Move a folder to the top level of a navigation category.
	 * Cascades the category update to all its descendant folders in a single transaction.
	 */
	moveFolderToCategory(folderId: number, targetCategory: string): void {
		const today = new Date().toISOString().split("T")[0];
		const transaction = this.db.transaction(() => {
			const maxSort = this.db
				.prepare(
					"SELECT COALESCE(MAX(sort_order), -1) as max_sort FROM folders WHERE parent_id IS NULL AND category = ?",
				)
				.get(targetCategory) as { max_sort: number };

			// Move folder to top level of target category
			this.db
				.prepare(
					"UPDATE folders SET parent_id = NULL, category = ?, sort_order = ?, updated_at = ? WHERE id = ?",
				)
				.run(targetCategory, maxSort.max_sort + 1, today, folderId);

			// Recursively update all descendants' category to maintain hierarchy integrity
			const updateDescendants = (parentId: number) => {
				const children = this.db
					.prepare("SELECT id FROM folders WHERE parent_id = ?")
					.all(parentId) as { id: number }[];
				for (const child of children) {
					this.db
						.prepare(
							"UPDATE folders SET category = ?, updated_at = ? WHERE id = ?",
						)
						.run(targetCategory, today, child.id);
					updateDescendants(child.id);
				}
			};
			updateDescendants(folderId);
		});
		transaction();
	}
}
