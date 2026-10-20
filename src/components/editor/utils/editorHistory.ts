import type { Editor } from "@tiptap/core";

/**
 * Resets the undo/redo history stacks of the TipTap editor.
 * Ensures that switching documents does not leak previous document edits or
 * allow Ctrl+Z (undo) to rollback into another document.
 *
 * @param editor The TipTap editor instance
 * @returns boolean Whether the history was successfully reset
 */
export function resetEditorHistory(editor: Editor | null | undefined): boolean {
	if (!editor || editor.isDestroyed) return false;

	const { state, view } = editor;
	if (!state || !view) return false;

	// Locate the prosemirror-history plugin from the current editor state
	const historyPlugin = state.plugins.find((p) => {
		const keyStr = (p as unknown as { key?: string }).key;
		const hasHistoryKey =
			Boolean(keyStr?.startsWith("history$")) ||
			Boolean(p.spec.key && String(p.spec.key).includes("history"));
		const hasHistoryConfig = Boolean(
			p.spec.config &&
				"newGroupDelay" in (p.spec.config as Record<string, unknown>),
		);
		return hasHistoryKey || hasHistoryConfig;
	});
	if (!historyPlugin || !historyPlugin.spec.state) return false;

	try {
		// Initialize a brand new empty HistoryState
		const emptyHistoryState = historyPlugin.spec.state.init(
			historyPlugin.spec.config ?? {},
			state,
		);

		// Prefer spec.key (PluginKey instance) or fall back to internal plugin key string
		const pluginKey =
			historyPlugin.spec.key ??
			(historyPlugin as unknown as { key: string }).key;

		// Dispatch a meta transaction to replace the history plugin state without recording to history
		const tr = state.tr
			.setMeta(pluginKey, { historyState: emptyHistoryState })
			.setMeta("addToHistory", false);

		view.dispatch(tr);
		return true;
	} catch (err) {
		console.warn("[editorHistory] Failed to reset editor history:", err);
		return false;
	}
}