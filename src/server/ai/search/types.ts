export interface SearchResult {
	title: string;
	url: string;
	snippet: string;
	publishedDate?: string;
	/** Relevance score normalized to 0-1 by the originating engine */
	score?: number;
	/** Favicon URL for the result's origin */
	favicon?: string;
	/** Optional relevant image URLs extracted for this result */
	images?: string[];
	/** Engine that produced this result (e.g. "tavily" | "exa" | "brave" | "jina") */
	engine?: string;
}

export interface SearchOptions {
	maxResults?: number;
	/** Per-engine timeout in milliseconds */
	timeoutMs?: number;
}

export interface SearchProvider {
	name: string;
	search(query: string, options?: SearchOptions): Promise<SearchResult[]>;
}
