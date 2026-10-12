import type { SearchOptions, SearchProvider, SearchResult } from "./types.ts";

/**
 * Jina Search (s.jina.ai) — zero-config fallback engine.
 * Works without an API key (rate-limited); supplying JINA_API_KEY raises quota.
 */
export class JinaSearchProvider implements SearchProvider {
	name = "jina";
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
			Accept: "application/json",
		};
		if (this.apiKey) {
			headers.Authorization = `Bearer ${this.apiKey}`;
		}

		const response = await fetch(
			`https://s.jina.ai/${encodeURIComponent(query)}`,
			{
				headers,
				signal: timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined,
			},
		);

		if (!response.ok) {
			const errText = await response.text();
			throw new Error(`Jina search failed (${response.status}): ${errText}`);
		}

		const data = (await response.json()) as {
			data?: Array<{
				title?: string;
				url?: string;
				description?: string;
				content?: string;
				date?: string;
			}>;
		};

		const items = Array.isArray(data.data) ? data.data : [];
		return items.slice(0, maxResults).map((r) => ({
			title: r.title || "未知标题",
			url: r.url || "",
			snippet: (r.description || r.content || "").slice(0, 300),
			publishedDate: r.date,
			engine: "jina",
		}));
	}
}
