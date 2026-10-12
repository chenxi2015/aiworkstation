import { BraveSearchProvider } from "./braveProvider.ts";
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
	engine: SearchEngineId;
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
	// Settings-stored key wins over env var; both are trimmed.
	const keyFromSettings = configuredKeys?.[id]?.trim() || undefined;
	switch (id) {
		case "tavily": {
			const key = keyFromSettings ?? process.env.TAVILY_API_KEY?.trim();
			if (!key) return null;
			return new TavilySearchProvider(key, { timeoutMs });
		}
		case "exa": {
			const key = keyFromSettings ?? process.env.EXA_API_KEY?.trim();
			if (!key) return null;
			return new ExaSearchProvider(key, { timeoutMs });
		}
		case "brave": {
			const key = keyFromSettings ?? process.env.BRAVE_API_KEY?.trim();
			if (!key) return null;
			return new BraveSearchProvider(key, { timeoutMs });
		}
		case "jina": {
			const key = keyFromSettings ?? (process.env.JINA_API_KEY?.trim() || undefined);
			return new JinaSearchProvider(key, { timeoutMs });
		}
	}
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
		providers: Array<{ id: SearchEngineId; provider: SearchProvider }>;
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
		const providers: Array<{ id: SearchEngineId; provider: SearchProvider }> =
			[];
		for (const id of order) {
			if (!known.has(id)) continue;
			if (excluded.has(id)) continue;
			const provider = buildProvider(id, timeoutMs, cfg.apiKeys);
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
