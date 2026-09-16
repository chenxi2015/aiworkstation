import { createServerFn } from "@tanstack/react-start";
import type {
	DocumentSummary,
	DraftSummary,
	FolderShortcut,
	RecentBookmark,
	WorkbenchSummary,
} from "../../components/dashboard/types.ts";
import { getDb } from "../db/connection.ts";
import { workbenchDb } from "../db/sqlite.ts";
import { getLastDeadLinkScan } from "../maintenance.ts";
import { scanSkillsOverview } from "../services/skillsScanner.ts";

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

/**
 * Server Function: 工作台仪表盘跨模块汇总（一次调用聚合书签/文件夹/自媒体/创作/Skills/巡检）
 */
export const getWorkbenchSummary = createServerFn({ method: "GET" }).handler(
	async (): Promise<WorkbenchSummary> => {
		const summary: WorkbenchSummary = {
			bookmarks: { total: 0, unclassified: 0, embedded: 0, recent: [] },
			folders: { total: 0, top: [] },
			creator: {
				materials: 0,
				draftsPending: 0,
				draftsTotal: 0,
				recentDrafts: [],
			},
			editor: { total: 0, recent: [] },
			skills: { available: false, total: 0, rootCount: 0, recentNames: [] },
			health: { deadLinks: null },
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
			const drafts = workbenchDb.listDrafts();
			summary.creator.draftsTotal = drafts.length;
			summary.creator.draftsPending = drafts.filter(
				(d) => d.status === "draft_ready" || d.status === "reviewing",
			).length;
			summary.creator.recentDrafts = drafts.slice(0, 5).map(
				(d): DraftSummary => ({
					id: d.id,
					materialTitle: d.materialTitle,
					platform: d.platform,
					status: d.status,
					updatedAt: d.updatedAt,
				}),
			);
		} catch (err) {
			console.warn("[getWorkbenchSummary] creator error:", err);
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
				recentNames: sorted.slice(0, 5).map((s) => s.name),
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

		return summary;
	},
);
