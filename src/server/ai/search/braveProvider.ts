import type { SearchOptions, SearchProvider, SearchResult } from "./types.ts";

/**
 * Brave Search API provider. Independent index, friendly free tier.
 */
export class BraveSearchProvider implements SearchProvider {
	name = "brave";
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

		const url = new URL("https://api.search.brave.com/res/v1/web/search");
		url.searchParams.set("q", query);
		url.searchParams.set("count", String(maxResults));
		url.searchParams.set("text_decorations", "false");

		const response = await fetch(url.toString(), {
			headers: {
				Accept: "application/json",
				"X-Subscription-Token": this.apiKey,
			},
			signal: timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined,
		});

		if (!response.ok) {
			const errText = await response.text();
			throw new Error(`Brave search failed (${response.status}): ${errText}`);
		}

		const data = (await response.json()) as {
			web?: {
				results?: Array<{
					title?: string;
					url?: string;
					description?: string;
					page_age?: string;
					meta_url?: { favicon?: string };
				}>;
			};
		};

		return (data.web?.results || []).map((r) => ({
			title: r.title || "未知标题",
			url: r.url || "",
			snippet: r.description || "",
			publishedDate: r.page_age,
			favicon: r.meta_url?.favicon,
			engine: "brave",
		}));
	}
}
