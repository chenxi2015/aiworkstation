import type { FetchProvider, FetchResult } from "./types.ts";

const DEFAULT_TIMEOUT_MS = 20_000;

/**
 * Tavily Extract — fallback content extractor, used only when TAVILY_API_KEY
 * is configured.
 */
export class TavilyExtractProvider implements FetchProvider {
	name = "tavily_extract";
	private apiKey: string;

	constructor(apiKey: string) {
		this.apiKey = apiKey;
	}

	async fetch(
		url: string,
		options?: { timeoutMs?: number },
	): Promise<FetchResult> {
		const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

		const response = await fetch("https://api.tavily.com/extract", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				api_key: this.apiKey,
				urls: [url],
			}),
			signal: AbortSignal.timeout(timeoutMs),
		});

		if (!response.ok) {
			const errText = await response.text();
			throw new Error(
				`Tavily Extract failed (${response.status}): ${errText.slice(0, 200)}`,
			);
		}

		const data = (await response.json()) as {
			results?: Array<{
				url?: string;
				raw_content?: string;
			}>;
			failed_results?: Array<{ url?: string; error?: string }>;
		};

		const first = data.results?.[0];
		const markdown = (first?.raw_content || "").trim();
		if (!markdown) {
			const failMsg = data.failed_results?.[0]?.error || "empty content";
			throw new Error(`Tavily Extract returned no content: ${failMsg}`);
		}

		return {
			url,
			finalUrl: first?.url || url,
			title: "",
			markdown,
			truncated: false,
			originalLength: markdown.length,
		};
	}
}
