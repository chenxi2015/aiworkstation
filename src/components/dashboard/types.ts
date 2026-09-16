/**
 * 工作台仪表盘共享类型（Server Functions 与 UI 共用）
 */

export interface RecentBookmark {
	id: string;
	title: string;
	url: string;
	favicon: string;
	createdAt: string;
}

export interface FolderShortcut {
	id: number;
	name: string;
	category: string;
	color: string;
	itemCount: number;
}

export interface DraftSummary {
	id: number;
	materialTitle: string;
	platform: string;
	status: string;
	updatedAt?: string;
}

export interface DocumentSummary {
	id: number;
	title: string;
	status: string;
	updatedAt?: string;
}

/** 跨模块聚合的工作台首页数据（getWorkbenchSummary 返回） */
export interface WorkbenchSummary {
	bookmarks: {
		total: number;
		unclassified: number;
		/** 已向量化（可用于语义检索/RAG）的书签数 */
		embedded: number;
		recent: RecentBookmark[];
	};
	folders: {
		total: number;
		top: FolderShortcut[];
	};
	creator: {
		materials: number;
		/** 待审稿（draft_ready / reviewing）草稿数 */
		draftsPending: number;
		draftsTotal: number;
		recentDrafts: DraftSummary[];
	};
	editor: {
		total: number;
		recent: DocumentSummary[];
	};
	skills: {
		available: boolean;
		total: number;
		rootCount: number;
		recentNames: string[];
	};
	health: {
		/** 最近一次死链巡检发现的疑似失效链接数（无巡检记录为 null） */
		deadLinks: number | null;
		lastScanAt?: string;
	};
	generatedAt: string;
}
