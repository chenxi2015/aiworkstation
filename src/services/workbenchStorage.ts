import type {
	EmbeddingStats,
	Folder,
	SearchMode,
	SearchResponse,
	SearchScope,
	WorkbenchItem,
	WorkbenchSettings,
} from "../components/workbench/types";
import type { DeadLinkScanJob } from "../server/maintenance";
import {
	clearAllDataInDb,
	deleteItemsBatchInDb,
	fetchAvailableModels,
	getDeadLinkScanStatus,
	getLastDeadLinkScan,
	startDeadLinkScan,
} from "./api/maintenanceClient";
import {
	type ChatMessage,
	chatWithBookmarksRpc,
	type FolderDossierResult,
	generateFolderDossierRpc,
	type RAGChatResult,
} from "./api/ragClient";
import {
	batchProcessEmbeddings,
	getEmbeddingStats,
	searchItems,
} from "./api/searchClient";
import {
	addBookmarksToDb,
	addLinkToFolderInDb,
	applyAIClassificationToDb,
	deleteFolderFromDb,
	deleteItemInDb,
	fetchAllFromDb,
	moveFolderInDb,
	moveFolderToCategoryInDb,
	moveItemInDb,
	reorderFoldersInDb,
	saveFolderToDb,
} from "./api/workbenchClient";
import type { EmbeddingConfig } from "./embedding/client";
import {
	type ChatSession,
	clearAllChatData,
	clearChatHistory,
	clearChatSessions,
	deleteChatSession,
	getChatHistory,
	getChatSessions,
	saveChatHistory,
	saveChatSessions,
} from "./storage/chatStorage";
import {
	DEFAULT_SETTINGS,
	fetchSettingsFromDb,
	getSettings,
	saveSettings,
} from "./storage/settingsStorage";

export { DEFAULT_SETTINGS };
export type {
	ChatMessage,
	ChatSession,
	DeadLinkScanJob,
	FolderDossierResult,
	RAGChatResult,
};

/**
 * Service using TanStack Start createServerFn for end-to-end type-safe SQLite RPC
 * and client storage (Facade pattern delegating to focused submodules under src/services/)
 */
export class WorkbenchStorageService {
	// ================= Workspace Data RPC =================
	static fetchAllFromDb = fetchAllFromDb;
	static saveFolderToDb = saveFolderToDb;
	static deleteFolderFromDb = deleteFolderFromDb;
	static moveFolderInDb = moveFolderInDb;
	static reorderFoldersInDb = reorderFoldersInDb;
	static moveFolderToCategoryInDb = moveFolderToCategoryInDb;
	static applyAIClassificationToDb = applyAIClassificationToDb;
	static moveItemInDb = moveItemInDb;
	static deleteItemInDb = deleteItemInDb;
	static addBookmarksToDb = addBookmarksToDb;
	static addLinkToFolder = addLinkToFolderInDb;

	// ================= Search & Embeddings RPC =================
	static searchItems = (params: {
		query: string;
		mode?: SearchMode;
		embeddingConfig?: EmbeddingConfig;
		limit?: number;
		scope?: SearchScope;
	}): Promise<SearchResponse> => searchItems(params);

	static getEmbeddingStats = (): Promise<EmbeddingStats> => getEmbeddingStats();

	static batchProcessEmbeddings = (params: {
		config: EmbeddingConfig;
		batchSize?: number;
		forceAll?: boolean;
	}): Promise<{
		processed: number;
		remaining: number;
		stats: EmbeddingStats;
		error?: string;
	}> => batchProcessEmbeddings(params);

	// ================= RAG & Dossier RPC =================
	static chatWithBookmarks = (
		params: {
			question: string;
			history?: ChatMessage[];
			embeddingConfig?: EmbeddingConfig;
			llmConfig?: {
				apiKey?: string;
				baseUrl?: string;
				model?: string;
			};
			folderId?: number | null;
			folderName?: string;
		},
		options?: { signal?: AbortSignal },
	): Promise<RAGChatResult> => chatWithBookmarksRpc(params, options);

	static generateFolderDossier = (params: {
		folderId: number;
		llmConfig?: {
			apiKey?: string;
			baseUrl?: string;
			model?: string;
		};
	}): Promise<FolderDossierResult> => generateFolderDossierRpc(params);

	// ================= Settings Storage =================
	static getSettings = (): WorkbenchSettings => getSettings();
	static fetchSettingsFromDb = (): Promise<WorkbenchSettings> =>
		fetchSettingsFromDb();
	static saveSettings = (settings: WorkbenchSettings): void =>
		saveSettings(settings);

	// ================= Chat History & Sessions Storage =================
	static getChatHistory = <T = any>(): T[] => getChatHistory<T>();
	static saveChatHistory = <T = any>(history: T[]): void =>
		saveChatHistory<T>(history);
	static clearChatHistory = (): void => clearChatHistory();
	static clearAllChatData = (): void => clearAllChatData();
	static getChatSessions = <T = any>(): ChatSession<T>[] => getChatSessions<T>();
	static saveChatSessions = <T = any>(sessions: ChatSession<T>[]): void =>
		saveChatSessions<T>(sessions);
	static deleteChatSession = (sessionId: string): void =>
		deleteChatSession(sessionId);
	static clearChatSessions = (): void => clearChatSessions();

	// ================= Maintenance & Models RPC =================
	static clearAllDataInDb = (): Promise<{ backupPath: string | null }> =>
		clearAllDataInDb();
	static startDeadLinkScan = (): Promise<{ jobId: string; total: number }> =>
		startDeadLinkScan();
	static getDeadLinkScanStatus = (
		jobId: string,
	): Promise<DeadLinkScanJob | null> => getDeadLinkScanStatus(jobId);
	static getLastDeadLinkScan = (): Promise<DeadLinkScanJob | null> =>
		getLastDeadLinkScan();
	static deleteItemsBatchInDb = (
		ids: string[],
	): Promise<{
		deleted: number;
		folders: Folder[];
		unclassified: WorkbenchItem[];
	}> => deleteItemsBatchInDb(ids);
	static fetchAvailableModels = (params: {
		baseUrl: string;
		apiKey?: string;
	}): Promise<string[]> => fetchAvailableModels(params);
}
