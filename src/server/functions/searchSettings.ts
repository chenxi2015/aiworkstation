import { createServerFn } from "@tanstack/react-start";
import type { SearchConfig, SearchEngineId } from "../ai/search/registry.ts";
import { workbenchDb } from "../db/sqlite.ts";

const SETTINGS_KEY = "searchConfig";

export const getSearchConfig = createServerFn({ method: "GET" }).handler(
	async (): Promise<SearchConfig | null> => {
		try {
			const raw = workbenchDb.getSetting(SETTINGS_KEY);
			if (!raw) return null;
			return JSON.parse(raw) as SearchConfig;
		} catch (err) {
			console.warn("[getSearchConfig] Database access error:", err);
			return null;
		}
	},
);

export const saveSearchConfig = createServerFn({ method: "POST" })
	.validator((config: SearchConfig) => config)
	.handler(async ({ data: config }): Promise<{ success: boolean }> => {
		// Basic shape validation
		const sanitized: SearchConfig = {};
		const allowedEngines: readonly SearchEngineId[] = [
			"duckduckgo",
			"tavily",
			"exa",
			"brave",
			"jina",
			"anysearch",
		];
		if (Array.isArray(config.engineOrder)) {
			sanitized.engineOrder = config.engineOrder.filter(
				(id): id is SearchEngineId =>
					typeof id === "string" &&
					allowedEngines.includes(id as SearchEngineId),
			);
		}
		if (Array.isArray(config.excludedEngines)) {
			sanitized.excludedEngines = config.excludedEngines.filter(
				(id): id is SearchEngineId =>
					typeof id === "string" &&
					allowedEngines.includes(id as SearchEngineId),
			);
		}
		if (
			typeof config.timeoutMs === "number" &&
			Number.isFinite(config.timeoutMs) &&
			config.timeoutMs > 0
		) {
			sanitized.timeoutMs = Math.floor(config.timeoutMs);
		}
		if (config.apiKeys && typeof config.apiKeys === "object") {
			const keys: Partial<Record<SearchEngineId, string>> = {};
			for (const id of allowedEngines) {
				const value = config.apiKeys[id];
				if (typeof value === "string" && value.trim()) {
					keys[id] = value.trim();
				}
			}
			if (Object.keys(keys).length > 0) {
				sanitized.apiKeys = keys;
			}
		}
		workbenchDb.setSetting(SETTINGS_KEY, JSON.stringify(sanitized));
		return { success: true };
	});
