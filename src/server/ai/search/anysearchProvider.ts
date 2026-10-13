import type { SearchOptions, SearchProvider, SearchResult } from "./types.ts";

/**
 * AnySearch search provider.
 * Supports anonymous queries with IP rate limiting or authenticated queries with API key.
 */
export class AnySearchProvider implements SearchProvider {
	name = "anysearch";
	private apiKey?: string;
	private timeoutMs?: number;

	constructor(apiKey?: string, options?: { timeoutMs?: number }) {
		this.apiKey = apiKey;
		this.timeoutMs = options?.timeoutMs;
	}

	async search(
		query: string,
		options?: SearchOptions,
	): Promise<SearchResult[]> {
		const maxResults = options?.maxResults ?? 5;
		const timeoutMs = options?.timeoutMs ?? this.timeoutMs;

		const headers: Record<string, string> = {
			"Content-Type": "application/json",
		};
		if (this.apiKey) {
			headers.Authorization = `Bearer ${this.apiKey}`;
		}

		const response = await fetch("https://api.anysearch.com/v1/search", {
			method: "POST",
			headers,
			body: JSON.stringify({
				query,
				max_results: maxResults,
			}),
			signal: timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined,
		});

		if (!response.ok) {
			const errText = await response.text();
			throw new Error(
				`AnySearch search failed (${response.status}): ${errText}`,
			);
		}

		const data = (await response.json()) as {
			code?: number;
			message?: string;
			data?: {
				results?: Array<{
					title?: string;
					url?: string;
					description?: string;
					published_date?: string;
				}>;
			};
		};

		if (typeof data.code === "number" && data.code !== 0) {
			throw new Error(
				`AnySearch search failed: ${data.message || `code ${data.code}`}`,
			);
		}

		const results = data.data?.results || [];
		return results.slice(0, maxResults).map((r) => ({
			title: r.title || "未知标题",
			url: r.url || "",
			snippet: r.description || "",
			publishedDate: r.published_date,
			engine: "anysearch",
		}));
	}
}
