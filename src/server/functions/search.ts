import { createServerFn } from "@tanstack/react-start";
import type {
	EmbeddingStats,
	SearchMode,
	SearchResultItem,
} from "../../components/workbench/types";
import {
	type EmbeddingConfig,
	EmbeddingService,
} from "../../services/embeddingService";
import { workbenchDb } from "../db/sqlite.ts";

/**
 * Server Function: Global search over bookmarks with keyword, semantic, or hybrid ranking
 */
export const searchWorkbenchItems = createServerFn({ method: "POST" })
	.validator(
		(data: {
			query: string;
			mode?: SearchMode;
			embeddingConfig?: EmbeddingConfig;
			limit?: number;
		}) => data,
	)
	.handler(async ({ data }): Promise<SearchResultItem[]> => {
		const { query, mode = "hybrid", embeddingConfig = {}, limit = 50 } = data;

		const q = query?.trim() || "";
		if (!q) return [];

		// Retrieve all candidate bookmarks from SQLite
		const candidateItems = workbenchDb.getAllBookmarksForSearch();

		// If in semantic/hybrid mode, try to generate query embedding vector
		let queryVector: number[] | null = null;
		if (mode !== "keyword" && embeddingConfig.apiKey) {
			queryVector = await EmbeddingService.generateQueryEmbedding(
				q,
				embeddingConfig,
			);
		}

		// Rank items
		const ranked = EmbeddingService.rankItems(
			candidateItems,
			q,
			queryVector,
			mode,
		);

		return ranked.slice(0, limit);
	});

/**
 * Server Function: Get current vector embedding coverage statistics
 */
export const getEmbeddingCoverageStats = createServerFn({
	method: "GET",
}).handler(async (): Promise<EmbeddingStats> => {
	return workbenchDb.getEmbeddingStats();
});

/**
 * Server Function: Process a batch of bookmarks to compute and save vector embeddings
 */
export const batchGenerateEmbeddings = createServerFn({ method: "POST" })
	.validator(
		(data: {
			config: EmbeddingConfig;
			batchSize?: number;
			forceAll?: boolean;
		}) => data,
	)
	.handler(
		async ({
			data,
		}): Promise<{
			processed: number;
			remaining: number;
			stats: EmbeddingStats;
		}> => {
			const { config, batchSize = 20, forceAll = false } = data;

			if (!config.apiKey) {
				throw new Error(
					"Embedding API Key is required to generate vector embeddings",
				);
			}

			const bookmarks = workbenchDb.getBookmarksNeedingEmbedding(
				batchSize,
				forceAll,
			);

			if (bookmarks.length === 0) {
				const stats = workbenchDb.getEmbeddingStats();
				return { processed: 0, remaining: 0, stats };
			}

			// Prepare texts for embedding
			const itemsWithText = bookmarks.map((b) => ({
				id: b.id,
				text: EmbeddingService.createIndexingText(b),
			}));

			const texts = itemsWithText.map((i) => i.text);

			// Call embedding API
			const vectors = await EmbeddingService.generateBatchEmbeddings(
				texts,
				config,
			);

			// Save to SQLite
			for (let i = 0; i < itemsWithText.length; i++) {
				const item = itemsWithText[i];
				const vec = vectors[i];
				if (item && vec) {
					workbenchDb.updateBookmarkEmbedding(item.id, vec, item.text);
				}
			}

			const stats = workbenchDb.getEmbeddingStats();
			const remaining = stats.total - stats.embedded;

			return {
				processed: itemsWithText.length,
				remaining: Math.max(0, remaining),
				stats,
			};
		},
	);
