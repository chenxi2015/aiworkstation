/**
 * Type definitions for the internal Electron Crawler service and worker
 */

export interface CrawlJob {
	id: string;
	url: string;
	selector?: string | null;
	waitMs?: number | null;
	mode?: "content" | "skeleton" | null;
	fullPage?: boolean;
	createdAt?: number;
}

export interface CrawlSkeletonBlock {
	index: number;
	cssPath: string;
	tag: string;
	className: string;
	textLength: number;
	linkDensity: number;
	childCount: number;
	preview: string;
}

export interface CrawlJobResult {
	success: boolean;
	title?: string;
	markdown?: string;
	html?: string;
	images?: string[];
	finalUrl?: string;
	extractedBy?: "selector" | "article" | "full";
	totalLength?: number;
	truncated?: boolean;
	skeleton?: CrawlSkeletonBlock[];
	error?: string;
}

