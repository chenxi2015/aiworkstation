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

/** 最近变更的 skill 摘要（dirPath 用于深链定位详情面板） */
export interface SkillRecent {
	name: string;
	dirPath: string;
}

/** 活动日历的事件类型：收藏 / 素材 / 二创草稿 / 创作文档 */
export type ActivityKind = "bookmark" | "material" | "draft" | "document";

/** 某一天的一条活动记录（深链回所属模块） */
export interface ActivityEvent {
	kind: ActivityKind;
	/** 书签为 string id，其余为 number id */
	id: string | number;
	title: string;
}

/** 活动日历按日聚合（date 为 YYYY-MM-DD） */
export interface ActivityDay {
	date: string;
	total: number;
	counts: Record<ActivityKind, number>;
	/** 当日事件明细（按时间倒序，服务端截断） */
	events: ActivityEvent[];
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
		recent: SkillRecent[];
	};
	health: {
		/** 最近一次死链巡检发现的疑似失效链接数（无巡检记录为 null） */
		deadLinks: number | null;
		lastScanAt?: string;
	};
	/** 活动日历：最近若干个月的按日聚合（收藏/素材/草稿/文档） */
	activity: {
		days: ActivityDay[];
	};
	generatedAt: string;
}
