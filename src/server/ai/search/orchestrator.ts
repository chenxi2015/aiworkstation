import { AnySearchProvider } from "./anysearchProvider.ts";
import { BraveSearchProvider } from "./braveProvider.ts";
import { getActiveChannel, listChannelConfigs } from "../context/channels.ts";
import { CloudSearchProvider } from "./cloudSearchProvider.ts";
import { DuckDuckGoSearchProvider } from "./duckduckgoProvider.ts";
import { ExaSearchProvider } from "./exaProvider.ts";
import { JinaSearchProvider } from "./jinaProvider.ts";
import {
	DEFAULT_ENGINE_ORDER,
	DEFAULT_SEARCH_TIMEOUT_MS,
	SEARCH_ENGINE_REGISTRY,
	type SearchConfig,
	type SearchEngineId,
} from "./registry.ts";
import { TavilySearchProvider } from "./tavilyProvider.ts";
import type { SearchOptions, SearchProvider, SearchResult } from "./types.ts";
import { hostnameOf, normalizeUrl } from "./urlNormalize.ts";

export interface SearchAttempt {
	engine: SearchEngineId | "official";
	ms: number;
	status: "success" | "failed" | "empty";
	count?: number;
	error?: string;
}

export interface SearchTrace {
	query: string;
	attempts: SearchAttempt[];
	totalMs: number;
}

export type SearchConfigLoader = () => SearchConfig | undefined;

function buildProvider(
	id: SearchEngineId,
	timeoutMs: number,
	configuredKeys: Partial<Record<SearchEngineId, string>> | undefined,
): SearchProvider | null {
	// Key 事实源为 ai_channel_configs（web_search 能力的 custom 行，provider=engineId），
	// 不再做任何 env 兜底（docs/ai-config-membership-v2-plan.md）。
	const keyFromSettings = configuredKeys?.[id]?.trim() || undefined;
	switch (id) {
		case "duckduckgo": {
			return new DuckDuckGoSearchProvider({ timeoutMs });
		}
		case "tavily": {
			const key = keyFromSettings;
			if (!key) return null;
			return new TavilySearchProvider(key, { timeoutMs });
		}
		case "exa": {
			const key = keyFromSettings;
			if (!key) return null;
			return new ExaSearchProvider(key, { timeoutMs });
		}
		case "brave": {
			const key = keyFromSettings;
			if (!key) return null;
			return new BraveSearchProvider(key, { timeoutMs });
		}
		case "jina": {
			const key = keyFromSettings;
			return new JinaSearchProvider(key, { timeoutMs });
		}
		case "anysearch": {
			const key = keyFromSettings;
			return new AnySearchProvider(key, { timeoutMs });
		}
	}
}

/** web_search 能力的 custom 行（provider=engineId）→ 引擎 key 映射 */
function loadChannelSearchKeys(): Partial<Record<SearchEngineId, string>> {
	const keys: Partial<Record<SearchEngineId, string>> = {};
	try {
		for (const row of listChannelConfigs("web_search")) {
			if (row.channel !== "custom") continue;
			const engine = row.provider as SearchEngineId;
			if (engine && row.apiKey.trim()) keys[engine] = row.apiKey.trim();
		}
	} catch {
		// 表未就绪等异常下按无 key 处理
	}
	return keys;
}

function dedupeResults(results: SearchResult[]): SearchResult[] {
	const byKey = new Map<string, SearchResult>();
	for (const r of results) {
		if (!r.url) continue;
		const key = normalizeUrl(r.url);
		const existing = byKey.get(key);
		if (!existing) {
			byKey.set(key, { ...r });
			continue;
		}
		const existingScore = existing.score ?? 0;
		const newScore = r.score ?? 0;
		if (newScore > existingScore) {
			byKey.set(key, { ...r });
		}
	}
	return Array.from(byKey.values());
}

function withFavicon(r: SearchResult): SearchResult {
	if (r.favicon) return r;
	const host = hostnameOf(r.url);
	if (!host) return r;
	return {
		...r,
		favicon: `https://www.google.com/s2/favicons?domain=${host}`,
	};
}

/**
 * Cascade-style orchestrator: tries engines in configured order, stops at
 * the first engine that yields a non-empty result. Emits a single structured
 * log line per search with per-engine attempts.
 */
export class SearchOrchestrator implements SearchProvider {
	name = "orchestrator";
	private loadConfig: SearchConfigLoader;
	private lastTrace: SearchTrace | null = null;

	constructor(loadConfig: SearchConfigLoader) {
		this.loadConfig = loadConfig;
	}

	getLastTrace(): SearchTrace | null {
		return this.lastTrace;
	}

	private resolveEngines(): {
		providers: Array<{
			id: SearchEngineId | "official";
			provider: SearchProvider;
		}>;
		timeoutMs: number;
	} {
		const cfg = this.loadConfig() || {};
		const timeoutMs = cfg.timeoutMs ?? DEFAULT_SEARCH_TIMEOUT_MS;
		const excluded = new Set(cfg.excludedEngines ?? []);
		const order =
			Array.isArray(cfg.engineOrder) && cfg.engineOrder.length > 0
				? cfg.engineOrder
				: [...DEFAULT_ENGINE_ORDER];

		// Validate engine ids against registry to silently drop typos.
		const known = new Set(SEARCH_ENGINE_REGISTRY.map((e) => e.id));
		const providers: Array<{
			id: SearchEngineId | "official";
			provider: SearchProvider;
		}> = [];

		// 官方通道优先：web_search 活跃通道为 official 时先走云端网关（会员权益），
		// 失败/为空后级联用户自备引擎（channel 行里的 custom key）。
		const activeChannel = getActiveChannel("web_search");
		const channelKeys = loadChannelSearchKeys();
		if (activeChannel?.channel === "official") {
			providers.push({
				id: "official",
				provider: new CloudSearchProvider(timeoutMs),
			});
		}

		// 设置 JSON 里的 key（历史兼容）与 channel 行合并，channel 行优先
		const mergedKeys: Partial<Record<SearchEngineId, string>> = {
			...(cfg.apiKeys ?? {}),
			...channelKeys,
		};
		for (const id of order) {
			if (!known.has(id)) continue;
			if (excluded.has(id)) continue;
			const provider = buildProvider(id, timeoutMs, mergedKeys);
			if (provider) providers.push({ id, provider });
		}
		return { providers, timeoutMs };
	}

	async search(
		query: string,
		options?: SearchOptions,
	): Promise<SearchResult[]> {
		const startedAt = Date.now();
		const { providers, timeoutMs } = this.resolveEngines();
		const attempts: SearchAttempt[] = [];

		let finalResults: SearchResult[] = [];
		for (const { id, provider } of providers) {
			const engineStart = Date.now();
			try {
				const results = await provider.search(query, {
					...options,
					timeoutMs: options?.timeoutMs ?? timeoutMs,
				});
				const ms = Date.now() - engineStart;
				if (results.length === 0) {
					attempts.push({ engine: id, ms, status: "empty", count: 0 });
					continue;
				}
				attempts.push({
					engine: id,
					ms,
					status: "success",
					count: results.length,
				});
				finalResults = dedupeResults(results).map(withFavicon);
				break;
			} catch (err) {
				const ms = Date.now() - engineStart;
				attempts.push({
					engine: id,
					ms,
					status: "failed",
					error: err instanceof Error ? err.message : String(err),
				});
			}
		}

		const totalMs = Date.now() - startedAt;
		const trace: SearchTrace = { query, attempts, totalMs };
		this.lastTrace = trace;

		try {
			console.log(`[SearchOrchestrator] ${JSON.stringify(trace)}`);
		} catch {
			// Logging must never break search.
		}

		return finalResults;
	}
}
