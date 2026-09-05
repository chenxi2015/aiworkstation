import type {
	ItemType,
	SearchFacets,
	SearchMode,
	SearchResultItem,
	SearchScope,
} from "../../components/workbench/types";
import { cosineSimilarity } from "./vectorMath";

/**
 * Builds highlight HTML by wrapping query terms with <mark> tags
 */
export function buildHighlights(
	terms: string[],
	name?: string,
	summary?: string,
): { name?: string; summary?: string } | undefined {
	if (terms.length === 0) return undefined;

	const wrapMatches = (text: string): string | undefined => {
		if (!text) return undefined;
		// Escape HTML entities first for safety
		const escaped = text
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;");
		// Build regex from terms (escaped for regex safety)
		const safeTerms = terms.map((t) =>
			t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
		);
		const regex = new RegExp(`(${safeTerms.join("|")})`, "gi");
		const result = escaped.replace(regex, "<mark>$1</mark>");
		return result !== escaped ? result : undefined;
	};

	const nameHL = wrapMatches(name || "");
	const summaryHL = wrapMatches(summary || "");

	if (!nameHL && !summaryHL) return undefined;
	return { name: nameHL, summary: summaryHL };
}

/**
 * Fast text scoring based on term presence and field weights
 */
export function computeKeywordScore(
	query: string,
	item: {
		name: string;
		url?: string;
		description?: string;
		keywords?: string;
		summary?: string;
		tags?: string[];
		folderName?: string;
	},
): {
	score: number;
	reason?: string;
	highlights?: { name?: string; summary?: string };
} {
	const q = query.trim().toLowerCase();
	if (!q) return { score: 0 };

	const terms = q.split(/\s+/).filter(Boolean);
	let score = 0;
	const reasons: string[] = [];

	const nameLower = (item.name || "").toLowerCase();
	const descLower = (item.description || "").toLowerCase();
	const summaryLower = (item.summary || "").toLowerCase();
	const kwLower = (item.keywords || "").toLowerCase();
	const urlLower = (item.url || "").toLowerCase();
	const folderLower = (item.folderName || "").toLowerCase();
	const tagsLower = (item.tags || []).map((t) => t.toLowerCase());

	// 1. Exact title match
	if (nameLower === q) {
		score += 1.0;
		reasons.push("标题完全匹配");
	} else if (nameLower.includes(q)) {
		score += 0.8;
		reasons.push("标题包含关键词");
	}

	// 2. Term matches across fields
	for (const term of terms) {
		if (nameLower.includes(term) && !nameLower.includes(q)) {
			score += 0.4;
			reasons.push(`标题匹配「${term}」`);
		}
		if (tagsLower.some((t) => t.includes(term))) {
			score += 0.35;
			reasons.push(`标签匹配「${term}」`);
		}
		if (summaryLower.includes(term) || descLower.includes(term)) {
			score += 0.25;
		}
		if (kwLower.includes(term)) {
			score += 0.2;
		}
		if (folderLower.includes(term)) {
			score += 0.15;
			reasons.push(`文件夹匹配「${term}」`);
		}
		if (urlLower.includes(term)) {
			score += 0.1;
		}
	}

	// 3. Build highlights by wrapping matched terms with <mark>
	const highlights = buildHighlights(
		terms,
		item.name,
		item.summary || item.description,
	);

	// Normalize score to 0~1 range
	const normalized = Math.min(1, score);
	return {
		score: normalized,
		reason: reasons.length > 0 ? reasons.slice(0, 2).join(" · ") : undefined,
		highlights,
	};
}

/**
 * Computes facet distributions from ranked search result items
 */
export function computeFacets(items: SearchResultItem[]): SearchFacets {
	const catMap = new Map<string, number>();
	const folderMap = new Map<
		string,
		{ folderId: number | null; count: number }
	>();
	const typeMap = new Map<string, number>();

	for (const item of items) {
		const cat = item.category || "未分类";
		catMap.set(cat, (catMap.get(cat) || 0) + 1);

		const fn = item.folderName || "未分类";
		const existing = folderMap.get(fn);
		if (existing) {
			existing.count++;
		} else {
			folderMap.set(fn, { folderId: item.folderId ?? null, count: 1 });
		}

		const t = item.type || "link";
		typeMap.set(t, (typeMap.get(t) || 0) + 1);
	}

	const sortDesc = (a: { count: number }, b: { count: number }) =>
		b.count - a.count;

	return {
		categories: Array.from(catMap.entries())
			.map(([name, count]) => ({ name, count }))
			.sort(sortDesc),
		folders: Array.from(folderMap.entries())
			.map(([name, v]) => ({ name, folderId: v.folderId, count: v.count }))
			.sort(sortDesc),
		types: Array.from(typeMap.entries())
			.map(([name, count]) => ({ name, count }))
			.sort(sortDesc),
	};
}

export interface RankCandidateItem {
	id: string;
	name: string;
	url?: string;
	type: ItemType;
	description?: string;
	keywords?: string;
	summary?: string;
	tags?: string[];
	favicon?: string;
	folderId?: number | null;
	folderName?: string;
	category?: string;
	createdAt?: string;
	embedding?: number[] | null;
}

/**
 * Filter items by search scope
 */
function applyScopeFilter(
	items: RankCandidateItem[],
	scope?: SearchScope,
): RankCandidateItem[] {
	if (!scope || scope.type === "global") return items;

	return items.filter((item) => {
		if (scope.type === "category") {
			return item.category === scope.categoryName;
		}
		if (scope.type === "folder") {
			if (scope.folderIds && scope.folderIds.length > 0) {
				return item.folderId != null && scope.folderIds.includes(item.folderId);
			}
			return item.folderId === scope.folderId;
		}
		return true;
	});
}

/**
 * Performs hybrid or semantic ranking over a collection of candidate search items
 */
export function rankItems(
	items: RankCandidateItem[],
	query: string,
	queryVector: number[] | null,
	mode: SearchMode = "hybrid",
	scope?: SearchScope,
): SearchResultItem[] {
	const q = query.trim();
	if (!q && !queryVector) return [];

	const filtered = applyScopeFilter(items, scope);
	const results: SearchResultItem[] = [];

	for (const item of filtered) {
		const {
			score: kwScore,
			reason: kwReason,
			highlights,
		} = computeKeywordScore(q, item);

		let semScore = 0;
		if (queryVector && item.embedding && item.embedding.length > 0) {
			semScore = cosineSimilarity(queryVector, item.embedding);
		}

		let finalScore = 0;
		let matchType: "semantic" | "keyword" | "hybrid" = "keyword";
		let matchReason: string | undefined;

		if (mode === "semantic") {
			if (queryVector && semScore > 0) {
				finalScore = semScore;
				matchType = "semantic";
				matchReason = `语义相似度 ${Math.round(semScore * 100)}%`;
			} else {
				finalScore = kwScore;
				matchType = "keyword";
				matchReason = kwReason;
			}
		} else if (mode === "keyword") {
			finalScore = kwScore;
			matchType = "keyword";
			matchReason = kwReason;
		} else {
			// Hybrid mode: 60% semantic + 40% keyword
			if (queryVector && item.embedding && item.embedding.length > 0) {
				finalScore = semScore * 0.6 + kwScore * 0.4;
				if (semScore > 0.4 && kwScore > 0) {
					matchType = "hybrid";
					matchReason = `${Math.round(semScore * 100)}% 语义 + 关键词命中`;
				} else if (semScore > 0.35) {
					matchType = "semantic";
					matchReason = `语义相似度 ${Math.round(semScore * 100)}%`;
				} else {
					matchType = "keyword";
					matchReason = kwReason;
				}
			} else {
				finalScore = kwScore;
				matchType = "keyword";
				matchReason = kwReason;
			}
		}

		const threshold = mode === "semantic" ? 0.3 : 0.05;
		if (finalScore >= threshold) {
			results.push({
				id: item.id,
				name: item.name,
				url: item.url,
				type: item.type,
				description: item.description,
				keywords: item.keywords,
				summary: item.summary,
				tags: item.tags,
				favicon: item.favicon,
				folderId: item.folderId,
				folderName: item.folderName,
				category: item.category,
				createdAt: item.createdAt,
				score: finalScore,
				highlights,
				similarityPercent:
					semScore > 0 ? Math.round(semScore * 100) : undefined,
				matchType,
				matchReason,
			});
		}
	}

	return results.sort((a, b) => b.score - a.score);
}
