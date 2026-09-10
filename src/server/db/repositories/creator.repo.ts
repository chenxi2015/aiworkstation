import type {
	AssetKind,
	Draft,
	DraftOrigin,
	DraftPlatform,
	DraftStatus,
	DraftWithMaterial,
	Material,
	MaterialAsset,
	MaterialFolder,
	MaterialSourceType,
} from "../../../components/creator/types.ts";
import type { SqliteDatabase } from "../types.ts";

/**
 * 草稿状态机（docs/creator-plan.md 第二节）：
 * draft_ready → reviewing → approved → exported（published 预留，本阶段不启用）
 * 任何状态可 → discarded（软删除）
 *
 * 状态以「版本链最新版本」为准：人工编辑产生新版本时旧版本保留在链上，
 * 流转/导出只作用于链的最新版本；discarded 作用于整条链（软删除）。
 */
const ALLOWED_TRANSITIONS: Record<DraftStatus, DraftStatus[]> = {
	draft_ready: ["reviewing", "approved", "discarded"],
	reviewing: ["approved", "discarded"],
	approved: ["exported", "discarded"],
	exported: ["discarded"],
	discarded: [],
};

interface MaterialRow {
	id: number;
	source_type: string;
	bookmark_id: string | null;
	folder_id: number | null;
	title: string;
	content: string;
	note: string | null;
	status: string;
	created_at: string | null;
	updated_at: string | null;
}

interface DraftRow {
	id: number;
	material_id: number;
	platform: string;
	content: string;
	version: number;
	parent_draft_id: number | null;
	origin: string;
	status: string;
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

function rowToDraft(r: DraftRow): Draft {
	return {
		id: r.id,
		materialId: r.material_id,
		platform: r.platform as DraftPlatform,
		content: r.content,
		version: r.version,
		parentDraftId: r.parent_draft_id,
		origin: r.origin as DraftOrigin,
		status: r.status as DraftStatus,
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
		createdAt: r.created_at ?? undefined,
	};
}

/**
 * Repository handling Creator module persistence: materials / drafts / assets
 */
export class CreatorRepository {
	constructor(private db: SqliteDatabase) {}

	// ================= Materials =================

	listMaterials(includeArchived = false): Material[] {
		const rows = this.db
			.prepare(
				`SELECT * FROM materials ${includeArchived ? "" : "WHERE status = 'active'"} ORDER BY updated_at DESC, id DESC`,
			)
			.all() as MaterialRow[];
		const assetRows = this.db
			.prepare("SELECT * FROM assets ORDER BY id ASC")
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
		},
	): void {
		const current = this.getMaterial(id);
		if (!current) throw new Error(`素材不存在：${id}`);
		const now = new Date().toISOString();
		this.db
			.prepare(
				`UPDATE materials SET title = ?, content = ?, note = ?, status = ?, updated_at = ? WHERE id = ?`,
			)
			.run(
				patch.title ?? current.title,
				patch.content ?? current.content,
				patch.note !== undefined ? patch.note : (current.note ?? null),
				patch.status ?? current.status,
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

	addAsset(params: {
		materialId: number;
		relPath: string;
		kind: AssetKind;
		filename: string;
		mime?: string | null;
		sizeBytes?: number | null;
	}): number {
		const now = new Date().toISOString();
		const res = this.db
			.prepare(
				`INSERT INTO assets (material_id, rel_path, kind, filename, mime, size_bytes, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
			)
			.run(
				params.materialId,
				params.relPath,
				params.kind,
				params.filename,
				params.mime ?? null,
				params.sizeBytes ?? null,
				now,
			);
		return Number(res.lastInsertRowid);
	}

	// ================= Drafts =================

	getDraft(id: number): Draft | null {
		const row = this.db.prepare("SELECT * FROM drafts WHERE id = ?").get(id) as
			| DraftRow
			| undefined;
		return row ? rowToDraft(row) : null;
	}

	createDraft(params: {
		materialId: number;
		platform: DraftPlatform;
		content: string;
		origin: DraftOrigin;
		parentDraftId?: number | null;
		version?: number;
		status?: DraftStatus;
	}): number {
		const now = new Date().toISOString();
		const res = this.db
			.prepare(
				`INSERT INTO drafts (material_id, platform, content, version, parent_draft_id, origin, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			)
			.run(
				params.materialId,
				params.platform,
				params.content,
				params.version ?? 1,
				params.parentDraftId ?? null,
				params.origin,
				params.status ?? "draft_ready",
				now,
				now,
			);
		return Number(res.lastInsertRowid);
	}

	/**
	 * 人工编辑草稿：沿版本链产生新版本（origin='human'，status='reviewing'）。
	 * 旧版本保留在链上，供后续版本对比（M4-β）。
	 */
	createDraftVersion(parentDraftId: number, content: string): number {
		const parent = this.getDraft(parentDraftId);
		if (!parent) throw new Error(`草稿不存在：${parentDraftId}`);
		return this.createDraft({
			materialId: parent.materialId,
			platform: parent.platform,
			content,
			origin: "human",
			parentDraftId: parent.id,
			version: parent.version + 1,
			status: "reviewing",
		});
	}

	/** 沿 parent_draft_id 向上找到版本链根 */
	private getChainRootId(draftId: number): number {
		const rows = this.db
			.prepare(
				`WITH RECURSIVE up(id, parent) AS (
           SELECT id, parent_draft_id FROM drafts WHERE id = ?
           UNION ALL
           SELECT d.id, d.parent_draft_id FROM drafts d JOIN up u ON d.id = u.parent
         )
         SELECT id FROM up WHERE parent IS NULL`,
			)
			.all(draftId) as Array<{ id: number }>;
		if (rows.length === 0) throw new Error(`草稿不存在：${draftId}`);
		return rows[0].id;
	}

	/** 版本链全部草稿 id（根 → 叶） */
	private getChainIds(rootId: number): number[] {
		const rows = this.db
			.prepare(
				`WITH RECURSIVE down(id) AS (
           SELECT id FROM drafts WHERE id = ?
           UNION ALL
           SELECT d.id FROM drafts d JOIN down c ON d.parent_draft_id = c.id
         )
         SELECT id FROM down`,
			)
			.all(rootId) as Array<{ id: number }>;
		return rows.map((r) => r.id);
	}

	/** 版本链上版本号最大的草稿（链的当前状态载体） */
	private getChainLatest(rootId: number): Draft {
		const row = this.db
			.prepare(
				`WITH RECURSIVE down(id) AS (
           SELECT id FROM drafts WHERE id = ?
           UNION ALL
           SELECT d.id FROM drafts d JOIN down c ON d.parent_draft_id = c.id
         )
         SELECT d.* FROM drafts d JOIN down c ON d.id = c.id
         ORDER BY d.version DESC LIMIT 1`,
			)
			.get(rootId) as DraftRow | undefined;
		if (!row) throw new Error(`草稿链不存在：${rootId}`);
		return rowToDraft(row);
	}

	/**
	 * 状态流转（状态机层面拦截非法跃迁）。
	 * - 目标状态必须在 ALLOWED_TRANSITIONS 内；
	 * - discarded 软删除整条链，其余流转只作用链上最新版本。
	 */
	updateDraftStatus(draftId: number, target: DraftStatus): void {
		const rootId = this.getChainRootId(draftId);
		const latest = this.getChainLatest(rootId);
		const allowed = ALLOWED_TRANSITIONS[latest.status] ?? [];
		if (!allowed.includes(target)) {
			throw new Error(
				`非法状态流转：${latest.status} → ${target}（草稿 #${latest.id}）`,
			);
		}
		const now = new Date().toISOString();
		if (target === "discarded") {
			const ids = this.getChainIds(rootId);
			const stmt = this.db.prepare(
				"UPDATE drafts SET status = 'discarded', updated_at = ? WHERE id = ?",
			);
			const tx = this.db.transaction(() => {
				for (const id of ids) stmt.run(now, id);
			});
			tx();
			return;
		}
		this.db
			.prepare("UPDATE drafts SET status = ?, updated_at = ? WHERE id = ?")
			.run(target, now, latest.id);
	}

	/**
	 * 导出闸门：只有 approved（或已 exported，幂等）的草稿允许导出。
	 * 首次导出时 approved → exported。
	 */
	exportDraft(draftId: number): Draft {
		const rootId = this.getChainRootId(draftId);
		const latest = this.getChainLatest(rootId);
		if (latest.status !== "approved" && latest.status !== "exported") {
			throw new Error("草稿尚未定稿（approved），按状态机规则不允许导出");
		}
		if (latest.status === "approved") {
			const now = new Date().toISOString();
			this.db
				.prepare(
					"UPDATE drafts SET status = 'exported', updated_at = ? WHERE id = ?",
				)
				.run(now, latest.id);
			return { ...latest, status: "exported", updatedAt: now };
		}
		return latest;
	}

	/**
	 * 草稿箱列表：每条版本链只展示「未废弃的最新版本」一条，附带素材标题。
	 */
	listDrafts(): DraftWithMaterial[] {
		const rows = this.db
			.prepare(
				`WITH RECURSIVE chain(draft_id, root_id) AS (
           SELECT id, id FROM drafts WHERE parent_draft_id IS NULL
           UNION ALL
           SELECT d.id, c.root_id FROM drafts d JOIN chain c ON d.parent_draft_id = c.draft_id
         ),
         latest AS (
           SELECT c.root_id, MAX(d.version) AS max_version
           FROM drafts d JOIN chain c ON d.id = c.draft_id
           WHERE d.status != 'discarded'
           GROUP BY c.root_id
         )
         SELECT d.*, m.title AS material_title
         FROM latest l
         JOIN chain c ON c.root_id = l.root_id
         JOIN drafts d ON d.id = c.draft_id AND d.version = l.max_version AND d.status != 'discarded'
         LEFT JOIN materials m ON m.id = d.material_id
         ORDER BY d.updated_at DESC, d.id DESC`,
			)
			.all() as Array<DraftRow & { material_title: string | null }>;
		return rows.map((r) => ({
			...rowToDraft(r),
			materialTitle: r.material_title ?? "（素材已删除）",
		}));
	}
}
