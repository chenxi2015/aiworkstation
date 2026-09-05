import type {
	EmbeddingStats,
	SearchMode,
	SearchResponse,
	SearchScope,
} from "../../components/workbench/types";
import {
	batchGenerateEmbeddings,
	getEmbeddingCoverageStats,
	searchWorkbenchItems,
} from "../../server/functions/search";
import type { EmbeddingConfig } from "../embedding/client";

/**
 * Search bookmarks across SQLite using keyword, semantic, or hybrid ranking
 */
export async function searchItems(params: {
	query: string;
	mode?: SearchMode;
	embeddingConfig?: EmbeddingConfig;
	limit?: number;
	scope?: SearchScope;
}): Promise<SearchResponse> {
	try {
		return await searchWorkbenchItems({ data: params });
	} catch (err) {
		console.warn("[searchClient] searchWorkbenchItems error:", err);
		return {
			items: [],
			facets: { categories: [], folders: [], types: [] },
			total: 0,
		};
	}
}

/**
 * Fetch current embedding statistics
 */
export async function getEmbeddingStats(): Promise<EmbeddingStats> {
	try {
		return await getEmbeddingCoverageStats();
	} catch (err) {
		console.warn("[searchClient] getEmbeddingCoverageStats error:", err);
		return { total: 0, embedded: 0, percentage: 0 };
	}
}

/**
 * Process a batch of bookmarks to generate and store embeddings in SQLite
 */
export async function batchProcessEmbeddings(params: {
	config: EmbeddingConfig;
	batchSize?: number;
	forceAll?: boolean;
}): Promise<{
	processed: number;
	remaining: number;
	stats: EmbeddingStats;
	error?: string;
}> {
	return await batchGenerateEmbeddings({ data: params });
}
