import type { SearchOptions, SearchProvider, SearchResult } from "./types.ts";

/**
 * Tavily AI Search Provider (Specialized for LLMs)
 */
export class TavilySearchProvider implements SearchProvider {
	name = "tavily";
	private apiKey: string;
	private timeoutMs?: number;

	constructor(apiKey: string, options?: { timeoutMs?: number }) {
		this.apiKey = apiKey;
		this.timeoutMs = options?.timeoutMs;
	}

	async search(
		query: string,
		options?: SearchOptions,
	): Promise<SearchResult[]> {
		const maxResults = options?.maxResults ?? 5;
		const timeoutMs = options?.timeoutMs ?? this.timeoutMs;
		const response = await fetch("https://api.tavily.com/search", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				api_key: this.apiKey,
				query,
				max_results: maxResults,
				search_depth: "advanced",
				include_answer: false,
				include_images: false,
			}),
			signal: timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined,
		});

		if (!response.ok) {
			const errText = await response.text();
			throw new Error(`Tavily search failed (${response.status}): ${errText}`);
		}

		const data = (await response.json()) as {
			results?: Array<{
				title?: string;
				url?: string;
				content?: string;
				published_date?: string;
				score?: number;
			}>;
		};

		return (data.results || []).map((r) => ({
			title: r.title || "未知标题",
			url: r.url || "",
			snippet: r.content || "",
			publishedDate: r.published_date,
			score: typeof r.score === "number" ? r.score : undefined,
			engine: "tavily",
		}));
	}
}
