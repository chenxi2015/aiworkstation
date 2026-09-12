import type { SearchOptions, SearchProvider, SearchResult } from "./types.ts";

/**
 * Tavily AI Search Provider (Specialized for LLMs)
 */
export class TavilySearchProvider implements SearchProvider {
	name = "tavily";
	private apiKey: string;

	constructor(apiKey: string) {
		this.apiKey = apiKey;
	}

	async search(
		query: string,
		options?: SearchOptions,
	): Promise<SearchResult[]> {
		const maxResults = options?.maxResults ?? 5;
		const response = await fetch("https://api.tavily.com/search", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				api_key: this.apiKey,
				query,
				max_results: maxResults,
				search_depth: "basic",
				include_answer: false,
			}),
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
			}>;
		};

		return (data.results || []).map((r) => ({
			title: r.title || "未知标题",
			url: r.url || "",
			snippet: r.content || "",
			publishedDate: r.published_date,
		}));
	}
}
