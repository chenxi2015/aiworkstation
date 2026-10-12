import type { FetchProvider, FetchResult } from "./types.ts";

const DEFAULT_TIMEOUT_MS = 20_000;

/**
 * Jina Reader (r.jina.ai) — zero-config URL-to-Markdown extractor.
 * Without an API key, requests are rate-limited but functional.
 */
export class JinaReaderProvider implements FetchProvider {
	name = "jina_reader";
	private apiKey?: string;

	constructor(apiKey?: string) {
		this.apiKey = apiKey;
	}

	async fetch(
		url: string,
		options?: { timeoutMs?: number },
	): Promise<FetchResult> {
		const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

		const headers: Record<string, string> = {
			Accept: "application/json",
		};
		if (this.apiKey) {
			headers.Authorization = `Bearer ${this.apiKey}`;
		}

		const response = await fetch(
			`https://r.jina.ai/${encodeURI(url)}`,
			{
				headers,
				signal: AbortSignal.timeout(timeoutMs),
			},
		);

		if (!response.ok) {
			const errText = await response.text();
			throw new Error(
				`Jina Reader failed (${response.status}): ${errText.slice(0, 200)}`,
			);
		}

		const data = (await response.json()) as {
			code?: number;
			data?: {
				title?: string;
				url?: string;
				content?: string;
			};
		};

		const inner = data.data;
		const markdown = (inner?.content || "").trim();
		if (!markdown) {
			throw new Error("Jina Reader returned empty content");
		}

		return {
			url,
			finalUrl: inner?.url || url,
			title: inner?.title || "",
			markdown,
			truncated: false,
			originalLength: markdown.length,
		};
	}
}
