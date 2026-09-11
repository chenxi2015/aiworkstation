import type { SearchResultItem } from "../../../components/workbench/types.ts";
import type { RankCandidateItem } from "../../../services/embedding/ranker.ts";
import {
	type EmbeddingConfig,
	EmbeddingService,
} from "../../../services/embeddingService.ts";
import type { ChatContextItem } from "../../../types/chatContext.ts";
import { workbenchDb } from "../../db/sqlite.ts";
import type { SearchBookmarkItem } from "../../db/types.ts";
import { resolveEmbeddingConfig } from "./config.ts";

export interface BookmarkRetrievalResult {
	contextReferences: SearchResultItem[];
	contextSnippets: string;
	candidateCount: number;
	/** When non-null, the caller should return this as an empty-fallback message */
	emptyFallbackMessage: string | null;
}

export type { SearchBookmarkItem };

/** Filter candidates based on folder context or explicit folderId scope */
function applyScopeFilter(
	all: SearchBookmarkItem[],
	contextItems: ChatContextItem[],
	folderId: number | null | undefined,
): { filtered: SearchBookmarkItem[]; contextFolderNames: string[] } {
	const contextFolderIds = contextItems
		.filter((item) => item.type === "folder" && item.folderId != null)
		.map((item) => item.folderId as number);

	const contextFolderNames = contextItems
		.filter((item) => item.type === "folder")
		.map((item) => item.title);

	let filtered: SearchBookmarkItem[] = all;
	if (contextFolderIds.length > 0) {
		const idSet = new Set(contextFolderIds);
		filtered = all.filter(
			(item) => item.folderId != null && idSet.has(item.folderId),
		);
	} else if (folderId != null) {
		filtered = all.filter((item) => item.folderId === folderId);
	}

	return { filtered, contextFolderNames };
}

/** Format a single bookmark item into a readable snippet string */
function formatSnippet(item: SearchBookmarkItem, index: number): string {
	const tags =
		item.tags && item.tags.length > 0 ? ` [标签: ${item.tags.join(", ")}]` : "";
	const folder = item.folderName ? ` [所属文件夹: ${item.folderName}]` : "";
	const desc = item.summary || item.description || "无详细描述";
	return `【参考来源 ${index + 1}】《${item.name}》\n- 网址: ${item.url || "无"}\n- 描述/摘要: ${desc}${tags}${folder}`;
}

/**
 * Core RAG retrieval: fetch candidates, apply scope filter, compute embeddings,
 * run hybrid ranking, and return the top-K context references with formatted snippets.
 */
export async function retrieveBookmarkContext(params: {
	question: string;
	folderId?: number | null;
	folderName?: string;
	embeddingConfig?: EmbeddingConfig;
	contextItems?: ChatContextItem[];
	module?: string;
	activeDocumentId?: number;
}): Promise<BookmarkRetrievalResult> {
	const {
		question,
		folderId,
		folderName,
		embeddingConfig = {},
		contextItems = [],
		module,
		activeDocumentId,
	} = params;

	const q = question?.trim();
	const allCandidates = workbenchDb.getAllBookmarksForSearch();
	const { filtered: candidateItems, contextFolderNames } = applyScopeFilter(
		allCandidates,
		contextItems,
		folderId,
	);
	// RankCandidateItem is a structural subset of SearchBookmarkItem, safe to cast
	const rankable = candidateItems as unknown as RankCandidateItem[];

	// Allow empty bookmark sets when in editor mode (document context will supply context)
	if (candidateItems.length === 0 && module !== "editor" && !activeDocumentId) {
		const scopeLabel =
			contextFolderNames.length > 0
				? `所选上下文文件夹「${contextFolderNames.join("、")}」`
				: folderName != null
					? `当前文件夹「${folderName}」`
					: null;
		return {
			contextReferences: [],
			contextSnippets: "",
			candidateCount: 0,
			emptyFallbackMessage: scopeLabel
				? `${scopeLabel}中暂无书签数据。`
				: "你的收藏库中目前还没有书签数据，请先通过 Chrome 扩展同步或导入一些书签。",
		};
	}

	// Compute embedding vector if an API key is available
	const effectiveEmbeddingConfig = resolveEmbeddingConfig(embeddingConfig);
	let queryVector: number[] | null = null;
	if (effectiveEmbeddingConfig.apiKey && candidateItems.length > 0) {
		queryVector = await EmbeddingService.generateQueryEmbedding(
			q,
			effectiveEmbeddingConfig,
		);
	}

	// Hybrid ranking and top-K slice
	const ranked = EmbeddingService.rankItems(rankable, q, queryVector, "hybrid");
	const contextReferences = ranked.slice(0, 6);

	// Map back to SearchBookmarkItem for snippet formatting (ranked items are a subset)
	const contextSnippets =
		candidateItems.length > 0
			? contextReferences
					.map((r) => {
						const orig =
							candidateItems.find((c) => c.id === r.id) ??
							(r as unknown as SearchBookmarkItem);
						return formatSnippet(orig, contextReferences.indexOf(r));
					})
					.join("\n\n")
			: "（未在本地库中检索到高相关性的书签）";

	return {
		contextReferences,
		contextSnippets,
		candidateCount: candidateItems.length,
		emptyFallbackMessage: null,
	};
}
