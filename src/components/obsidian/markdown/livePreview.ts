import { syntaxTree } from "@codemirror/language";
import {
	type EditorState,
	type Extension,
	RangeSetBuilder,
	StateField,
	type Transaction,
} from "@codemirror/state";
import {
	Decoration,
	type DecorationSet,
	EditorView,
} from "@codemirror/view";
import { DataviewWidget, extractDataviewQuery } from "./DataviewWidget";
import {
	type DecoItem,
	type HiddenMark,
	type LivePreviewOptions,
	processDialects,
	processFrontmatter,
	type Range,
	selectionTouches,
} from "./dialectDecorations";
import {
	MediaWidget,
	mediaKindOf,
	mediaSourceField,
	resolveAssetUrl,
} from "./mediaWidget";
import {
	BulletWidget,
	CALLOUT_ALIASES,
	CalloutIconWidget,
	CheckboxWidget,
	HEADING_CLASSES,
	TableWidget,
} from "./widgets";

export type { LivePreviewOptions };

const HIDE = Decoration.replace({});

function buildDecorations(
	state: EditorState,
	options: LivePreviewOptions,
): DecorationSet {
	const marks: HiddenMark[] = [];
	const lineItems: { pos: number; deco: Decoration }[] = [];
	const inlineItems: DecoItem[] = [];
	const replacedBlocks: Range[] = [];
	const blockWidgets: DecoItem[] = [];
	const codeBlockRanges: Range[] = [];
	const calloutMarkRanges: Range[] = [];

	const sourceReveal = state.field(mediaSourceField, false);
	const isSourceRevealed = (from: number, to: number) =>
		!!sourceReveal && sourceReveal.from <= to && sourceReveal.to >= from;

	const inReplacedBlock = (from: number, to: number) =>
		replacedBlocks.some((b) => from < b.to && to > b.from);

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

	// ── 1. Lezer syntax tree traversal (Standard Markdown & GFM) ─────────
	for (const range of [{ from: 0, to: state.doc.length }]) {
		syntaxTree(state).iterate({
			from: range.from,
			to: range.to,
			enter(node) {
				if (inReplacedBlock(node.from, node.to)) return false;
				const { from, to, name } = node;

				// GFM Table: rendered as HTML table when cursor is outside
				if (name === "Table") {
					if (!selectionTouches(state, from, to)) {
						const fromLine = state.doc.lineAt(from);
						const toLine = state.doc.lineAt(to);
						const blockFrom = fromLine.from;
						const blockTo = toLine.to;
						replacedBlocks.push({ from: blockFrom, to: blockTo });
						blockWidgets.push({
							from: blockFrom,
							to: blockTo,
							deco: Decoration.replace({
								widget: new TableWidget(
									state.doc.sliceString(blockFrom, blockTo),
								),
								block: true,
							}),
						});
					}
					return false;
				}

				// Heading lines
				const headingClass = HEADING_CLASSES[name];
				if (headingClass) {
					pushLine(from, to, headingClass);
					return;
				}

				switch (name) {
					case "HeaderMark": {
						const line = state.doc.lineAt(from);
						if (!selectionTouches(state, line.from, line.to)) {
							marks.push({ from, to });
						}
						return;
					}
					case "QuoteMark": {
						if (calloutMarkRanges.some((c) => from < c.to && to > c.from)) {
							return;
						}
						const line = state.doc.lineAt(from);
						if (!selectionTouches(state, line.from, line.to)) {
							marks.push({ from, to });
						}
						return;
					}
					case "TaskMarker": {
						const line = state.doc.lineAt(from);
						if (!selectionTouches(state, line.from, line.to)) {
							const checked = /[xX]/.test(state.doc.sliceString(from, to));
							inlineItems.push({
								from,
								to,
								deco: Decoration.replace({
									widget: new CheckboxWidget(checked, from),
								}),
							});
							if (checked && to < line.to) {
								inlineItems.push({
									from: to,
									to: line.to,
									deco: Decoration.mark({ class: "cm-live-task-done" }),
								});
							}
						}
						return;
					}
					case "ListMark": {
						const text = state.doc.sliceString(from, to);
						const line = state.doc.lineAt(from);
						if (/\d/.test(text)) return;
						if (selectionTouches(state, line.from, line.to)) return;
						const after = state.doc.sliceString(
							to,
							Math.min(to + 4, state.doc.length),
						);
						if (/^\s*\[[ xX]\]/.test(after)) {
							inlineItems.push({ from, to, deco: Decoration.replace({}) });
							return;
						}
						inlineItems.push({
							from,
							to,
							deco: Decoration.replace({ widget: new BulletWidget() }),
						});
						return;
					}
					case "StrongEmphasis":
						inlineItems.push({
							from,
							to,
							deco: Decoration.mark({ class: "cm-live-strong" }),
						});
						return;
					case "Emphasis":
						inlineItems.push({
							from,
							to,
							deco: Decoration.mark({ class: "cm-live-em" }),
						});
						return;
					case "Strikethrough":
						inlineItems.push({
							from,
							to,
							deco: Decoration.mark({ class: "cm-live-strike" }),
						});
						return;
					case "EmphasisMark":
					case "StrikethroughMark":
					case "SubscriptMark":
					case "SuperscriptMark":
					case "CodeMark": {
						const parent = node.node.parent;
						if (
							!selectionTouches(state, parent?.from ?? from, parent?.to ?? to)
						) {
							marks.push({ from, to });
						}
						return;
					}
					case "InlineCode":
						inlineItems.push({
							from,
							to,
							deco: Decoration.mark({ class: "cm-live-incode" }),
						});
						return;
					case "FencedCode": {
						const infoNode = node.node.getChild("CodeInfo");
						const infoText = infoNode
							? state.doc
									.sliceString(infoNode.from, infoNode.to)
									.trim()
									.toLowerCase()
							: "";
						if (infoText === "dataview") {
							if (!selectionTouches(state, from, to)) {
								const query = extractDataviewQuery(
									state.doc.sliceString(from, to),
								);
								replacedBlocks.push({ from, to });
								blockWidgets.push({
									from,
									to,
									deco: Decoration.replace({
										widget: new DataviewWidget(query, options.onNavigateNote),
										block: true,
									}),
								});
								return;
							}
						}
						pushLine(from, to, "cm-live-codeblock");
						codeBlockRanges.push({ from, to });
						return;
					}
					case "CodeBlock":
						pushLine(from, to, "cm-live-codeblock");
						codeBlockRanges.push({ from, to });
						return;
					case "Blockquote": {
						const firstLine = state.doc.lineAt(from);
						const markerMatch = firstLine.text.match(
							/^>\s*\[!([a-zA-Z]+)\][+-]?\s?/,
						);
						if (markerMatch) {
							const rawType = (markerMatch[1] ?? "note").toLowerCase();
							const type = CALLOUT_ALIASES[rawType] ?? rawType;
							pushLine(from, to, "cm-live-callout");
							pushLine(from, to, `cm-live-callout-${type}`);
							if (!selectionTouches(state, firstLine.from, firstLine.to)) {
								const markTo = firstLine.from + markerMatch[0].length;
								calloutMarkRanges.push({ from: firstLine.from, to: markTo });
								inlineItems.push({
									from: firstLine.from,
									to: markTo,
									deco: Decoration.replace({
										widget: new CalloutIconWidget(rawType),
									}),
								});
							}
							return;
						}
						pushLine(from, to, "cm-live-quote");
						return;
					}
					case "Link":
					case "Autolink":
						inlineItems.push({
							from,
							to,
							deco: Decoration.mark({ class: "cm-live-link" }),
						});
						return;
					case "LinkMark":
					case "LinkTitle":
						if (
							!selectionTouches(
								state,
								node.node.parent?.from ?? from,
								node.node.parent?.to ?? to,
							)
						) {
							marks.push({ from, to });
						}
						return;
					case "URL":
						if (node.node.parent?.name === "Link") {
							if (
								!selectionTouches(
									state,
									node.node.parent.from,
									node.node.parent.to,
								)
							) {
								marks.push({ from, to });
							}
							return;
						}
						inlineItems.push({
							from,
							to,
							deco: Decoration.mark({ class: "cm-live-link" }),
						});
						return;
					case "Image": {
						const raw = state.doc.sliceString(from, to);
						const m = raw.match(/^!\[(.*?)\]\(([^)\s]+)[^)]*\)$/s);
						if (!m) return;
						const kind = mediaKindOf(m[2]);
						if (!kind) return;
						replacedBlocks.push({ from, to });
						const widget = new MediaWidget({
							src: resolveAssetUrl(m[2], options.noteRelPath),
							alt: m[1],
							kind,
							from,
							to,
							syntax: "markdown",
							noteRelPath: options.noteRelPath,
							onPreviewImage: options.onPreviewImage,
						});
						if (isSourceRevealed(from, to)) {
							pushLine(from, to, "cm-live-media-source-line");
							blockWidgets.push({
								from: to,
								to,
								deco: Decoration.widget({ widget, block: true, side: 1 }),
							});
							return;
						}
						blockWidgets.push({
							from,
							to,
							deco: Decoration.replace({ widget }),
						});
						return;
					}
					case "HorizontalRule":
						pushLine(from, to, "cm-live-hr");
						return;
					default:
						return;
				}
			},
		});
	}

	// ── 2. Frontmatter ───────────────────────────────────────────────────
	processFrontmatter(state, { replacedBlocks, blockWidgets, pushLine });

	// ── 3. Obsidian Dialects Regex Matching ──────────────────────────────
	processDialects(state, options, {
		marks,
		inlineItems,
		blockWidgets,
		replacedBlocks,
		codeBlockRanges,
		isSourceRevealed,
		pushLine,
	});

	// ── 4. Merge all decorations into RangeSetBuilder ────────────────────
	const builder = new RangeSetBuilder<Decoration>();
	const all: DecoItem[] = [
		...lineItems.map((l) => ({ from: l.pos, to: l.pos, deco: l.deco })),
		...inlineItems,
		...blockWidgets,
		...marks.map((m) => ({ from: m.from, to: m.to, deco: HIDE })),
	];
	all.sort(
		(a, b) =>
			a.from - b.from ||
			a.to - b.to ||
			(a.deco.startSide ?? 0) - (b.deco.startSide ?? 0),
	);
	for (const item of all) {
		if (item.to < item.from) continue;
		builder.add(item.from, item.to, item.deco);
	}
	return builder.finish();
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

export function livePreview(options: LivePreviewOptions = {}): Extension {
	return [mediaSourceField, createLivePreviewField(options)];
}
