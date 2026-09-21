import { syntaxTree } from "@codemirror/language";
import {
	type EditorState,
	type Extension,
	RangeSetBuilder,
	StateField,
	type Transaction,
} from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView } from "@codemirror/view";
import { DataviewWidget, extractDataviewQuery } from "./DataviewWidget";
import {
	type DecoItem,
	type HiddenMark,
	type LivePreviewOptions,
	lineTouchesSelection,
	processDialects,
	processFrontmatter,
	type Range,
	selectionTouches,
} from "./dialectDecorations";
import { externalLinkInteractions, parseExternalUrl } from "./externalLink";
import { MermaidWidget } from "./MermaidWidget";
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
	HorizontalRuleWidget,
	HtmlBlockWidget,
	InlineHtmlWidget,
	isVoidHtmlTag,
	TableWidget,
} from "./widgets";
import { followWikilinkTarget, wikilinkInteractions } from "./wikilink";

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
	// Ranges claimed by paired inline HTML (`<span>…</span>`); later nodes inside are skipped
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

	// 阅读视图下视为光标永不相交：所有语法标记保持渲染态；编辑视图下按光标所在行判定
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

	// ── 1. Lezer syntax tree traversal (Standard Markdown & GFM) ─────────
	for (const range of [{ from: 0, to: state.doc.length }]) {
		syntaxTree(state).iterate({
			from: range.from,
			to: range.to,
			enter(node) {
				if (inReplacedBlock(node.from, node.to)) return false;
				if (consumedHtml.some((r) => node.from >= r.from && node.to <= r.to))
					return false;
				const { from, to, name } = node;

				// Raw HTML block: rendered (sanitized) when cursor is outside
				if (name === "HTMLBlock") {
					if (!touches(from, to)) {
						const fromLine = state.doc.lineAt(from);
						const toLine = state.doc.lineAt(to);
						const blockFrom = fromLine.from;
						const blockTo = toLine.to;
						replacedBlocks.push({ from: blockFrom, to: blockTo });
						blockWidgets.push({
							from: blockFrom,
							to: blockTo,
							deco: Decoration.replace({
								widget: new HtmlBlockWidget(
									resolveHtmlAssetSrc(
										state.doc.sliceString(blockFrom, blockTo),
									),
								),
								block: true,
							}),
						});
					}
					return false;
				}

				// GFM Table: rendered as HTML table when cursor is outside
				if (name === "Table") {
					if (!touches(from, to)) {
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
						if (!lineTouches(line.from, line.to)) {
							// Lezer 的 HeaderMark 只覆盖 "#" 字符，不含其后空格；
							// 连空格一起隐藏，否则标题行会残留一个空格导致与正文左边缘错位
							let end = to;
							while (
								end < line.to &&
								/[ \t]/.test(state.doc.sliceString(end, end + 1))
							) {
								end++;
							}
							marks.push({ from, to: end });
						}
						return;
					}
					case "QuoteMark": {
						if (calloutMarkRanges.some((c) => from < c.to && to > c.from)) {
							return;
						}
						const line = state.doc.lineAt(from);
						if (!lineTouches(line.from, line.to)) {
							marks.push({ from, to });
						}
						return;
					}
					case "TaskMarker": {
						const line = state.doc.lineAt(from);
						if (!lineTouches(line.from, line.to)) {
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
						if (lineTouches(line.from, line.to)) return;
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
						if (!lineTouches(parent?.from ?? from, parent?.to ?? to)) {
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
							if (!touches(from, to)) {
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
						if (infoText === "mermaid") {
							if (!touches(from, to)) {
								const code = extractDataviewQuery(
									state.doc.sliceString(from, to),
								);
								replacedBlocks.push({ from, to });
								blockWidgets.push({
									from,
									to,
									deco: Decoration.replace({
										widget: new MermaidWidget(code),
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
							const startLine = state.doc.lineAt(from);
							const endLine = state.doc.lineAt(
								Math.max(from, Math.min(to, state.doc.length)),
							);
							for (let l = startLine.number; l <= endLine.number; l++) {
								const lineObj = state.doc.line(l);
								const classes = [
									"cm-live-callout",
									`cm-live-callout-${type}`,
									rawType !== type ? `cm-live-callout-${rawType}` : "",
									l === startLine.number ? "cm-live-callout-first" : "",
									l === endLine.number ? "cm-live-callout-last" : "",
								]
									.filter(Boolean)
									.join(" ");
								lineItems.push({
									pos: lineObj.from,
									deco: Decoration.line({ class: classes }),
								});
							}
							if (!lineTouches(firstLine.from, firstLine.to)) {
								const markTo = firstLine.from + markerMatch[0].length;
								calloutMarkRanges.push({ from: firstLine.from, to: markTo });
								inlineItems.push({
									from: firstLine.from,
									to: markTo,
									deco: Decoration.replace({
										widget: new CalloutIconWidget(rawType),
									}),
								});
								if (markTo < firstLine.to) {
									inlineItems.push({
										from: markTo,
										to: firstLine.to,
										deco: Decoration.mark({
											class: "cm-live-callout-title",
										}),
									});
								}
							}
							return;
						}
						pushLine(from, to, "cm-live-quote");
						return;
					}
					case "Link":
					case "Autolink": {
						const isExternal =
							parseExternalUrl(state.doc.sliceString(from, to), name) != null;
						const active = lineTouches(from, to);
						inlineItems.push({
							from,
							to,
							deco: Decoration.mark({
								class: [
									"cm-live-link",
									isExternal ? "cm-live-external-link" : "",
									active ? "cm-live-link-active" : "",
								]
									.filter(Boolean)
									.join(" "),
							}),
						});
						return;
					}
					case "LinkMark":
					case "LinkTitle":
						if (
							!lineTouches(
								node.node.parent?.from ?? from,
								node.node.parent?.to ?? to,
							)
						) {
							marks.push({ from, to });
						}
						return;
					case "URL":
						if (node.node.parent?.name === "Link") {
							if (!lineTouches(node.node.parent.from, node.node.parent.to)) {
								marks.push({ from, to });
							}
							return;
						}
						inlineItems.push({
							from,
							to,
							deco: Decoration.mark({
								class: "cm-live-link cm-live-external-link",
							}),
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
					case "HorizontalRule": {
						const line = state.doc.lineAt(from);
						if (!lineTouches(line.from, line.to)) {
							inlineItems.push({
								from: line.from,
								to: line.to,
								deco: Decoration.replace({
									widget: new HorizontalRuleWidget(),
								}),
							});
						} else {
							pushLine(line.from, line.to, "cm-live-hr-active");
						}
						return;
					}
					case "HTMLTag": {
						// Skip tags inside code spans/blocks
						for (let p = node.node.parent; p; p = p.parent) {
							if (
								p.name === "InlineCode" ||
								p.name === "CodeText" ||
								p.name === "FencedCode" ||
								p.name === "CodeBlock" ||
								p.name === "HTMLBlock"
							) {
								return;
							}
						}
						const tagText = state.doc.sliceString(from, to);
						const openMatch = tagText.match(/^<([a-zA-Z][\w-]*)[\s\S]*?\/?>$/);
						// Close tags / comments / declarations stay raw
						if (!openMatch || tagText.startsWith("</")) return;
						const tagName = (openMatch[1] ?? "").toLowerCase();

						// Self-closing / void tags render standalone
						if (tagText.endsWith("/>") || isVoidHtmlTag(tagName)) {
							if (lineTouches(from, to)) return;
							inlineItems.push({
								from,
								to,
								deco: Decoration.replace({
									widget: new InlineHtmlWidget(
										resolveHtmlAssetSrc(tagText),
										null,
									),
								}),
							});
							return;
						}

						// Pair with the matching close tag among following siblings
						let depth = 0;
						let closeFrom = -1;
						let closeTo = -1;
						for (let sib = node.node.nextSibling; sib; sib = sib.nextSibling) {
							if (sib.name !== "HTMLTag") continue;
							const sibText = state.doc.sliceString(sib.from, sib.to);
							const m = sibText.match(/^<(\/?)([a-zA-Z][\w-]*)/);
							if (!m || (m[2] ?? "").toLowerCase() !== tagName) continue;
							if (m[1] === "/") {
								if (depth === 0) {
									closeFrom = sib.from;
									closeTo = sib.to;
									break;
								}
								depth--;
							} else if (!sibText.endsWith("/>")) {
								depth++;
							}
						}
						if (closeTo < 0) return; // 未闭合 → 保留源码原文
						if (lineTouches(from, closeTo)) return;
						consumedHtml.push({ from, to: closeTo });
						inlineItems.push({
							from,
							to: closeTo,
							deco: Decoration.replace({
								widget: new InlineHtmlWidget(
									resolveHtmlAssetSrc(tagText),
									state.doc.sliceString(to, closeFrom),
								),
							}),
						});
						return;
					}
					default:
						return;
				}
			},
		});
	}

	// ── 2. Frontmatter ───────────────────────────────────────────────────
	processFrontmatter(state, {
		readingMode: options.readingMode,
		onFollowWikilink: (target) => void followWikilinkTarget(target, options),
		replacedBlocks,
		blockWidgets,
		pushLine,
	});

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
	// RangeSetBuilder 要求 (from, startSide) 字典序单调；from 相同时必须先比 startSide
	// 再比 to，否则阅读视图下所有装饰同时渲染时可能抛出排序错误
	all.sort(
		(a, b) =>
			a.from - b.from ||
			a.deco.startSide - b.deco.startSide ||
			a.to - b.to ||
			a.deco.endSide - b.deco.endSide,
	);
	for (const item of all) {
		if (item.to < item.from) continue;
		try {
			builder.add(item.from, item.to, item.deco);
		} catch (e) {
			const idx = all.indexOf(item);
			const dump = (it: (typeof all)[number] | undefined) =>
				it
					? {
							from: it.from,
							to: it.to,
							cls: it.deco.spec?.class,
							block: it.deco.spec?.block,
							widget: it.deco.spec?.widget?.constructor?.name,
							startSide: it.deco.startSide,
							endSide: it.deco.endSide,
						}
					: null;
			// 装饰层失败不应拖垮整个编辑器：跳过该项并记录，笔记仍可阅读/编辑
			console.error(
				"[livePreview] skip deco " +
					JSON.stringify({
						item: dump(item),
						prev: dump(all[idx - 1]),
						next: dump(all[idx + 1]),
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
	return [
		mediaSourceField,
		createLivePreviewField(options),
		wikilinkInteractions(options),
		externalLinkInteractions(options),
	];
}
