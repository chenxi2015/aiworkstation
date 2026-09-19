import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

export const aiHighlightPluginKey = new PluginKey("aiSelectionHighlight");

export interface AiHighlightRange {
	from: number;
	to: number;
}

/**
 * Visual decoration extension that keeps the active AI-targeted text selection
 * highlighted in the document even when the user clicks elsewhere or loses focus.
 * Does NOT alter the document content or schema.
 */
export const AiSelectionHighlight = Extension.create({
	name: "aiSelectionHighlight",

	addProseMirrorPlugins() {
		return [
			new Plugin({
				key: aiHighlightPluginKey,
				state: {
					init() {
						return { range: null as AiHighlightRange | null };
					},
					apply(tr, value) {
						const meta = tr.getMeta(aiHighlightPluginKey);
						if (meta !== undefined) {
							return { range: meta };
						}
						if (value.range) {
							const from = tr.mapping.map(value.range.from);
							const to = tr.mapping.map(value.range.to);
							if (from < to && to <= tr.doc.content.size) {
								return { range: { from, to } };
							}
							return { range: null };
						}
						return value;
					},
				},
				props: {
					decorations(state) {
						const pluginState = aiHighlightPluginKey.getState(state);
						if (!pluginState?.range) return DecorationSet.empty;
						const { from, to } = pluginState.range;
						if (from >= to || from < 0 || to > state.doc.content.size) {
							return DecorationSet.empty;
						}
						const deco = Decoration.inline(from, to, {
							class:
								"ai-active-selection-highlight bg-blue-500/20 dark:bg-blue-500/30 text-foreground border-b-2 border-blue-600 dark:border-blue-400 px-0.5 py-0.5 rounded-xs shadow-[0_0_0_1px_rgba(59,130,246,0.25)] transition-all",
						});
						return DecorationSet.create(state.doc, [deco]);
					},
				},
			}),
		];
	},
});
