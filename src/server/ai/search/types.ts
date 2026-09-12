export interface SearchResult {
	title: string;
	url: string;
	snippet: string;
	publishedDate?: string;
}

export interface SearchOptions {
	maxResults?: number;
}

export interface SearchProvider {
	name: string;
	search(query: string, options?: SearchOptions): Promise<SearchResult[]>;
}
