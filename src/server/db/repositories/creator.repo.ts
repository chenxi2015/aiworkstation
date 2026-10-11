import type {
	AssetKind,
	AssetStorageMode,
	Material,
	MaterialAsset,
	MaterialFolder,
	MaterialSourceType,
} from "../../../components/creator/types.ts";
import type { SqliteDatabase } from "../types.ts";

interface MaterialRow {
	id: number;
	source_type: string;
	bookmark_id: string | null;
	folder_id: number | null;
	title: string;
	content: string;
	note: string | null;
	status: string;
	starred: number;
	created_at: string | null;
	updated_at: string | null;
}

interface AssetRow {
	id: number;
	material_id: number;
	rel_path: string;
	kind: string;
	filename: string;
	mime: string | null;
	size_bytes: number | null;
	storage_mode: string | null;
	source_path: string | null;
	created_at: string | null;
}

interface MaterialFolderRow {
	id: number;
	name: string;
	description: string | null;
	color: string | null;
	sort_order: number | null;
	created_at: string | null;
	updated_at: string | null;
}

function rowToMaterial(r: MaterialRow): Material {
	return {
		id: r.id,
		sourceType: r.source_type as MaterialSourceType,
		bookmarkId: r.bookmark_id,
		folderId: r.folder_id ?? null,
		title: r.title,
		content: r.content,
		note: r.note,
		status: r.status as Material["status"],
		starred: Boolean(r.starred),
		createdAt: r.created_at ?? undefined,
		updatedAt: r.updated_at ?? undefined,
	};
}

function rowToMaterialFolder(r: MaterialFolderRow): MaterialFolder {
	return {
		id: r.id,
		name: r.name,
		description: r.description ?? "",
		color: r.color ?? "",
		sortOrder: r.sort_order ?? 0,
		createdAt: r.created_at ?? undefined,
		updatedAt: r.updated_at ?? undefined,
	};
}

function rowToAsset(r: AssetRow): MaterialAsset {
	return {
		id: r.id,
		materialId: r.material_id,
		relPath: r.rel_path,
		kind: r.kind as AssetKind,
		filename: r.filename,
		mime: r.mime,
		sizeBytes: r.size_bytes,
		storageMode: (r.storage_mode as AssetStorageMode) || "managed",
		sourcePath: r.source_path ?? null,
		createdAt: r.created_at ?? undefined,
	};
}

/**
 * Repository handling Creator module persistence: materials / assets
 */
export class CreatorRepository {
	constructor(private db: SqliteDatabase) {}

	// ================= Materials =================

	listMaterials(
		statusFilter: boolean | "active" | "archived" | "all" = "active",
	): Material[] {
		let statusCondition = "WHERE status = 'active'";
		if (statusFilter === true || statusFilter === "all") {
			statusCondition = "";
		} else if (statusFilter === "archived") {
			statusCondition = "WHERE status = 'archived'";
		}

		// Select truncated content preview (up to 300 chars) for lightweight payload in list view
		const rows = this.db
			.prepare(
				`SELECT id, source_type, bookmark_id, folder_id, title,
                substr(content, 1, 300) AS content,
                note, status, starred, created_at, updated_at
         FROM materials ${statusCondition}
         ORDER BY updated_at DESC, id DESC`,
			)
			.all() as MaterialRow[];

		if (rows.length === 0) return [];

		// Query only assets belonging to the queried materials instead of full table scan
		const assetRows = this.db
			.prepare(
				`SELECT a.* FROM assets a
         WHERE a.material_id IN (SELECT id FROM materials ${statusCondition})
         ORDER BY a.id ASC`,
			)
			.all() as AssetRow[];
		const assetsByMaterial = new Map<number, MaterialAsset[]>();
		for (const a of assetRows) {
			const list = assetsByMaterial.get(a.material_id) ?? [];
			list.push(rowToAsset(a));
			assetsByMaterial.set(a.material_id, list);
		}
		return rows.map((r) => ({
			...rowToMaterial(r),
			assets: assetsByMaterial.get(r.id) ?? [],
		}));
	}

	getMaterial(id: number): Material | null {
		const row = this.db
			.prepare("SELECT * FROM materials WHERE id = ?")
			.get(id) as MaterialRow | undefined;
		if (!row) return null;
		const assetRows = this.db
			.prepare("SELECT * FROM assets WHERE material_id = ? ORDER BY id ASC")
			.all(id) as AssetRow[];
		return { ...rowToMaterial(row), assets: assetRows.map(rowToAsset) };
	}

	createMaterial(params: {
		sourceType: MaterialSourceType;
		bookmarkId?: string | null;
		folderId?: number | null;
		title: string;
		content: string;
		note?: string | null;
	}): number {
		const now = new Date().toISOString();
		const res = this.db
			.prepare(
				`INSERT INTO materials (source_type, bookmark_id, folder_id, title, content, note, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
			)
			.run(
				params.sourceType,
				params.bookmarkId ?? null,
				params.folderId ?? null,
				params.title,
				params.content,
				params.note ?? null,
				now,
				now,
			);
		return Number(res.lastInsertRowid);
	}

	updateMaterial(
		id: number,
		patch: {
			folderId?: number | null;
			title?: string;
			content?: string;
			note?: string | null;
			status?: Material["status"];
			starred?: boolean;
		},
	): void {
		const current = this.getMaterial(id);
		if (!current) throw new Error(`素材不存在：${id}`);
		const now = new Date().toISOString();
		this.db
			.prepare(
				`UPDATE materials SET title = ?, content = ?, note = ?, status = ?, starred = ?, updated_at = ? WHERE id = ?`,
			)
			.run(
				patch.title ?? current.title,
				patch.content ?? current.content,
				patch.note !== undefined ? patch.note : (current.note ?? null),
				patch.status ?? current.status,
				patch.starred === undefined
					? current.starred
						? 1
						: 0
					: patch.starred
						? 1
						: 0,
				now,
				id,
			);

		// folderId 单独处理：允许显式置 null（移出文件夹）
		if (patch.folderId !== undefined) {
			this.db
				.prepare(
					"UPDATE materials SET folder_id = ?, updated_at = ? WHERE id = ?",
				)
				.run(patch.folderId, now, id);
		}
	}

	/**
	 * 删除素材：连带删除资产记录。
	 * 资产文件目录由 server function 层负责清理（repo 不碰文件系统）。
	 */
	deleteMaterial(id: number): void {
		const tx = this.db.transaction(() => {
			this.db.prepare("DELETE FROM assets WHERE material_id = ?").run(id);
			this.db.prepare("DELETE FROM materials WHERE id = ?").run(id);
		});
		tx();
	}

	batchDeleteMaterials(ids: number[]): void {
		if (ids.length === 0) return;
		const tx = this.db.transaction(() => {
			const placeholders = ids.map(() => "?").join(",");
			this.db
				.prepare(`DELETE FROM assets WHERE material_id IN (${placeholders})`)
				.run(...ids);
			this.db
				.prepare(`DELETE FROM materials WHERE id IN (${placeholders})`)
				.run(...ids);
		});
		tx();
	}

	// ================= Material Folders =================

	/** 素材文件夹列表（按排序值/创建时间），附 active 素材计数 */
	listMaterialFolders(): MaterialFolder[] {
		const rows = this.db
			.prepare(
				`SELECT f.*, (
           SELECT COUNT(*) FROM materials m
           WHERE m.folder_id = f.id AND m.status = 'active'
         ) AS material_count
         FROM material_folders f
         ORDER BY f.sort_order ASC, f.id ASC`,
			)
			.all() as Array<MaterialFolderRow & { material_count: number }>;
		return rows.map((r) => ({
			...rowToMaterialFolder(r),
			materialCount: r.material_count,
		}));
	}

	createMaterialFolder(params: {
		name: string;
		description?: string | null;
		color?: string | null;
	}): number {
		const now = new Date().toISOString();
		const res = this.db
			.prepare(
				`INSERT INTO material_folders (name, description, color, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM material_folders), ?, ?)`,
			)
			.run(params.name, params.description ?? "", params.color ?? "", now, now);
		return Number(res.lastInsertRowid);
	}

	getMaterialFolder(id: number): MaterialFolder | null {
		const row = this.db
			.prepare("SELECT * FROM material_folders WHERE id = ?")
			.get(id) as MaterialFolderRow | undefined;
		return row ? rowToMaterialFolder(row) : null;
	}

	updateMaterialFolder(
		id: number,
		patch: {
			name?: string;
			description?: string | null;
			color?: string | null;
		},
	): void {
		const current = this.getMaterialFolder(id);
		if (!current) throw new Error(`素材文件夹不存在：${id}`);
		const now = new Date().toISOString();
		this.db
			.prepare(
				"UPDATE material_folders SET name = ?, description = ?, color = ?, updated_at = ? WHERE id = ?",
			)
			.run(
				patch.name ?? current.name,
				patch.description !== undefined
					? (patch.description ?? "")
					: (current.description ?? ""),
				patch.color !== undefined ? (patch.color ?? "") : (current.color ?? ""),
				now,
				id,
			);
	}

	/** 删除文件夹：文件夹内素材移回「未归档」（folder_id 置 NULL），素材本身保留 */
	deleteMaterialFolder(id: number): void {
		const now = new Date().toISOString();
		const tx = this.db.transaction(() => {
			this.db
				.prepare(
					"UPDATE materials SET folder_id = NULL, updated_at = ? WHERE folder_id = ?",
				)
				.run(now, id);
			this.db.prepare("DELETE FROM material_folders WHERE id = ?").run(id);
		});
		tx();
	}

	// ================= Assets =================

	getAsset(id: number): MaterialAsset | null {
		const row = this.db.prepare("SELECT * FROM assets WHERE id = ?").get(id) as
			| AssetRow
			| undefined;
		return row ? rowToAsset(row) : null;
	}

	/**
	 * 媒体资产分页查询（创作台编辑器素材选择器专用，docs/studio-materials-link-plan.md）。
	 * 直接 JOIN 摊平 assets × materials，避免整表加载；counts 统计三类媒体总量（不受筛选影响）。
	 */
	listMediaAssetsPage(params: {
		kind: "image" | "video" | "audio";
		folderId?: number | null;
		query?: string;
		page: number;
		pageSize: number;
	}): {
		items: Array<{ asset: MaterialAsset; materialTitle: string }>;
		total: number;
		counts: { image: number; video: number; audio: number };
	} {
		// 视频识别与客户端 isVideoAsset 对齐：kind='video' 或常见视频扩展名
		const VIDEO_COND = `(a.kind = 'video' OR lower(a.filename) LIKE '%.mp4' OR lower(a.filename) LIKE '%.mov' OR lower(a.filename) LIKE '%.webm' OR lower(a.filename) LIKE '%.mkv' OR lower(a.filename) LIKE '%.m4v')`;
		const kindCond =
			params.kind === "image"
				? "a.kind = 'image'"
				: params.kind === "video"
					? VIDEO_COND
					: "a.kind = 'audio'";

		const conditions = ["m.status = 'active'", kindCond];
		const args: (string | number)[] = [];
		if (params.folderId != null) {
			conditions.push("m.folder_id = ?");
			args.push(params.folderId);
		}
		const keyword = params.query?.trim();
		if (keyword) {
			conditions.push("(a.filename LIKE ? OR m.title LIKE ?)");
			const like = `%${keyword}%`;
			args.push(like, like);
		}
		const where = conditions.join(" AND ");

		const total =
			(
				this.db
					.prepare(
						`SELECT COUNT(*) AS c FROM assets a JOIN materials m ON m.id = a.material_id WHERE ${where}`,
					)
					.get(...args) as { c: number }
			)?.c ?? 0;

		const page = Math.max(1, params.page);
		const pageSize = Math.min(Math.max(1, params.pageSize), 200);
		const rows = this.db
			.prepare(
				`SELECT a.*, m.title AS material_title
         FROM assets a JOIN materials m ON m.id = a.material_id
         WHERE ${where}
         ORDER BY m.updated_at DESC, a.id ASC
         LIMIT ? OFFSET ?`,
			)
			.all(...args, pageSize, (page - 1) * pageSize) as Array<
			AssetRow & { material_title: string }
		>;

		const countsRow = this.db
			.prepare(
				`SELECT
           SUM(CASE WHEN a.kind = 'image' THEN 1 ELSE 0 END) AS image,
           SUM(CASE WHEN ${VIDEO_COND} THEN 1 ELSE 0 END) AS video,
           SUM(CASE WHEN a.kind = 'audio' THEN 1 ELSE 0 END) AS audio
         FROM assets a JOIN materials m ON m.id = a.material_id
         WHERE m.status = 'active'`,
			)
			.get() as {
			image: number | null;
			video: number | null;
			audio: number | null;
		};

		return {
			items: rows.map((r) => ({
				asset: rowToAsset(r),
				materialTitle: r.material_title ?? "",
			})),
			total,
			counts: {
				image: countsRow?.image ?? 0,
				video: countsRow?.video ?? 0,
				audio: countsRow?.audio ?? 0,
			},
		};
	}

	addAsset(params: {
		materialId: number;
		relPath: string;
		kind: AssetKind;
		filename: string;
		mime?: string | null;
		sizeBytes?: number | null;
		storageMode?: AssetStorageMode;
		sourcePath?: string | null;
	}): number {
		const now = new Date().toISOString();
		const res = this.db
			.prepare(
				`INSERT INTO assets (material_id, rel_path, kind, filename, mime, size_bytes, storage_mode, source_path, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			)
			.run(
				params.materialId,
				params.relPath,
				params.kind,
				params.filename,
				params.mime ?? null,
				params.sizeBytes ?? null,
				params.storageMode ?? "managed",
				params.sourcePath ?? null,
				now,
			);
		return Number(res.lastInsertRowid);
	}

	/**
	 * 批量处理（如图片压缩/格式转换）原路径替换后同步资产记录：
	 * 文件名/扩展名、mime、体积乃至存储位置都可能变化。
	 */
	updateAssetFile(
		id: number,
		params: {
			relPath?: string;
			filename?: string;
			mime?: string | null;
			sizeBytes?: number | null;
			storageMode?: AssetStorageMode;
			sourcePath?: string | null;
		},
	): void {
		const sets: string[] = [];
		const values: unknown[] = [];
		if (params.relPath !== undefined) {
			sets.push("rel_path = ?");
			values.push(params.relPath);
		}
		if (params.filename !== undefined) {
			sets.push("filename = ?");
			values.push(params.filename);
		}
		if (params.mime !== undefined) {
			sets.push("mime = ?");
			values.push(params.mime);
		}
		if (params.sizeBytes !== undefined) {
			sets.push("size_bytes = ?");
			values.push(params.sizeBytes);
		}
		if (params.storageMode !== undefined) {
			sets.push("storage_mode = ?");
			values.push(params.storageMode);
		}
		if (params.sourcePath !== undefined) {
			sets.push("source_path = ?");
			values.push(params.sourcePath);
		}
		if (sets.length === 0) return;
		values.push(id);
		this.db
			.prepare(`UPDATE assets SET ${sets.join(", ")} WHERE id = ?`)
			.run(...values);
	}
}
