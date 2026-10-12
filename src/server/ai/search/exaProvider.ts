import type { SearchOptions, SearchProvider, SearchResult } from "./types.ts";

/**
 * Exa semantic search provider. Popular in agent tooling for
 * "find similar / find pages about X" style queries.
 */
export class ExaSearchProvider implements SearchProvider {
	name = "exa";
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

		const response = await fetch("https://api.exa.ai/search", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${this.apiKey}`,
			},
			body: JSON.stringify({
				query,
				numResults: maxResults,
				contents: {
					text: { maxCharacters: 500 },
				},
			}),
			signal: timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined,
		});

		if (!response.ok) {
			const errText = await response.text();
			throw new Error(`Exa search failed (${response.status}): ${errText}`);
		}

		const data = (await response.json()) as {
			results?: Array<{
				title?: string;
				url?: string;
				text?: string;
				publishedDate?: string;
				score?: number;
				favicon?: string;
			}>;
		};

		return (data.results || []).map((r) => ({
			title: r.title || "未知标题",
			url: r.url || "",
			snippet: (r.text || "").slice(0, 300),
			publishedDate: r.publishedDate,
			score: typeof r.score === "number" ? r.score : undefined,
			favicon: r.favicon,
			engine: "exa",
		}));
	}
}
