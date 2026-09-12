import type { SearchOptions, SearchProvider, SearchResult } from "./types.ts";

/**
 * General Web Search Provider using direct search endpoints (Zero API key required)
 */
export class GeneralSearchProvider implements SearchProvider {
	name = "general";

	async search(
		query: string,
		options?: SearchOptions,
	): Promise<SearchResult[]> {
		const maxResults = options?.maxResults ?? 5;
		const searchUrl = `https://www.baidu.com/s?wd=${encodeURIComponent(query)}&rn=${Math.max(maxResults * 2, 10)}`;

		const response = await fetch(searchUrl, {
			headers: {
				"User-Agent":
					"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
				"Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
			},
			signal: AbortSignal.timeout(8000),
		});

		if (!response.ok) {
			throw new Error(`Search request failed with status ${response.status}`);
		}

		const html = await response.text();
		const results: SearchResult[] = [];

		// Split by search result container class
		const parts = html.split(/class="[^"]*result c-container[^"]*"/);

		for (let i = 1; i < parts.length && results.length < maxResults; i++) {
			const chunk = parts[i];
			const muMatch = chunk.match(/mu="([^"]+)"/);
			const titleMatch =
				chunk.match(/<h3[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i) ||
				chunk.match(/class="[^"]*title[^"]*"[^>]*>([\s\S]*?)<\//i);

			if (titleMatch) {
				const title = titleMatch[1]
					.replace(/<[^>]+>/g, "")
					.replace(/\s+/g, " ")
					.trim();

				let url = muMatch ? muMatch[1] : "";
				if (!url) {
					const hrefMatch = chunk.match(/href="([^"]+)"/);
					if (hrefMatch?.[1]?.startsWith("http")) {
						url = hrefMatch[1];
					}
				}

				// Extract readable text for snippet
				const textCleaned = chunk
					.slice(0, 1500)
					.replace(/<style[\s\S]*?<\/style>/gi, "")
					.replace(/<script[\s\S]*?<\/script>/gi, "")
					.replace(/<[^>]+>/g, " ")
					.replace(/\s+/g, " ")
					.trim();

				const snippet = textCleaned.replace(title, "").slice(0, 200).trim();

				if (title && url) {
					results.push({
						title,
						url,
						snippet: snippet || title,
					});
				}
			}
		}

		return results;
	}
}
