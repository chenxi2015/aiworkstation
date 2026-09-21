import { RangeSetBuilder } from "@codemirror/state";
import { Decoration, type DecorationSet } from "@codemirror/view";
import type { DecoItem } from "./dialectDecorations";
import type { LivePreviewContext } from "./livePreviewContext";

export const HIDE = Decoration.replace({});

/**
 * Formats a decoration item for debug diagnostics
 */
function dumpDecoItem(it: DecoItem | undefined) {
	if (!it) return null;
	return {
		from: it.from,
		to: it.to,
		cls: it.deco.spec?.class,
		block: it.deco.spec?.block,
		widget: it.deco.spec?.widget?.constructor?.name,
		startSide: it.deco.startSide,
		endSide: it.deco.endSide,
	};
}

/**
 * Compares two decoration items to satisfy RangeSetBuilder's monotonic ordering requirement.
 * Must sort by (from, startSide, to, endSide) lexicographically.
 */
function compareDecoItems(a: DecoItem, b: DecoItem): number {
	return (
		a.from - b.from ||
		a.deco.startSide - b.deco.startSide ||
		a.to - b.to ||
		a.deco.endSide - b.deco.endSide
	);
}

/**
 * Merges all collected decorations into a unified RangeSetBuilder with strict ordering and error tolerance.
 */
export function assembleDecorations(ctx: LivePreviewContext): DecorationSet {
	const { state, lineItems, inlineItems, blockWidgets, marks } = ctx;
	const builder = new RangeSetBuilder<Decoration>();

	const all: DecoItem[] = [
		...lineItems.map((l) => ({ from: l.pos, to: l.pos, deco: l.deco })),
		...inlineItems,
		...blockWidgets,
		...marks.map((m) => ({ from: m.from, to: m.to, deco: HIDE })),
	];

	// RangeSetBuilder requires monotonic (from, startSide, to, endSide) ordering
	all.sort(compareDecoItems);

	for (let i = 0; i < all.length; i++) {
		const item = all[i];
		if (!item || item.to < item.from) continue;

		try {
			builder.add(item.from, item.to, item.deco);
		} catch (e) {
			// Decoration addition failure should not crash the editor; log details and continue
			console.error(
				"[livePreview] skip deco " +
					JSON.stringify({
						item: dumpDecoItem(item),
						prev: dumpDecoItem(all[i - 1]),
						next: dumpDecoItem(all[i + 1]),
						context: state.doc.sliceString(
							Math.max(0, item.from - 60),
							Math.min(state.doc.length, item.to + 60),
						),
					}),
				e,
			);
		}
	}

	return builder.finish();
}
