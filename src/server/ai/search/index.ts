import { GeneralSearchProvider } from "./generalSearchProvider.ts";
import { TavilySearchProvider } from "./tavilyProvider.ts";
import type { SearchOptions, SearchProvider, SearchResult } from "./types.ts";

export * from "./types.ts";

/**
 * Composite search provider with automatic fallback
 */
class CompositeSearchProvider implements SearchProvider {
	name = "composite";
	private primary?: SearchProvider;
	private fallback: SearchProvider;

	constructor() {
		const tavilyKey = process.env.TAVILY_API_KEY?.trim();
		if (tavilyKey) {
			this.primary = new TavilySearchProvider(tavilyKey);
		}
		this.fallback = new GeneralSearchProvider();
	}

	async search(
		query: string,
		options?: SearchOptions,
	): Promise<SearchResult[]> {
		if (this.primary) {
			try {
				const results = await this.primary.search(query, options);
				if (results.length > 0) return results;
			} catch (err) {
				console.warn(
					`[SearchProvider] Primary provider (${this.primary.name}) failed, falling back to general:`,
					err,
				);
			}
		}
		return this.fallback.search(query, options);
	}
}

let instance: SearchProvider | null = null;

export function getSearchProvider(): SearchProvider {
	if (!instance) {
		instance = new CompositeSearchProvider();
	}
	return instance;
}
