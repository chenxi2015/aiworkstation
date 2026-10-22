import {
	type Extension,
	type Range,
	StateEffect,
	StateField,
} from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView } from "@codemirror/view";

export interface CmSearchMatchPayload {
	matches: Array<{ from: number; to: number }>;
	currentIndex: number;
}

export const setCmSearchMatchesEffect =
	StateEffect.define<CmSearchMatchPayload | null>();

const matchMark = Decoration.mark({ class: "cm-searchMatch" });
const selectedMatchMark = Decoration.mark({
	class: "cm-searchMatch cm-searchMatch-selected",
});

/**
 * Robust CodeMirror 6 extension to render in-document search highlight decorations
 * without depending on CodeMirror's internal search panel state.
 */
export const cmSearchHighlightField = StateField.define<DecorationSet>({
	create() {
		return Decoration.none;
	},
	update(decorations, tr) {
		const updated = decorations.map(tr.changes);
		for (const effect of tr.effects) {
			if (effect.is(setCmSearchMatchesEffect)) {
				const payload = effect.value;
				if (!payload || !payload.matches.length) {
					return Decoration.none;
				}
				const { matches, currentIndex } = payload;
				const docLength = tr.newDoc.length;
				const ranges: Range<Decoration>[] = [];
				for (let i = 0; i < matches.length; i++) {
					const m = matches[i];
					if (m.from < m.to && m.to <= docLength && m.from >= 0) {
						const isSelected = i === currentIndex;
						ranges.push(
							(isSelected ? selectedMatchMark : matchMark).range(m.from, m.to),
						);
					}
				}
				return Decoration.set(ranges, true);
			}
		}
		return updated;
	},
	provide: (f) => EditorView.decorations.from(f),
});

export function cmSearchHighlightExtension(): Extension {
	return cmSearchHighlightField;
}
