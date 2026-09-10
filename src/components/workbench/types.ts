import type { NavLayoutEntry } from "../../modules/registry";

export type ItemType = "tool" | "link" | "doc" | "skill" | "note";

/** JSON 可序列化值（server function 跨边界载荷的约束类型） */
export type JsonValue =
	| string
	| number
	| boolean
	| null
	| JsonValue[]
	| { [key: string]: JsonValue };

/** 文件夹内容的展现形式（持久化在 folders.view_prefs） */
export type FolderViewMode = "card" | "list" | "gallery" | "table";

/** 工作台文件夹区的整体展示方式（持久化在 settings.folderGridView） */
export type FolderGridView = "grid" | "list";

/** 文件夹视图偏好：每个文件夹记住自己的展现形式与排序 */
export interface FolderViewPrefs {
	mode?: FolderViewMode;
	/** 排序维度，如 updated / created / name / manual */
	sort?: string;
	/** 展示密度 */
	density?: "comfortable" | "compact";
}

/** note 类型条目的载荷（存 bookmarks.payload JSON） */
export interface NotePayload {
	content: string;
	/** 内容格式，默认 markdown */
	format?: "markdown" | "plain";
}

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
	/** 类型载荷：note 存 NotePayload，image/video/file 存路径与元信息 */
	payload?: Record<string, JsonValue>;
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
	parentId?: number | null;
	createdAt: string;
	desc?: string;
	color?: string;
	/** 视图偏好（card/list/gallery/table），未设置时由页面默认值兜底 */
	viewPrefs?: FolderViewPrefs;
	dossierMarkdown?: string;
	dossierUpdatedAt?: string;
	items: WorkbenchItem[];
}

export interface WorkbenchSettings {
	// Universal LLM Configuration (supports DeepSeek, Kimi, GLM, OpenAI, Claude, Ollama, Custom)
	apiKey: string;
	baseUrl: string;
	model: string;
	batchSize: number;
	// Max concurrent AI batch requests (to avoid rate limiting)
	concurrency: number;
	// LLM provider preset id (deepseek / kimi / glm / openai / claude / custom)
	llmProvider?: string;
	// Embedding API Settings for RAG & Semantic Search
	embeddingApiKey?: string;
	embeddingBaseUrl?: string;
	embeddingModel?: string;
	// Embedding provider preset id (siliconflow / openai / custom)
	embeddingProvider?: string;
	// 文件管理根目录：视频下载、creator 素材文件等统一落在此目录下
	filesRootDir?: string;
	// 已废弃：旧版下载目录设置，读取时作为 filesRootDir 的 alias 免迁移兼容，写入只写 filesRootDir
	downloadsDir?: string;
	// Whether the first-time setup wizard has been completed
	setupComplete?: boolean;
	// 顶部模块导航的自定义布局（顺序/显隐），未设置时按注册表默认顺序
	navLayout?: NavLayoutEntry[];
	// 工作台文件夹区的展示方式：网格卡片 / 列表行（全局偏好，非 per-folder view_prefs）
	folderGridView?: FolderGridView;
	// 创作模块（editor）自定义行文风格预设
	editorStylePresets?: import("../editor/types.ts").EditorStylePreset[];
}

export type SearchMode = "hybrid" | "semantic" | "keyword";

export interface SearchResultItem extends WorkbenchItem {
	score: number;
	similarityPercent?: number;
	matchType: "semantic" | "keyword" | "hybrid";
	matchReason?: string;
	highlights?: {
		name?: string;
		summary?: string;
	};
}

// Search scope for limiting search range
export interface SearchScope {
	type: "global" | "category" | "folder";
	categoryName?: string;
	folderId?: number;
	folderName?: string;
	folderIds?: number[];
}

// Facet distribution counts from search results
export interface SearchFacets {
	categories: { name: string; count: number }[];
	folders: { name: string; folderId: number | null; count: number }[];
	types: { name: string; count: number }[];
}

// Enhanced search response with facets
export interface SearchResponse {
	items: SearchResultItem[];
	facets: SearchFacets;
	total: number;
}

export interface EmbeddingStats {
	total: number;
	embedded: number;
	percentage: number;
}

// Default system categories. All other navigation categories are dynamically driven by the database folders table.
export const CATEGORIES = ["工作台", "未分类"] as const;

// "未分类" is a pseudo-category for unclassified bookmark inbox; folders cannot belong to it
export const FOLDER_CATEGORIES = CATEGORIES.filter((c) => c !== "未分类");

export type Category = (typeof CATEGORIES)[number] | string;

/**
 * Sort category list according to the top navigation order
 */
export function sortCategoriesByNavOrder(
	categoryList: string[],
	baseOrder: readonly string[] | string[] = CATEGORIES,
): string[] {
	const orderMap = new Map<string, number>();
	baseOrder.forEach((cat, index) => {
		orderMap.set(cat, index);
	});

	return [...categoryList].sort((a, b) => {
		const aIndex = orderMap.has(a) ? (orderMap.get(a) as number) : 9999;
		const bIndex = orderMap.has(b) ? (orderMap.get(b) as number) : 9999;
		if (aIndex !== bIndex) {
			return aIndex - bIndex;
		}
		return a.localeCompare(b);
	});
}

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
