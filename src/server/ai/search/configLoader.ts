import { workbenchDb } from "../../db/sqlite.ts";
import type { SearchConfig } from "./registry.ts";

/**
 * Read the user-configurable search config from the settings store.
 * better-sqlite3 is synchronous, so this is cheap enough to call per request
 * and gives us "settings changes take effect immediately" semantics.
 */
export function readSearchConfig(): SearchConfig | undefined {
	try {
		const raw = workbenchDb.getSetting("searchConfig");
		if (!raw) return undefined;
		return JSON.parse(raw) as SearchConfig;
	} catch {
		return undefined;
	}
}
