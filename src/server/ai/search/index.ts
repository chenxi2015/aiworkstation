import { readSearchConfig } from "./configLoader.ts";
import { SearchOrchestrator } from "./orchestrator.ts";
import type { SearchProvider } from "./types.ts";

export * from "./types.ts";
export * from "./registry.ts";
export { SearchOrchestrator } from "./orchestrator.ts";
export type { SearchAttempt, SearchTrace } from "./orchestrator.ts";

let instance: SearchOrchestrator | null = null;

export function getSearchProvider(): SearchProvider {
	if (!instance) {
		// better-sqlite3 is synchronous — reads are cheap enough to run on
		// every search call, so settings changes take effect immediately.
		instance = new SearchOrchestrator(readSearchConfig);
	}
	return instance;
}

/**
 * Expose the orchestrator's last search trace for tool-level reporting.
 */
export function getLastSearchTrace() {
	return instance?.getLastTrace() ?? null;
}
