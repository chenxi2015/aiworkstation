import { type Extension, type Range, StateEffect, StateField } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, WidgetType } from "@codemirror/view";
import { computeFineDiff } from "../../editor/utils/diffHelper";

export interface AiHighlightRange {
	from: number;
	to: number;
}

export interface AiDiffSuggestionPayload {
	from: number;
	to: number;
	oldText: string;
	newText: string;
}

// Effects to update highlight and diff states
export const setAiSelectionHighlight = StateEffect.define<AiHighlightRange | null>();
export const setAiDiffSuggestion = StateEffect.define<AiDiffSuggestionPayload | null>();

/**
 * Custom widget to render inserted text in inline diff view
 */
class DiffInsertWidget extends WidgetType {
	constructor(readonly text: string) {
		super();
	}

	toDOM(): HTMLElement {
		const ins = document.createElement("ins");
		ins.className =
			"ai-suggestion-insert no-underline bg-emerald-500/15 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-medium px-1 py-0.5 rounded border-b border-emerald-500/40 mx-0.5 select-text";
		ins.textContent = this.text;
		return ins;
	}

	eq(other: DiffInsertWidget): boolean {
		return other.text === this.text;
	}

	ignoreEvent(): boolean {
		return false;
	}
}

/**
 * Builds decoration set for inline diff suggestions
 */
function buildDiffDecorations(
	payload: AiDiffSuggestionPayload,
	docLength: number,
): DecorationSet {
	const { from, to, oldText, newText } = payload;
	if (from < 0 || to > docLength || from > to) {
		return Decoration.none;
	}

	const segments = computeFineDiff(oldText, newText);
	const ranges: Range<Decoration>[] = [];
	let cur = from;

	for (const segment of segments) {
		const textLen = segment.text.length;
		if (!textLen) continue;

		if (segment.status === "same") {
			cur += textLen;
		} else if (segment.status === "removed") {
			const end = Math.min(cur + textLen, docLength);
			if (cur < end) {
				ranges.push(
					Decoration.mark({
						class:
							"ai-suggestion-delete line-through text-rose-600/85 dark:text-rose-400/85 decoration-rose-500/60 bg-rose-500/15 dark:bg-rose-500/20 px-1 py-0.5 rounded mx-0.5 select-text",
					}).range(cur, end),
				);
			}
			cur += textLen;
		} else if (segment.status === "added") {
			const widgetPos = Math.min(cur, docLength);
			ranges.push(
				Decoration.widget({
					widget: new DiffInsertWidget(segment.text),
					side: 1,
				}).range(widgetPos),
			);
		}
	}

	return Decoration.set(ranges, true);
}

/**
 * StateField managing AI selection persistent highlight
 */
export const aiSelectionHighlightField = StateField.define<DecorationSet>({
	create() {
		return Decoration.none;
	},
	update(decorations, tr) {
		let updated = decorations.map(tr.changes);
		for (const effect of tr.effects) {
			if (effect.is(setAiSelectionHighlight)) {
				const range = effect.value;
				if (!range || range.from >= range.to || range.to > tr.newDoc.length) {
					updated = Decoration.none;
				} else {
					updated = Decoration.set([
						Decoration.mark({
							class:
								"ai-active-selection-highlight bg-blue-500/20 dark:bg-blue-500/30 text-foreground border-b-2 border-blue-600 dark:border-blue-400 px-0.5 py-0.5 rounded-xs shadow-[0_0_0_1px_rgba(59,130,246,0.25)] transition-all",
						}).range(range.from, range.to),
					]);
				}
			}
		}
		return updated;
	},
	provide: (f) => EditorView.decorations.from(f),
});

/**
 * StateField managing AI inline diff suggestion preview
 */
export const aiDiffSuggestionField = StateField.define<DecorationSet>({
	create() {
		return Decoration.none;
	},
	update(decorations, tr) {
		let updated = decorations.map(tr.changes);
		for (const effect of tr.effects) {
			if (effect.is(setAiDiffSuggestion)) {
				const payload = effect.value;
				if (!payload) {
					updated = Decoration.none;
				} else {
					updated = buildDiffDecorations(payload, tr.newDoc.length);
				}
			}
		}
		return updated;
	},
	provide: (f) => EditorView.decorations.from(f),
});

/**
 * Extension bundle providing both AI selection highlight and diff preview capabilities
 */
export function aiSelectionDecorationExtension(): Extension {
	return [aiSelectionHighlightField, aiDiffSuggestionField];
}
