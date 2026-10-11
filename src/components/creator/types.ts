/**
 * 创作（creator）模块共享类型 —— 数据模型以 docs/creator-plan.md 第三节为准。
 * 服务端仓储与前端组件共用。
 */

/** 素材来源：手动录入 | 书签快照 */
export type MaterialSourceType = "manual" | "bookmark";

/** 素材状态机：active（可用于创作）/ archived（归档保留溯源） */
export type MaterialStatus = "active" | "archived";

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
	/** 收藏标记（素材库「已收藏」筛选） */
	starred?: boolean;
	createdAt?: string;
	updatedAt?: string;
	assets?: MaterialAsset[];
}

export type AssetStorageMode = "managed" | "external";

export interface MaterialAsset {
	id: number;
	materialId: number;
	relPath: string;
	kind: AssetKind;
	filename: string;
	mime?: string | null;
	sizeBytes?: number | null;
	storageMode?: AssetStorageMode;
	sourcePath?: string | null;
	createdAt?: string;
}
