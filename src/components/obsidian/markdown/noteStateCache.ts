import type { EditorState } from "@codemirror/state";

export interface CachedNoteState {
	state: EditorState;
	scroll?: { top: number; left: number };
	updatedAt: number;
}

/** Maximum number of note editor states kept in memory */
const MAX_CACHE_SIZE = 50;

const noteStateMap = new Map<string, CachedNoteState>();

/**
 * Save active note EditorState and scroll position to memory cache
 */
export function saveCachedNoteState(
	relPath: string,
	state: EditorState,
	scroll?: { top: number; left: number },
): void {
	if (!relPath) return;
	// Delete first to refresh insertion order for LRU eviction
	noteStateMap.delete(relPath);
	noteStateMap.set(relPath, {
		state,
		scroll,
		updatedAt: Date.now(),
	});

	// Evict oldest entry if capacity exceeded
	if (noteStateMap.size > MAX_CACHE_SIZE) {
		const oldestKey = noteStateMap.keys().next().value;
		if (oldestKey) noteStateMap.delete(oldestKey);
	}
}

/**
 * Retrieve cached note EditorState by relative path (refreshes LRU order)
 */
export function getCachedNoteState(relPath: string): CachedNoteState | null {
	if (!relPath) return null;
	const entry = noteStateMap.get(relPath);
	if (!entry) return null;
	noteStateMap.delete(relPath);
	noteStateMap.set(relPath, entry);
	return entry;
}

/**
 * Invalidate a cached note state (e.g. when note is deleted)
 */
export function invalidateCachedNoteState(relPath: string): void {
	noteStateMap.delete(relPath);
}

/**
 * Rename a cached note state when note path is updated
 */
export function renameCachedNoteState(oldPath: string, newPath: string): void {
	const entry = noteStateMap.get(oldPath);
	if (entry) {
		noteStateMap.delete(oldPath);
		noteStateMap.set(newPath, entry);
	}
}

/**
 * Check whether a note has an active isolated cached state
 */
export function hasCachedNoteState(relPath: string): boolean {
	return Boolean(relPath && noteStateMap.has(relPath));
}

/**
 * Clear all cached note editor states
 */
export function clearNoteStateCache(): void {
	noteStateMap.clear();
}
