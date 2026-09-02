export type ItemType = "tool" | "link" | "doc" | "skill" | "note";

export interface PageTDK {
	title: string;
	description?: string;
	keywords?: string;
	url: string;
	favicon?: string;
	siteName?: string;
}

export interface BookmarkTDKItem {
	id: string | number;
	title: string;
	url: string;
	description?: string;
	keywords?: string;
	folderPath?: string;
	parentTitle?: string;
	dateAdded?: number;
	favicon?: string;
}

export interface WorkbenchItem {
	id?: number | string;
	name: string;
	type: ItemType;
	url?: string;
	favicon?: string;
	description?: string;
	keywords?: string;
	summary?: string;
	tags?: string[];
	folderId?: number | null;
	folderName?: string;
	category?: string;
	reason?: string;
	createdAt?: string;
	dateAdded?: number;
	source?: "bookmark_sync" | "manual" | "grab" | "preset";
}

export interface AIClassificationResult {
	id: string | number;
	title: string;
	url: string;
	favicon?: string;
	category: string;
	folderName: string;
	folderDesc?: string;
	itemType: ItemType;
	summary: string;
	tags: string[];
	reason?: string;
}

export interface Folder {
	id: number;
	name: string;
	category: string;
	createdAt: string;
	desc?: string;
	dossierMarkdown?: string;
	dossierUpdatedAt?: string;
	items: WorkbenchItem[];
}

export interface WorkbenchSettings {
	deepseekApiKey: string;
	deepseekBaseUrl: string;
	deepseekModel: string;
	batchSize: number;
	// Embedding API Settings for RAG & Semantic Search
	embeddingApiKey?: string;
	embeddingBaseUrl?: string;
	embeddingModel?: string;
}

export type SearchMode = "hybrid" | "semantic" | "keyword";

export interface SearchResultItem extends WorkbenchItem {
	score: number;
	similarityPercent?: number;
	matchType: "semantic" | "keyword" | "hybrid";
	matchReason?: string;
}

export interface EmbeddingStats {
	total: number;
	embedded: number;
	percentage: number;
}

export const CATEGORIES = [
	"工作台",
	"首页",
	"自媒体",
	"技能",
	"电商",
	"收藏",
	"chrome插件",
	"skills",
	"未分类",
] as const;

export type Category = (typeof CATEGORIES)[number] | string;

export interface ItemTypeMeta {
	label: string;
	color: string;
}

export const ITEM_TYPES: Record<ItemType, ItemTypeMeta> = {
	tool: { label: "工具", color: "var(--accent, #6366f1)" },
	link: { label: "链接", color: "oklch(0.62 0.12 230)" },
	doc: { label: "文档", color: "oklch(0.65 0.14 145)" },
	skill: { label: "技能", color: "oklch(0.60 0.16 300)" },
	note: { label: "笔记", color: "oklch(0.68 0.12 70)" },
};

export const INITIAL_FOLDERS: Folder[] = [];
