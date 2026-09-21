import type { EditorState } from "@codemirror/state";
import { Decoration } from "@codemirror/view";
import {
	type DecoItem,
	type HiddenMark,
	type LivePreviewOptions,
	lineTouchesSelection,
	type Range,
	selectionTouches,
} from "./dialectDecorations";
import { mediaSourceField, resolveAssetUrl } from "./mediaWidget";

export interface LivePreviewContext {
	state: EditorState;
	options: LivePreviewOptions;

	// Decoration collection buckets
	marks: HiddenMark[];
	lineItems: { pos: number; deco: Decoration }[];
	inlineItems: DecoItem[];
	replacedBlocks: Range[];
	blockWidgets: DecoItem[];
	codeBlockRanges: Range[];
	calloutMarkRanges: Range[];
	consumedHtml: Range[];

	// Geometry and state query helpers
	resolveHtmlAssetSrc: (html: string) => string;
	isSourceRevealed: (from: number, to: number) => boolean;
	inReplacedBlock: (from: number, to: number) => boolean;
	touches: (from: number, to: number) => boolean;
	lineTouches: (from: number, to: number) => boolean;
	pushLine: (from: number, to: number, cls: string) => void;
}

/**
 * Creates a new live preview context encapsulating state, options, and decoration collections
 */
export function createLivePreviewContext(
	state: EditorState,
	options: LivePreviewOptions,
): LivePreviewContext {
	const marks: HiddenMark[] = [];
	const lineItems: { pos: number; deco: Decoration }[] = [];
	const inlineItems: DecoItem[] = [];
	const replacedBlocks: Range[] = [];
	const blockWidgets: DecoItem[] = [];
	const codeBlockRanges: Range[] = [];
	const calloutMarkRanges: Range[] = [];
	const consumedHtml: Range[] = [];

	/** Rewrites relative src attributes inside raw HTML to vault asset URLs */
	const resolveHtmlAssetSrc = (html: string) =>
		html.replace(
			/(\ssrc\s*=\s*)(["'])([^"']+)\2/gi,
			(_m, pre: string, quote: string, url: string) =>
				`${pre}${quote}${resolveAssetUrl(url, options.noteRelPath)}${quote}`,
		);

	const sourceReveal = state.field(mediaSourceField, false);
	const isSourceRevealed = (from: number, to: number) =>
		!!sourceReveal && sourceReveal.from <= to && sourceReveal.to >= from;

	const inReplacedBlock = (from: number, to: number) =>
		replacedBlocks.some((b) => from < b.to && to > b.from);

	// In reading mode, cursor is considered non-touching so all syntax remains rendered;
	// in live-edit mode, touches are determined by current selection.
	const touches = (from: number, to: number) =>
		options.readingMode ? false : selectionTouches(state, from, to);
	const lineTouches = (from: number, to: number) =>
		options.readingMode ? false : lineTouchesSelection(state, from, to);

	const pushLine = (from: number, to: number, cls: string) => {
		const startLine = state.doc.lineAt(from);
		const endLine = state.doc.lineAt(
			Math.max(from, Math.min(to, state.doc.length)),
		);
		for (let line = startLine.number; line <= endLine.number; line++) {
			lineItems.push({
				pos: state.doc.line(line).from,
				deco: Decoration.line({ class: cls }),
			});
		}
	};

	return {
		state,
		options,
		marks,
		lineItems,
		inlineItems,
		replacedBlocks,
		blockWidgets,
		codeBlockRanges,
		calloutMarkRanges,
		consumedHtml,
		resolveHtmlAssetSrc,
		isSourceRevealed,
		inReplacedBlock,
		touches,
		lineTouches,
		pushLine,
	};
}
