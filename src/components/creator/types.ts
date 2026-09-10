/**
 * 自媒体（creator）模块共享类型 —— 数据模型以 docs/creator-plan.md 第三节为准。
 * 服务端仓储与前端组件共用。
 */

/** 素材来源：手动录入 | 书签快照 */
export type MaterialSourceType = "manual" | "bookmark";

/** 素材状态机：active（可用于二创）/ archived（归档保留溯源） */
export type MaterialStatus = "active" | "archived";

/** 二创平台变体 */
export type DraftPlatform = "xhs" | "twitter" | "wechat" | "script";

export const DRAFT_PLATFORMS: readonly DraftPlatform[] = [
	"xhs",
	"twitter",
	"wechat",
	"script",
];

export const PLATFORM_LABELS: Record<DraftPlatform, string> = {
	xhs: "小红书",
	twitter: "Twitter/X",
	wechat: "公众号",
	script: "短视频脚本",
};

/**
 * 草稿状态机（creator-plan.md 第二节）：
 * draft_ready → reviewing → approved → exported（→ published 预留）
 * 任何状态可 → discarded（软删除）
 */
export type DraftStatus =
	| "draft_ready"
	| "reviewing"
	| "approved"
	| "exported"
	| "discarded";

export type DraftOrigin = "ai" | "human";

export type AssetKind = "video" | "markdown" | "image" | "audio" | "other";

/** 素材库文件夹：视频/文档/图片/书签等素材的归集（docs/creator-plan.md 第三节扩展） */
export interface MaterialFolder {
	id: number;
	name: string;
	description?: string;
	color?: string;
	sortOrder?: number;
	/** 列表查询时附带的素材计数（active 素材） */
	materialCount?: number;
	createdAt?: string;
	updatedAt?: string;
}

export interface Material {
	id: number;
	sourceType: MaterialSourceType;
	bookmarkId?: string | null;
	/** 归属素材文件夹；null/undefined = 未归档 */
	folderId?: number | null;
	title: string;
	content: string;
	note?: string | null;
	status: MaterialStatus;
	createdAt?: string;
	updatedAt?: string;
	assets?: MaterialAsset[];
}

export interface MaterialAsset {
	id: number;
	materialId: number;
	relPath: string;
	kind: AssetKind;
	filename: string;
	mime?: string | null;
	sizeBytes?: number | null;
	createdAt?: string;
}

export interface Draft {
	id: number;
	materialId: number;
	platform: DraftPlatform;
	content: string;
	version: number;
	parentDraftId?: number | null;
	origin: DraftOrigin;
	status: DraftStatus;
	createdAt?: string;
	updatedAt?: string;
}

/** 草稿箱泳道展示用：草稿 + 所属素材标题 */
export interface DraftWithMaterial extends Draft {
	materialTitle: string;
}

/** generateDrafts 的 AI 输出变体（未采纳前不落库） */
export interface DraftVariant {
	platform: DraftPlatform;
	content: string;
}
