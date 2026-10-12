export interface FetchResult {
	/** Original URL requested */
	url: string;
	/** Final URL after redirects */
	finalUrl: string;
	/** Page title, empty string when unknown */
	title: string;
	/** Clean Markdown body */
	markdown: string;
	/** True when markdown was truncated to fit the limit */
	truncated: boolean;
	/** Length of the untruncated markdown */
	originalLength: number;
}

export interface FetchProvider {
	name: string;
	/** Fetch a URL and convert to clean Markdown. Throws on failure. */
	fetch(url: string, options?: { timeoutMs?: number }): Promise<FetchResult>;
}
