import type { SearchProvider } from "./types.ts";

export type SearchEngineId =
	| "duckduckgo"
	| "tavily"
	| "exa"
	| "brave"
	| "jina"
	| "anysearch";

export interface ProviderDescriptor {
	id: SearchEngineId;
	label: string;
	/** Env var holding the API key, or null when the engine works without one */
	keyEnv: string | null;
	/** Whether a key is required for the engine to function at all */
	requiresKey: boolean;
}

/**
 * Static registry of supported search engines. Instantiation lives in the
 * orchestrator to avoid circular imports.
 */
export const SEARCH_ENGINE_REGISTRY: readonly ProviderDescriptor[] = [
	{
		id: "duckduckgo",
		label: "DuckDuckGo",
		keyEnv: null,
		requiresKey: false,
	},
	{
		id: "tavily",
		label: "Tavily",
		keyEnv: "TAVILY_API_KEY",
		requiresKey: true,
	},
	{
		id: "exa",
		label: "Exa",
		keyEnv: "EXA_API_KEY",
		requiresKey: true,
	},
	{
		id: "brave",
		label: "Brave",
		keyEnv: "BRAVE_API_KEY",
		requiresKey: true,
	},
	{
		id: "jina",
		label: "Jina",
		keyEnv: "JINA_API_KEY",
		requiresKey: false,
	},
	{
		id: "anysearch",
		label: "AnySearch",
		keyEnv: "ANYSEARCH_API_KEY",
		requiresKey: false,
	},
] as const;

export const DEFAULT_ENGINE_ORDER: readonly SearchEngineId[] = [
	"duckduckgo",
	"tavily",
	"exa",
	"brave",
	"jina",
	"anysearch",
] as const;

export interface SearchConfig {
	engineOrder?: SearchEngineId[];
	excludedEngines?: SearchEngineId[];
	/** Per-engine timeout in milliseconds */
	timeoutMs?: number;
	/**
	 * Per-engine API keys stored in settings DB. Take precedence over
	 * environment variables. Jina works without a key but supplying one
	 * raises rate limits.
	 */
	apiKeys?: Partial<Record<SearchEngineId, string>>;
}

export const DEFAULT_SEARCH_TIMEOUT_MS = 10_000;

export type { SearchProvider };
