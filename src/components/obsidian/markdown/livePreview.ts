import type { EditorState, Extension, Transaction } from "@codemirror/state";
import { StateField } from "@codemirror/state";
import { type DecorationSet, EditorView } from "@codemirror/view";
import { assembleDecorations } from "./decorationBuilder";
import {
	type LivePreviewOptions,
	processDialects,
	processFrontmatter,
} from "./dialectDecorations";
import { externalLinkInteractions } from "./externalLink";
import { processLezerSyntaxTree } from "./lezerDecorations";
import { createLivePreviewContext } from "./livePreviewContext";
import { mediaSourceField } from "./mediaWidget";
import { followWikilinkTarget, wikilinkInteractions } from "./wikilink";

export type { LivePreviewOptions };

/**
 * Builds all live preview decorations across Lezer AST, Frontmatter, and Obsidian dialects
 */
function buildDecorations(
	state: EditorState,
	options: LivePreviewOptions,
): DecorationSet {
	const ctx = createLivePreviewContext(state, options);

	// 1. Lezer syntax tree traversal (Standard Markdown & GFM)
	processLezerSyntaxTree(state, options, ctx);

	// 2. Frontmatter
	processFrontmatter(state, {
		readingMode: options.readingMode,
		onFollowWikilink: (target) => void followWikilinkTarget(target, options),
		replacedBlocks: ctx.replacedBlocks,
		blockWidgets: ctx.blockWidgets,
		pushLine: ctx.pushLine,
	});

	// 3. Obsidian Dialects Regex Matching
	processDialects(state, options, {
		marks: ctx.marks,
		inlineItems: ctx.inlineItems,
		blockWidgets: ctx.blockWidgets,
		replacedBlocks: ctx.replacedBlocks,
		codeBlockRanges: ctx.codeBlockRanges,
		isSourceRevealed: ctx.isSourceRevealed,
		pushLine: ctx.pushLine,
	});

	// 4. Merge and sort all decorations into RangeSetBuilder
	return assembleDecorations(ctx);
}

/**
 * StateField for live preview decorations (block widgets require StateField)
 */
function createLivePreviewField(options: LivePreviewOptions) {
	return StateField.define<DecorationSet>({
		create: (state) => buildDecorations(state, options),
		update: (deco: DecorationSet, tr: Transaction) => {
			const selChanged = tr.selection !== undefined;
			if (!tr.docChanged && !selChanged && tr.effects.length === 0) {
				return deco;
			}
			return buildDecorations(tr.state, options);
		},
		provide: (field) => EditorView.decorations.from(field),
	});
}

/**
 * Creates the complete live preview extension suite for CodeMirror
 */
export function livePreview(options: LivePreviewOptions = {}): Extension {
	return [
		mediaSourceField,
		createLivePreviewField(options),
		wikilinkInteractions(options),
		externalLinkInteractions(options),
	];
}
