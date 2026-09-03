import type {
	ItemType,
	SearchMode,
	SearchResultItem,
	SearchFacets,
	SearchScope,
} from "../components/workbench/types";

export const DEFAULT_EMBEDDING_BASE_URL =
	(typeof import.meta !== "undefined" &&
		import.meta.env?.VITE_EMBEDDING_BASE_URL) ||
	(typeof process !== "undefined" ? process.env?.EMBEDDING_BASE_URL : "") ||
	"https://api.siliconflow.cn/v1";

export const DEFAULT_EMBEDDING_MODEL =
	(typeof import.meta !== "undefined" &&
		import.meta.env?.VITE_EMBEDDING_MODEL) ||
	(typeof process !== "undefined" ? process.env?.EMBEDDING_MODEL : "") ||
	"BAAI/bge-m3";

export interface EmbeddingConfig {
	apiKey?: string;
	baseUrl?: string;
	model?: string;
}

/**
 * Service for computing embeddings, vector similarities, and hybrid search ranking
 */
export class EmbeddingService {
	/**
	 * Build rich semantic indexing text from a bookmark item
	 */
	static createIndexingText(item: {
		title: string;
		url?: string;
		description?: string;
		keywords?: string;
		summary?: string;
		tags?: string | string[];
		parent_title?: string;
	}): string {
		const parts: string[] = [];
		if (item.title) parts.push(`标题: ${item.title}`);
		if (item.summary && item.summary !== item.title)
			parts.push(`摘要: ${item.summary}`);
		if (item.description) parts.push(`描述: ${item.description}`);
		if (item.keywords) parts.push(`关键词: ${item.keywords}`);
		if (item.parent_title) parts.push(`分类: ${item.parent_title}`);

		let tagList: string[] = [];
		if (Array.isArray(item.tags)) {
			tagList = item.tags;
		} else if (typeof item.tags === "string" && item.tags.trim()) {
			try {
				tagList = JSON.parse(item.tags);
			} catch {
				tagList = item.tags.split(",").map((s) => s.trim());
			}
		}
		if (tagList.length > 0) parts.push(`标签: ${tagList.join(", ")}`);

		return parts.join("\n");
	}

	/**
	 * Compute embeddings for a batch of text strings via OpenAI-compatible endpoint
	 */
	static async generateBatchEmbeddings(
		texts: string[],
		config: EmbeddingConfig,
		signal?: AbortSignal,
	): Promise<number[][]> {
		if (texts.length === 0) return [];

		const baseUrl = (config.baseUrl || DEFAULT_EMBEDDING_BASE_URL).replace(
			/\/+$/,
			"",
		);
		const apiKey = config.apiKey || "";
		const model = config.model || DEFAULT_EMBEDDING_MODEL;

		const res = await fetch(`${baseUrl}/embeddings`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${apiKey}`,
			},
			body: JSON.stringify({
				model,
				input: texts,
			}),
			signal,
		});

		if (!res.ok) {
			const errText = await res.text();
			let parsedMsg = errText;
			try {
				const errJson = JSON.parse(errText);
				parsedMsg = errJson.message || errJson.error?.message || errText;
			} catch {
				// Keep raw text if not JSON
			}

			if (res.status === 401) {
				throw new Error(
					`Embedding API 鉴权失败 (401 Unauthorized): ${parsedMsg}。请检查「设置」中的 Embedding API Key 是否有效。`,
				);
			}
			if (res.status === 404) {
				throw new Error(
					`Embedding API 接口不存在 (404 Not Found): ${parsedMsg}。请检查 Base URL 与模型名称是否正确。`,
				);
			}

			throw new Error(
				`Embedding API 错误 (${res.status} ${res.statusText}): ${parsedMsg}`,
			);
		}

		const data = await res.json();
		if (!data.data || !Array.isArray(data.data)) {
			throw new Error("Embedding API 返回格式异常，缺少 data 向量数组");
		}

		// Sort returned embeddings by index if present
		const sorted = [...data.data].sort(
			(a, b) => (a.index ?? 0) - (b.index ?? 0),
		);
		return sorted.map((item) => item.embedding as number[]);
	}

	/**
	 * Compute single embedding for a query string
	 */
	static async generateQueryEmbedding(
		query: string,
		config: EmbeddingConfig,
		signal?: AbortSignal,
	): Promise<number[] | null> {
		try {
			const [vec] = await this.generateBatchEmbeddings([query], config, signal);
			return vec || null;
		} catch (err) {
			console.warn(
				"[EmbeddingService] Failed to generate query embedding:",
				err,
			);
			return null;
		}
	}

	/**
	 * Calculate cosine similarity between two float vectors
	 */
	static cosineSimilarity(vecA: number[], vecB: number[]): number {
		if (!vecA || !vecB || vecA.length !== vecB.length || vecA.length === 0) {
			return 0;
		}

		let dotProduct = 0;
		let normA = 0;
		let normB = 0;

		for (let i = 0; i < vecA.length; i++) {
			const a = vecA[i];
			const b = vecB[i];
			dotProduct += a * b;
			normA += a * a;
			normB += b * b;
		}

		if (normA === 0 || normB === 0) return 0;
		const sim = dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
		// Clamp between 0 and 1
		return Math.max(0, Math.min(1, sim));
	}

	/**
	 * Fast text scoring based on term presence and field weights
	 */
	static computeKeywordScore(
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
	): { score: number; reason?: string; highlights?: { name?: string; summary?: string } } {
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
		const highlights = this.buildHighlights(terms, item.name, item.summary || item.description);

		// Normalize score to 0~1 range
		const normalized = Math.min(1, score);
		return {
			score: normalized,
			reason: reasons.length > 0 ? reasons.slice(0, 2).join(" · ") : undefined,
			highlights,
		};
	}

	/**
	 * Build highlight HTML by wrapping query terms with <mark> tags
	 */
	private static buildHighlights(
		terms: string[],
		name?: string,
		summary?: string,
	): { name?: string; summary?: string } | undefined {
		if (terms.length === 0) return undefined;

		const wrapMatches = (text: string): string | undefined => {
			if (!text) return undefined;
			// Escape HTML entities first for safety
			const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
			// Build regex from terms (escaped for regex safety)
			const safeTerms = terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
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
	 * Compute facet distributions from ranked search result items
	 */
	static computeFacets(items: SearchResultItem[]): SearchFacets {
		const catMap = new Map<string, number>();
		const folderMap = new Map<string, { folderId: number | null; count: number }>();
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

		const sortDesc = (a: { count: number }, b: { count: number }) => b.count - a.count;

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

	/**
	 * Perform hybrid or semantic ranking over a collection of search items
	 */
	static rankItems(
		items: Array<{
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
		}>,
		query: string,
		queryVector: number[] | null,
		mode: SearchMode = "hybrid",
		scope?: SearchScope,
	): SearchResultItem[] {
		const q = query.trim();
		if (!q && !queryVector) return [];

		// Apply scope filter before ranking
		let filtered = items;
		if (scope && scope.type !== "global") {
			filtered = items.filter((item) => {
				if (scope.type === "category") {
					return item.category === scope.categoryName;
				}
				if (scope.type === "folder") {
					return item.folderId === scope.folderId;
				}
				return true;
			});
		}

		const results: SearchResultItem[] = [];

		for (const item of filtered) {
			const { score: kwScore, reason: kwReason, highlights } = this.computeKeywordScore(
				q,
				item,
			);

			let semScore = 0;
			if (queryVector && item.embedding && item.embedding.length > 0) {
				semScore = this.cosineSimilarity(queryVector, item.embedding);
			}

			let finalScore = 0;
			let matchType: "semantic" | "keyword" | "hybrid" = "keyword";
			let matchReason: string | undefined;

			if (mode === "semantic") {
				// Pure semantic mode (or fallback to keyword if no vector)
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
				// Pure keyword mode
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

			// Filter out irrelevant items
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

		// Sort by score descending
		return results.sort((a, b) => b.score - a.score);
	}
}
