import type Database from "better-sqlite3";
import type { ItemType } from "../../components/workbench/types";

/**
 * SQLite database instance type
 */
export type SqliteDatabase = InstanceType<typeof Database>;

/**
 * Query parameters for advanced bookmark search & filtering
 */
export interface BookmarkQueryParams {
	timeRange?:
		| "today"
		| "yesterday"
		| "this_week"
		| "last_week"
		| "this_month"
		| "recent_7_days"
		| "recent_30_days"
		| "all";
	startDate?: string;
	endDate?: string;
	startTimeMs?: number;
	endTimeMs?: number;
	folderName?: string;
	category?: string;
	tag?: string;
	keyword?: string;
	limit?: number;
	sortBy?: "date_added" | "created_at" | "updated_at";
	sortOrder?: "ASC" | "DESC";
}

/**
 * Embedding vector coverage statistics
 */
export interface EmbeddingStats {
	total: number;
	embedded: number;
	percentage: number;
}

/**
 * Raw bookmark item requiring embedding calculation
 */
export interface NeedingEmbeddingBookmark {
	id: string;
	title: string;
	url: string;
	description: string;
	keywords: string;
	summary: string;
	tags: string;
	parent_title: string;
}

/**
 * Enriched bookmark item for full hybrid / semantic search
 */
export interface SearchBookmarkItem {
	id: string;
	name: string;
	url: string;
	type: ItemType;
	description: string;
	keywords: string;
	summary: string;
	tags: string[];
	favicon?: string;
	folderId?: number | null;
	folderName?: string;
	category?: string;
	createdAt?: string;
	embedding: number[] | null;
}
