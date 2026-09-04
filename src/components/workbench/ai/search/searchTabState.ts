import type { SearchMode, SearchResultItem, SearchScope } from "../../types";

/**
 * Module-level cache for the Search Tab UI state.
 *
 * The search tab gets unmounted when switching to the AI Chat tab or when
 * navigating to another route, which used to wipe the keyword, results and
 * facet selections. Keeping a snapshot outside React lets the tab restore
 * instantly on remount (results are refreshed in the background on mount).
 */
export interface SearchTabSnapshot {
	query: string;
	mode?: SearchMode;
	/** null means "never searched yet" → derive scope from page context */
	scope: SearchScope | null;
	results: SearchResultItem[];
	activeCategoryFacet: string | null;
	activeFolderFacet: string | null;
	activeTypeFacet: string | null;
}

let snapshot: SearchTabSnapshot = {
	query: "",
	mode: "keyword",
	scope: null,
	results: [],
	activeCategoryFacet: null,
	activeFolderFacet: null,
	activeTypeFacet: null,
};

export function getSearchTabSnapshot(): SearchTabSnapshot {
	return snapshot;
}

export function saveSearchTabSnapshot(patch: Partial<SearchTabSnapshot>): void {
	snapshot = { ...snapshot, ...patch };
}
