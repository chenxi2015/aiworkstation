import type { SearchOptions, SearchProvider, SearchResult } from "./types.ts";

/**
 * DuckDuckGo Search Provider.
 * Works out-of-the-box without any API keys or configuration.
 * Uses DuckDuckGo Lite endpoint with fallback to DuckDuckGo Instant Answer API.
 */
export class DuckDuckGoSearchProvider implements SearchProvider {
	name = "duckduckgo";
	private timeoutMs?: number;

	constructor(options?: { timeoutMs?: number }) {
		this.timeoutMs = options?.timeoutMs;
	}

	async search(
		query: string,
		options?: SearchOptions,
	): Promise<SearchResult[]> {
		const maxResults = options?.maxResults ?? 5;
		const timeoutMs = options?.timeoutMs ?? this.timeoutMs;

		// 1. Try DuckDuckGo Lite web search
		try {
			const liteResults = await this.searchLite(query, maxResults, timeoutMs);
			if (liteResults.length > 0) {
				return liteResults;
			}
		} catch (err) {
			console.warn("[DuckDuckGo] Lite search failed, trying fallback:", err);
		}

		// 2. Fallback to DuckDuckGo Instant Answer JSON API
		return this.searchInstantAnswer(query, maxResults, timeoutMs);
	}

	private async searchLite(
		query: string,
		maxResults: number,
		timeoutMs?: number,
	): Promise<SearchResult[]> {
		const url = `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`;
		const response = await fetch(url, {
			headers: {
				"User-Agent":
					"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
				Accept:
					"text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
			},
			signal: timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined,
		});

		if (!response.ok) {
			throw new Error(`DuckDuckGo Lite returned status ${response.status}`);
		}

		const html = await response.text();
		const trMatches = html.match(/<tr[\s\S]*?<\/tr>/gi) || [];
		const results: SearchResult[] = [];
		let currentItem: SearchResult | null = null;

		for (const tr of trMatches) {
			if (tr.includes("result-sponsored")) continue;

			// Match link row
			const linkMatch =
				tr.match(
					/<a\s+[^>]*href=['"]([^'"]+)['"][^>]*class=['"]result-link['"][^>]*>([\s\S]*?)<\/a>/i,
				) ||
				tr.match(
					/<a\s+[^>]*class=['"]result-link['"][^>]*href=['"]([^'"]+)['"][^>]*>([\s\S]*?)<\/a>/i,
				);

			if (linkMatch) {
				let rawUrl = linkMatch[1];
				if (rawUrl.includes("duckduckgo.com/y.js")) continue;

				if (rawUrl.includes("uddg=")) {
					const uMatch = rawUrl.match(/uddg=([^&]+)/);
					if (uMatch) rawUrl = decodeURIComponent(uMatch[1]);
				}

				const title = linkMatch[2].replace(/<[^>]+>/g, "").trim();
				if (
					title &&
					!title.includes("more info") &&
					!title.includes("Next Page")
				) {
					currentItem = {
						title,
						url: rawUrl,
						snippet: "",
						engine: "duckduckgo",
					};
					results.push(currentItem);
					if (results.length >= maxResults) break;
				}
				continue;
			}

			// Match snippet row
			if (currentItem && tr.includes("result-snippet")) {
				const snipMatch = tr.match(
					/<td\s+[^>]*class=['"]result-snippet['"][^>]*>([\s\S]*?)<\/td>/i,
				);
				if (snipMatch) {
					currentItem.snippet = snipMatch[1].replace(/<[^>]+>/g, "").trim();
					currentItem = null;
				}
			}
		}

		return results;
	}

	private async searchInstantAnswer(
		query: string,
		maxResults: number,
		timeoutMs?: number,
	): Promise<SearchResult[]> {
		const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
		const response = await fetch(url, {
			signal: timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined,
		});

		if (!response.ok) {
			throw new Error(`DuckDuckGo API returned status ${response.status}`);
		}

		const data = (await response.json()) as {
			Heading?: string;
			AbstractText?: string;
			AbstractURL?: string;
			RelatedTopics?: Array<{
				FirstURL?: string;
				Text?: string;
				Topics?: Array<{ FirstURL?: string; Text?: string }>;
			}>;
		};

		const items: SearchResult[] = [];

		if (data.AbstractURL && data.AbstractText) {
			items.push({
				title: data.Heading || query,
				url: data.AbstractURL,
				snippet: data.AbstractText,
				engine: "duckduckgo",
			});
		}

		if (Array.isArray(data.RelatedTopics)) {
			for (const topic of data.RelatedTopics) {
				if (items.length >= maxResults) break;
				if (topic.FirstURL && topic.Text) {
					items.push({
						title: topic.Text.split(" - ")[0] || topic.Text.slice(0, 50),
						url: topic.FirstURL,
						snippet: topic.Text,
						engine: "duckduckgo",
					});
				} else if (Array.isArray(topic.Topics)) {
					for (const sub of topic.Topics) {
						if (items.length >= maxResults) break;
						if (sub.FirstURL && sub.Text) {
							items.push({
								title: sub.Text.split(" - ")[0] || sub.Text.slice(0, 50),
								url: sub.FirstURL,
								snippet: sub.Text,
								engine: "duckduckgo",
							});
						}
					}
				}
			}
		}

		return items.slice(0, maxResults);
	}
}
