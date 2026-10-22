import { readSearchConfig } from "../configLoader.ts";
import { listChannelConfigs } from "../../context/channels.ts";
import { JinaReaderProvider } from "./jinaReader.ts";
import { TavilyExtractProvider } from "./tavilyExtract.ts";
import type { FetchProvider, FetchResult } from "./types.ts";
import type { SearchConfig } from "../registry.ts";

export const DEFAULT_FETCH_TRUNCATE_LENGTH = 8_000;

interface FetchAttempt {
	channel: string;
	ms: number;
	status: "success" | "failed";
	error?: string;
	contentLength?: number;
}

function buildChannels(cfg?: SearchConfig): FetchProvider[] {
	const channels: FetchProvider[] = [];
	// Key 事实源为 ai_channel_configs（web_search 能力的 custom 行），无 env 兜底
	const channelKeys = new Map<string, string>();
	try {
		for (const row of listChannelConfigs("web_search")) {
			if (row.channel === "custom" && row.apiKey.trim()) {
				channelKeys.set(row.provider, row.apiKey.trim());
			}
		}
	} catch {
		// 表未就绪时按无 key 处理
	}
	const jinaKey =
		channelKeys.get("jina") || cfg?.apiKeys?.jina?.trim() || undefined;
	channels.push(new JinaReaderProvider(jinaKey));
	const tavilyKey = channelKeys.get("tavily") || cfg?.apiKeys?.tavily?.trim();
	if (tavilyKey) {
		channels.push(new TavilyExtractProvider(tavilyKey));
	}
	return channels;
}

function truncate(result: FetchResult, limit: number): FetchResult {
	if (result.markdown.length <= limit) {
		return { ...result, truncated: false, originalLength: result.markdown.length };
	}
	return {
		...result,
		markdown: result.markdown.slice(0, limit),
		truncated: true,
		originalLength: result.markdown.length,
	};
}

/**
 * Cascading fetch orchestrator: Jina Reader first, then Tavily Extract.
 * Truncates long Markdown bodies and logs every attempt as structured JSON.
 */
export class FetchOrchestrator {
	private channelsFactory: () => FetchProvider[];
	private truncateLength: number;

	constructor(options?: {
		channels?: FetchProvider[];
		truncateLength?: number;
		loadConfig?: () => SearchConfig | undefined;
	}) {
		if (options?.channels) {
			const fixed = options.channels;
			this.channelsFactory = () => fixed;
		} else {
			const loadConfig = options?.loadConfig;
			this.channelsFactory = () => buildChannels(loadConfig?.());
		}
		this.truncateLength =
			options?.truncateLength ?? DEFAULT_FETCH_TRUNCATE_LENGTH;
	}

	async fetch(
		url: string,
		options?: { timeoutMs?: number },
	): Promise<FetchResult> {
		const startedAt = Date.now();
		const attempts: FetchAttempt[] = [];
		let lastError: Error | null = null;
		const channels = this.channelsFactory();

		for (const channel of channels) {
			const t0 = Date.now();
			try {
				const result = await channel.fetch(url, options);
				const ms = Date.now() - t0;
				attempts.push({
					channel: channel.name,
					ms,
					status: "success",
					contentLength: result.markdown.length,
				});
				const truncated = truncate(result, this.truncateLength);
				this.log(url, attempts, Date.now() - startedAt);
				return truncated;
			} catch (err) {
				const ms = Date.now() - t0;
				const message = err instanceof Error ? err.message : String(err);
				attempts.push({
					channel: channel.name,
					ms,
					status: "failed",
					error: message,
				});
				lastError = err instanceof Error ? err : new Error(message);
			}
		}

		this.log(url, attempts, Date.now() - startedAt);
		throw new Error(
			`All fetch channels failed for ${url}. Last error: ${lastError?.message || "unknown"}`,
		);
	}

	private log(url: string, attempts: FetchAttempt[], totalMs: number): void {
		try {
			console.log(
				`[FetchOrchestrator] ${JSON.stringify({ url, attempts, totalMs })}`,
			);
		} catch {
			// Logging must never break fetch.
		}
	}
}

let instance: FetchOrchestrator | null = null;

export function getFetchOrchestrator(): FetchOrchestrator {
	if (!instance) {
		instance = new FetchOrchestrator({ loadConfig: readSearchConfig });
	}
	return instance;
}
