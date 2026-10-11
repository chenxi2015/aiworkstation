import { createServerFn } from "@tanstack/react-start";
import type {
	ActivityDay,
	ActivityEvent,
	ActivityKind,
	DocumentSummary,
	FolderShortcut,
	RecentBookmark,
	RecentMaterial,
	RecentNote,
	WorkbenchSummary,
} from "../../components/dashboard/types.ts";
import type { ObsidianTreeNode } from "../../components/obsidian/types.ts";
import { getDb } from "../db/connection.ts";
import { workbenchDb } from "../db/sqlite.ts";
import { getLastDeadLinkScan } from "../maintenance.ts";
import { scanVaultTree } from "../services/obsidian/index.ts";
import { scanSkillsOverview } from "../services/skills/index.ts";

function queryRecentBookmarks(limit: number): RecentBookmark[] {
	const rows = getDb()
		.prepare(
			`SELECT id, title, url, favicon, created_at
       FROM bookmarks ORDER BY created_at DESC LIMIT ?`,
		)
		.all(limit) as Array<{
		id: string;
		title: string;
		url: string;
		favicon: string;
		created_at: string;
	}>;
	return rows.map((r) => ({
		id: r.id,
		title: r.title,
		url: r.url,
		favicon: r.favicon || "",
		createdAt: r.created_at,
	}));
}

function queryRecentMaterials(limit: number): RecentMaterial[] {
	const rows = getDb()
		.prepare(
			`SELECT id, title, created_at
       FROM materials WHERE status = 'active' ORDER BY created_at DESC LIMIT ?`,
		)
		.all(limit) as Array<{
		id: number;
		title: string;
		created_at: string;
	}>;
	return rows.map((r) => ({
		id: r.id,
		title: r.title,
		createdAt: r.created_at,
	}));
}

/** 拍平 Vault 目录树取最近修改的笔记（文件夹 mtime=0 天然沉底，sort 后截断） */
function collectRecentNotes(
	nodes: ObsidianTreeNode[],
	limit: number,
): RecentNote[] {
	const notes: RecentNote[] = [];
	const walk = (list: ObsidianTreeNode[]) => {
		for (const node of list) {
			if (node.kind === "note") {
				notes.push({
					name: node.name,
					relPath: node.relPath,
					mtime: node.mtime,
				});
			}
			if (node.children) walk(node.children);
		}
	};
	walk(nodes);
	return notes.sort((a, b) => b.mtime - a.mtime).slice(0, limit);
}

function queryTopFolders(limit: number): FolderShortcut[] {
	const rows = getDb()
		.prepare(
			`SELECT f.id, f.name, f.category, f.color,
              COUNT(fi.item_id) AS item_count
       FROM folders f
       LEFT JOIN folder_items fi ON fi.folder_id = f.id
       GROUP BY f.id
       ORDER BY item_count DESC, f.updated_at DESC
       LIMIT ?`,
		)
		.all(limit) as Array<{
		id: number;
		name: string;
		category: string;
		color: string;
		item_count: number;
	}>;
	return rows.map((r) => ({
		id: r.id,
		name: r.name,
		category: r.category || "",
		color: r.color || "",
		itemCount: r.item_count,
	}));
}

function countRows(sql: string): number {
	const row = getDb().prepare(sql).get() as { n: number } | undefined;
	return row?.n ?? 0;
}

/** 活动日历聚合范围：最近 26 周（约半年），与 GitHub 热点图的半年视图对齐 */
const ACTIVITY_DAYS = 183;
/** 单日事件明细上限（按需加载，批量导入日可能上千条，仍需封顶控制载荷） */
const ACTIVITY_EVENTS_PER_DAY = 50;

const ACTIVITY_COUNT_QUERIES: Record<ActivityKind, string> = {
	bookmark: `SELECT date(created_at) AS d, COUNT(*) AS n FROM bookmarks
    WHERE date(created_at) >= date('now', ?) GROUP BY d`,
	material: `SELECT date(created_at) AS d, COUNT(*) AS n FROM materials
    WHERE date(created_at) >= date('now', ?) GROUP BY d`,
	// 文档按「最后被编辑」归类：反映当天的创作动作而非建档时间
	document: `SELECT date(COALESCE(updated_at, created_at)) AS d, COUNT(*) AS n FROM documents
    WHERE date(COALESCE(updated_at, created_at)) >= date('now', ?) GROUP BY d`,
};

const ACTIVITY_EVENT_QUERIES: Record<ActivityKind, string> = {
	bookmark: `SELECT id, title, created_at AS ts FROM bookmarks WHERE date(created_at) = ?`,
	material: `SELECT id, title, created_at AS ts FROM materials WHERE date(created_at) = ?`,
	document: `SELECT id, title, COALESCE(updated_at, created_at) AS ts FROM documents
    WHERE date(COALESCE(updated_at, created_at)) = ?`,
};

/** 按日聚合三类实体的活动量（收藏/素材/文档），日历 widget 热力数据源（仅计数，明细按需加载） */
function queryActivity(): ActivityDay[] {
	const db = getDb();
	const range = `-${ACTIVITY_DAYS} days`;
	const days = new Map<string, ActivityDay>();
	const getDay = (date: string): ActivityDay => {
		let day = days.get(date);
		if (!day) {
			day = {
				date,
				total: 0,
				counts: { bookmark: 0, material: 0, document: 0 },
			};
			days.set(date, day);
		}
		return day;
	};

	for (const kind of Object.keys(ACTIVITY_COUNT_QUERIES) as ActivityKind[]) {
		const rows = db.prepare(ACTIVITY_COUNT_QUERIES[kind]).all(range) as Array<{
			d: string;
			n: number;
		}>;
		for (const row of rows) {
			const day = getDay(row.d);
			day.counts[kind] = row.n;
			day.total += row.n;
		}
	}

	return [...days.values()].sort((a, b) => b.date.localeCompare(a.date));
}

/**
 * Server Function: 活动日历单日事件明细（按需加载，避免汇总接口携带近半年全量明细）。
 * 入参为 YYYY-MM-DD，返回当日三类实体事件（按时间倒序，封顶 ACTIVITY_EVENTS_PER_DAY 条）。
 */
export const getActivityDayEvents = createServerFn({ method: "GET" })
	.validator((date: string): string => {
		if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
			throw new Error(`非法日期：${date}`);
		}
		return date;
	})
	.handler(async ({ data: date }): Promise<ActivityEvent[]> => {
		const db = getDb();
		const events: Array<ActivityEvent & { ts: string }> = [];
		for (const kind of Object.keys(ACTIVITY_EVENT_QUERIES) as ActivityKind[]) {
			const rows = db.prepare(ACTIVITY_EVENT_QUERIES[kind]).all(date) as Array<{
				id: string | number;
				title: string | null;
				ts: string;
			}>;
			for (const row of rows) {
				events.push({
					kind,
					id: row.id,
					title: row.title || `未命名 #${row.id}`,
					ts: row.ts,
				});
			}
		}
		return events
			.sort((a, b) => b.ts.localeCompare(a.ts))
			.slice(0, ACTIVITY_EVENTS_PER_DAY)
			.map(({ ts: _ts, ...event }) => event);
	});

/**
 * Server Function: 工作台仪表盘跨模块汇总（一次调用聚合书签/文件夹/创作/创作/Skills/巡检）
 */
export const getWorkbenchSummary = createServerFn({ method: "GET" }).handler(
	async (): Promise<WorkbenchSummary> => {
		const summary: WorkbenchSummary = {
			bookmarks: { total: 0, unclassified: 0, embedded: 0, recent: [] },
			folders: { total: 0, top: [] },
			creator: {
				materials: 0,
				recentMaterials: [],
			},
			obsidian: { available: false, noteCount: 0, recent: [] },
			editor: { total: 0, recent: [] },
			skills: { available: false, total: 0, rootCount: 0, recent: [] },
			health: { deadLinks: null },
			activity: { days: [] },
			generatedAt: new Date().toISOString(),
		};

		try {
			summary.bookmarks.total = countRows(
				"SELECT COUNT(*) AS n FROM bookmarks",
			);
			summary.bookmarks.unclassified = countRows(
				`SELECT COUNT(*) AS n FROM bookmarks b
         LEFT JOIN folder_items fi ON b.id = fi.item_id
         WHERE fi.id IS NULL`,
			);
			summary.bookmarks.embedded = countRows(
				"SELECT COUNT(*) AS n FROM bookmarks WHERE embedding IS NOT NULL",
			);
			summary.bookmarks.recent = queryRecentBookmarks(8);
			summary.folders.total = countRows("SELECT COUNT(*) AS n FROM folders");
			summary.folders.top = queryTopFolders(8);
		} catch (err) {
			console.warn("[getWorkbenchSummary] bookmarks/folders error:", err);
		}

		try {
			summary.creator.materials = countRows(
				"SELECT COUNT(*) AS n FROM materials WHERE status = 'active'",
			);
			summary.creator.recentMaterials = queryRecentMaterials(5);
		} catch (err) {
			console.warn("[getWorkbenchSummary] creator error:", err);
		}

		try {
			const vaultTree = await scanVaultTree();
			summary.obsidian = {
				available: vaultTree.vault.exists,
				noteCount: vaultTree.vault.noteCount,
				recent: vaultTree.vault.exists
					? collectRecentNotes(vaultTree.tree, 5)
					: [],
			};
		} catch (err) {
			console.warn("[getWorkbenchSummary] obsidian error:", err);
		}

		try {
			const documents = workbenchDb.listDocuments(false);
			summary.editor.total = documents.length;
			summary.editor.recent = documents.slice(0, 5).map(
				(d): DocumentSummary => ({
					id: d.id,
					title: d.title,
					status: d.status,
					updatedAt: d.updatedAt,
				}),
			);
		} catch (err) {
			console.warn("[getWorkbenchSummary] editor error:", err);
		}

		try {
			const overview = await scanSkillsOverview(false);
			const sorted = [...overview.skills].sort(
				(a, b) => b.modifiedAt - a.modifiedAt,
			);
			summary.skills = {
				available: true,
				total: overview.skills.length,
				rootCount: overview.roots.filter((r) => r.exists).length,
				recent: sorted
					.slice(0, 5)
					.map((s) => ({ name: s.name, dirPath: s.dirPath })),
			};
		} catch (err) {
			console.warn("[getWorkbenchSummary] skills error:", err);
		}

		try {
			const lastScan = getLastDeadLinkScan();
			if (lastScan?.done) {
				summary.health.deadLinks = lastScan.items.length;
				summary.health.lastScanAt = lastScan.finishedAt ?? lastScan.startedAt;
			}
		} catch (err) {
			console.warn("[getWorkbenchSummary] health error:", err);
		}

		try {
			summary.activity.days = queryActivity();
		} catch (err) {
			console.warn("[getWorkbenchSummary] activity error:", err);
		}

		return summary;
	},
);
