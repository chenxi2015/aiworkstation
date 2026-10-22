import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

export interface SearchMatchRange {
	from: number;
	to: number;
}

export interface SearchHighlightMeta {
	matches: SearchMatchRange[];
	currentIndex: number;
}

export const searchHighlightPluginKey = new PluginKey<DecorationSet>(
	"searchHighlight",
);

/**
 * Robust ProseMirror extension to manage search highlight decorations in TipTap.
 * Stores DecorationSet directly in plugin state for instant, rock-solid rendering.
 */
export const SearchHighlightExtension = Extension.create({
	name: "searchHighlight",

	addKeyboardShortcuts() {
		return {
			"Mod-f": () => {
				if (typeof window !== "undefined") {
					window.dispatchEvent(
						new CustomEvent("tiptap:open-search", {
							detail: { replace: false },
						}),
					);
				}
				return true;
			},
			"Mod-Alt-f": () => {
				if (typeof window !== "undefined") {
					window.dispatchEvent(
						new CustomEvent("tiptap:open-search", {
							detail: { replace: true },
						}),
					);
				}
				return true;
			},
		};
	},

	addProseMirrorPlugins() {
		return [
			new Plugin<DecorationSet>({
				key: searchHighlightPluginKey,
				state: {
					init(): DecorationSet {
						return DecorationSet.empty;
					},
					apply(tr, oldSet): DecorationSet {
						const meta = tr.getMeta(searchHighlightPluginKey) as
							| SearchHighlightMeta
							| undefined;

						if (meta !== undefined) {
							if (!meta.matches || meta.matches.length === 0) {
								return DecorationSet.empty;
							}
							const docSize = tr.doc.content.size;
							const decorations: Decoration[] = [];

							for (let idx = 0; idx < meta.matches.length; idx++) {
								const m = meta.matches[idx];
								if (m.from >= 0 && m.to <= docSize && m.from < m.to) {
									const isCurrent = idx === meta.currentIndex;
									decorations.push(
										Decoration.inline(m.from, m.to, {
											class: isCurrent
												? "search-match search-match-current"
												: "search-match",
											style: isCurrent
												? "background-color: #f59e0b !important; color: #000000 !important; outline: 2px solid #d97706 !important; border-radius: 2px; font-weight: bold; box-shadow: 0 0 0 1px #d97706;"
												: "background-color: #fef08a !important; color: #000000 !important; border-radius: 2px; box-shadow: 0 0 0 1px rgba(234, 179, 8, 0.4);",
										}),
									);
								}
							}

							return DecorationSet.create(tr.doc, decorations);
						}

						return tr.docChanged ? oldSet.map(tr.mapping, tr.doc) : oldSet;
					},
				},
				props: {
					decorations(state) {
						return (
							searchHighlightPluginKey.getState(state) ?? DecorationSet.empty
						);
					},
				},
			}),
		];
	},
});
