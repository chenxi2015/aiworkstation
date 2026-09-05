import type {
	SearchFacets,
	SearchMode,
	SearchResultItem,
	SearchScope,
} from "../components/workbench/types";
import {
	DEFAULT_EMBEDDING_BASE_URL,
	DEFAULT_EMBEDDING_MODEL,
	type EmbeddingConfig,
	generateBatchEmbeddings,
	generateQueryEmbedding,
} from "./embedding/client";
import {
	computeFacets,
	computeKeywordScore,
	type RankCandidateItem,
	rankItems,
} from "./embedding/ranker";
import { createIndexingText } from "./embedding/textIndexer";
import { cosineSimilarity } from "./embedding/vectorMath";

export { DEFAULT_EMBEDDING_BASE_URL, DEFAULT_EMBEDDING_MODEL };
export type { EmbeddingConfig };

/**
 * Service for computing embeddings, vector similarities, and hybrid search ranking
 * (Facade delegating to focused submodules under src/services/embedding/)
 */
export class EmbeddingService {
	/**
	 * Build rich semantic indexing text from a bookmark item
	 */
	static createIndexingText = createIndexingText;

	/**
	 * Compute embeddings for a batch of text strings via OpenAI-compatible endpoint
	 */
	static generateBatchEmbeddings = generateBatchEmbeddings;

	/**
	 * Compute single embedding for a query string
	 */
	static generateQueryEmbedding = generateQueryEmbedding;

	/**
	 * Calculate cosine similarity between two float vectors
	 */
	static cosineSimilarity = cosineSimilarity;

	/**
	 * Fast text scoring based on term presence and field weights
	 */
	static computeKeywordScore = computeKeywordScore;

	/**
	 * Compute facet distributions from ranked search result items
	 */
	static computeFacets = (items: SearchResultItem[]): SearchFacets =>
		computeFacets(items);

	/**
	 * Perform hybrid or semantic ranking over a collection of search items
	 */
	static rankItems = (
		items: RankCandidateItem[],
		query: string,
		queryVector: number[] | null,
		mode: SearchMode = "hybrid",
		scope?: SearchScope,
	): SearchResultItem[] => rankItems(items, query, queryVector, mode, scope);
}
