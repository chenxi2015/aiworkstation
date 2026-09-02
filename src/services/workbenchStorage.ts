import type {
	AIClassificationResult,
	BookmarkTDKItem,
	EmbeddingStats,
	Folder,
	SearchMode,
	SearchResultItem,
	WorkbenchItem,
	WorkbenchSettings,
} from "../components/workbench/types";
import {
	batchGenerateEmbeddings,
	getEmbeddingCoverageStats,
	searchWorkbenchItems,
} from "../server/functions/search.ts";
import {
	addBookmarks,
	applyAIClassification,
	deleteFolder,
	deleteItem,
	getWorkbenchData,
	moveItem,
	saveFolder,
} from "../server/functions/workbench.ts";
import {
	DEFAULT_DEEPSEEK_BASE_URL,
	DEFAULT_DEEPSEEK_KEY,
	DEFAULT_DEEPSEEK_MODEL,
} from "./aiClassifier.ts";
import {
	DEFAULT_EMBEDDING_BASE_URL,
	DEFAULT_EMBEDDING_MODEL,
	type EmbeddingConfig,
} from "./embeddingService.ts";

const STORAGE_KEYS = {
	SETTINGS: "aiworkstation_settings_v3",
} as const;

export const DEFAULT_SETTINGS: WorkbenchSettings = {
	deepseekApiKey: DEFAULT_DEEPSEEK_KEY,
	deepseekBaseUrl: DEFAULT_DEEPSEEK_BASE_URL,
	deepseekModel: DEFAULT_DEEPSEEK_MODEL,
	batchSize: 15,
	embeddingApiKey: "",
	embeddingBaseUrl: DEFAULT_EMBEDDING_BASE_URL,
	embeddingModel: DEFAULT_EMBEDDING_MODEL,
};

/**
 * Service using TanStack Start createServerFn for end-to-end type-safe SQLite RPC
 */
export class WorkbenchStorageService {
	/**
	 * Fetch all folders and unclassified items from SQLite via createServerFn
	 */
	static async fetchAllFromDb(): Promise<{
		folders: Folder[];
		unclassified: WorkbenchItem[];
	}> {
		try {
			return await getWorkbenchData();
		} catch (err) {
			console.warn(
				"[WorkbenchStorage] createServerFn getWorkbenchData error:",
				err,
			);
			return { folders: [], unclassified: [] };
		}
	}

	/**
	 * Save new or edited folder to SQLite via createServerFn
	 */
	static async saveFolderToDb(folderData: {
		id?: number;
		name: string;
		category: string;
		desc: string;
	}): Promise<Folder[]> {
		return await saveFolder({ data: folderData });
	}

	/**
	 * Delete folder from SQLite via createServerFn
	 */
	static async deleteFolderFromDb(id: number): Promise<Folder[]> {
		return await deleteFolder({ data: id });
	}

	/**
	 * Apply AI Classification results into SQLite database via createServerFn
	 */
	static async applyAIClassificationToDb(
		results: AIClassificationResult[],
	): Promise<{ folders: Folder[]; unclassified: WorkbenchItem[] }> {
		return await applyAIClassification({ data: results });
	}

	/**
	 * Move item between folders in SQLite via createServerFn
	 */
	static async moveItemInDb(
		itemId: string | number,
		sourceFolderId: number | null,
		targetFolderId: number | null,
	): Promise<{ folders: Folder[]; unclassified: WorkbenchItem[] }> {
		return await moveItem({
			data: {
				itemId,
				sourceFolderId,
				targetFolderId,
			},
		});
	}

	/**
	 * Delete item in SQLite via createServerFn
	 */
	static async deleteItemInDb(
		itemId: string | number,
		folderId: number | null,
	): Promise<{ folders: Folder[]; unclassified: WorkbenchItem[] }> {
		return await deleteItem({
			data: {
				itemId,
				folderId,
			},
		});
	}

	/**
	 * Add new items directly to SQLite via createServerFn
	 */
	static async addBookmarksToDb(
		bookmarks: BookmarkTDKItem[],
	): Promise<{ count: number; unclassified: WorkbenchItem[] }> {
		return await addBookmarks({ data: bookmarks });
	}

	/**
	 * Search bookmarks across SQLite using keyword, semantic, or hybrid ranking
	 */
	static async searchItems(params: {
		query: string;
		mode?: SearchMode;
		embeddingConfig?: EmbeddingConfig;
		limit?: number;
	}): Promise<SearchResultItem[]> {
		try {
			return await searchWorkbenchItems({ data: params });
		} catch (err) {
			console.warn("[WorkbenchStorage] searchWorkbenchItems error:", err);
			return [];
		}
	}

	/**
	 * Fetch current embedding statistics
	 */
	static async getEmbeddingStats(): Promise<EmbeddingStats> {
		try {
			return await getEmbeddingCoverageStats();
		} catch (err) {
			console.warn("[WorkbenchStorage] getEmbeddingCoverageStats error:", err);
			return { total: 0, embedded: 0, percentage: 0 };
		}
	}

	/**
	 * Process a batch of bookmarks to generate and store embeddings in SQLite
	 */
	static async batchProcessEmbeddings(params: {
		config: EmbeddingConfig;
		batchSize?: number;
		forceAll?: boolean;
	}): Promise<{ processed: number; remaining: number; stats: EmbeddingStats }> {
		return await batchGenerateEmbeddings({ data: params });
	}

	/**
	 * Load settings
	 */
	static getSettings(): WorkbenchSettings {
		if (typeof window === "undefined") return DEFAULT_SETTINGS;
		try {
			const raw = window.localStorage.getItem(STORAGE_KEYS.SETTINGS);
			if (raw) {
				return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
			}
		} catch (err) {
			console.error("Failed to load settings from localStorage:", err);
		}
		return DEFAULT_SETTINGS;
	}

	/**
	 * Persist settings
	 */
	static saveSettings(settings: WorkbenchSettings): void {
		if (typeof window === "undefined") return;
		try {
			window.localStorage.setItem(
				STORAGE_KEYS.SETTINGS,
				JSON.stringify(settings),
			);
		} catch (err) {
			console.error("Failed to save settings to localStorage:", err);
		}
	}
}
