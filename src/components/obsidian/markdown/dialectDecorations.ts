import type { EditorState } from "@codemirror/state";
import { Decoration } from "@codemirror/view";
import { MediaWidget, mediaKindOf, resolveAssetUrl } from "./mediaWidget";
import { FrontmatterWidget, MathWidget } from "./widgets";

export interface Range {
	from: number;
	to: number;
}

export interface DecoItem {
	from: number;
	to: number;
	deco: Decoration;
}

export interface HiddenMark {
	from: number;
	to: number;
}

export interface LivePreviewOptions {
	/** Note relative path within vault root */
	noteRelPath?: string;
	/** Image click preview callback */
	onPreviewImage?: (data: { src: string; alt: string }) => void;
	/** Note navigation link callback */
	onNavigateNote?: (relPath: string) => void;
	/** 双链目标不存在时的新建回调（name 不含 .md 后缀） */
	onCreateNote?: (name: string) => void;
}

/** Check if current selection overlaps with [from, to] */
export function selectionTouches(
	state: EditorState,
	from: number,
	to: number,
): boolean {
	return state.selection.ranges.some((r) => from <= r.to && to >= r.from);
}

/** Process YAML frontmatter: show props panel when cursor is outside, gray out lines when inside */
export function processFrontmatter(
	state: EditorState,
	ctx: {
		replacedBlocks: Range[];
		blockWidgets: DecoItem[];
		pushLine: (from: number, to: number, cls: string) => void;
	},
) {
	if (state.doc.line(1).text.trim() === "---") {
		let endLineNo = -1;
		for (let lineNo = 2; lineNo <= Math.min(state.doc.lines, 200); lineNo++) {
			if (state.doc.line(lineNo).text.trim() === "---") {
				endLineNo = lineNo;
				break;
			}
		}
		if (endLineNo > 0) {
			const blockTo = state.doc.line(endLineNo).to;
			if (!selectionTouches(state, 0, blockTo)) {
				const yamlText = state.doc.sliceString(
					state.doc.line(2).from,
					state.doc.line(endLineNo).from,
				);
				ctx.replacedBlocks.push({ from: 0, to: blockTo });
				ctx.blockWidgets.push({
					from: 0,
					to: blockTo,
					deco: Decoration.replace({
						widget: new FrontmatterWidget(yamlText),
						block: true,
					}),
				});
			} else {
				for (let lineNo = 1; lineNo <= endLineNo; lineNo++) {
					const line = state.doc.line(lineNo);
					ctx.pushLine(line.from, line.from, "cm-live-frontmatter");
				}
			}
		}
	}
}

const DIALECT_PATTERNS: Array<{ regex: RegExp; cls: string }> = [
	{
		regex: /(?<![\w\p{L}\p{N}/])#[\p{L}\p{N}_][\p{L}\p{N}_/-]*/gu,
		cls: "cm-live-tag",
	},
];

/** Process Obsidian-specific syntax dialects using regex matching */
export function processDialects(
	state: EditorState,
	options: LivePreviewOptions,
	ctx: {
		marks: HiddenMark[];
		inlineItems: DecoItem[];
		blockWidgets: DecoItem[];
		replacedBlocks: Range[];
		codeBlockRanges: Range[];
		isSourceRevealed: (from: number, to: number) => boolean;
		pushLine: (from: number, to: number, cls: string) => void;
	},
) {
	// Collect inline code ranges to avoid matching # tags / math inside code
	const codeRanges: Range[] = [];
	for (const item of ctx.inlineItems) {
		if (item.deco.spec?.class === "cm-live-incode") {
			codeRanges.push({ from: item.from, to: item.to });
		}
	}

	const skipRanges: Range[] = [...codeRanges, ...ctx.codeBlockRanges];
	const inCode = (from: number, to: number) =>
		skipRanges.some((c) => from < c.to && to > c.from);
	const inReplacedBlock = (from: number, to: number) =>
		ctx.replacedBlocks.some((b) => from < b.to && to > b.from);

	for (const range of [{ from: 0, to: state.doc.length }]) {
		const text = state.doc.sliceString(range.from, range.to);

		// ![[embedded media]]: render images/audio/videos
		const embedRe = /!\[\[([^\]\n]+)\]\]/g;
		let embedMatch = embedRe.exec(text);
		while (embedMatch) {
			const from = range.from + embedMatch.index;
			const raw = embedMatch[0];
			const inner = embedMatch[1] ?? "";
			const to = from + raw.length;
			embedMatch = embedRe.exec(text);
			if (inCode(from, to) || inReplacedBlock(from, to)) continue;
			// Strip size |width and anchor #heading
			const target = inner.split("|")[0]?.split("#")[0]?.trim() ?? "";
			const kind = mediaKindOf(target);
			if (!target || !kind) continue;
			ctx.replacedBlocks.push({ from, to });
			const widget = new MediaWidget({
				src: resolveAssetUrl(target, options.noteRelPath),
				alt: target,
				kind,
				from,
				to,
				syntax: "wiki",
				noteRelPath: options.noteRelPath,
				onPreviewImage: options.onPreviewImage,
			});
			if (ctx.isSourceRevealed(from, to)) {
				ctx.pushLine(from, to, "cm-live-media-source-line");
				ctx.blockWidgets.push({
					from: to,
					to,
					deco: Decoration.widget({ widget, block: true, side: 1 }),
				});
				continue;
			}
			ctx.blockWidgets.push({
				from,
				to,
				deco: Decoration.replace({ widget }),
			});
		}

		// Tags
		for (const { regex, cls } of DIALECT_PATTERNS) {
			regex.lastIndex = 0;
			let match = regex.exec(text);
			while (match) {
				const from = range.from + match.index;
				const to = from + match[0].length;
				if (!inCode(from, to) && !inReplacedBlock(from, to)) {
					ctx.inlineItems.push({
						from,
						to,
						deco: Decoration.mark({ class: cls }),
					});
				}
				match = regex.exec(text);
			}
		}

		// [[Wikilinks]]
		const wikilinkRe = /(?<!!)\[\[([^\]\n]+)\]\]/g;
		let wikilinkMatch = wikilinkRe.exec(text);
		while (wikilinkMatch) {
			const from = range.from + wikilinkMatch.index;
			const to = from + wikilinkMatch[0].length;
			const inner = wikilinkMatch[1] ?? "";
			wikilinkMatch = wikilinkRe.exec(text);
			if (inCode(from, to) || inReplacedBlock(from, to)) continue;
			ctx.inlineItems.push({
				from,
				to,
				deco: Decoration.mark({ class: "cm-live-wikilink" }),
			});
			if (selectionTouches(state, from, to)) continue;
			const aliasIdx = inner.indexOf("|");
			const hidePrefixTo = aliasIdx >= 0 ? from + 2 + aliasIdx + 1 : from + 2;
			ctx.marks.push({ from, to: hidePrefixTo });
			ctx.marks.push({ from: to - 2, to });
		}

		// ==Highlight==
		const highlightRe = /==[^=\n]+==/g;
		let highlightMatch = highlightRe.exec(text);
		while (highlightMatch) {
			const from = range.from + highlightMatch.index;
			const to = from + highlightMatch[0].length;
			highlightMatch = highlightRe.exec(text);
			if (inCode(from, to) || inReplacedBlock(from, to)) continue;
			ctx.inlineItems.push({
				from,
				to,
				deco: Decoration.mark({ class: "cm-live-highlight" }),
			});
			if (selectionTouches(state, from, to)) continue;
			ctx.marks.push({ from, to: from + 2 });
			ctx.marks.push({ from: to - 2, to });
		}

		// %%Comments%%
		const commentRe = /%%[\s\S]*?%%/g;
		let commentMatch = commentRe.exec(text);
		while (commentMatch) {
			const from = range.from + commentMatch.index;
			const to = from + commentMatch[0].length;
			commentMatch = commentRe.exec(text);
			if (inCode(from, to) || inReplacedBlock(from, to)) continue;
			skipRanges.push({ from, to });
			if (selectionTouches(state, from, to)) {
				ctx.inlineItems.push({
					from,
					to,
					deco: Decoration.mark({ class: "cm-live-comment" }),
				});
			} else {
				ctx.marks.push({ from, to });
			}
		}

		// Block math $$...$$
		const blockMathRe = /\$\$([\s\S]+?)\$\$/g;
		let blockMathMatch = blockMathRe.exec(text);
		while (blockMathMatch) {
			const from = range.from + blockMathMatch.index;
			const to = from + blockMathMatch[0].length;
			const tex = (blockMathMatch[1] ?? "").trim();
			blockMathMatch = blockMathRe.exec(text);
			if (inCode(from, to) || inReplacedBlock(from, to) || !tex) continue;
			skipRanges.push({ from, to });
			if (selectionTouches(state, from, to)) continue;
			ctx.blockWidgets.push({
				from,
				to,
				deco: Decoration.replace({
					widget: new MathWidget(tex, true),
					block: true,
				}),
			});
		}

		// Inline math $...$
		const inlineMathRe = /\$(?!\s|\$)([^\n$]+?)(?<!\s)\$(?!\d|\$)/g;
		let inlineMathMatch = inlineMathRe.exec(text);
		while (inlineMathMatch) {
			const from = range.from + inlineMathMatch.index;
			const to = from + inlineMathMatch[0].length;
			const tex = inlineMathMatch[1] ?? "";
			inlineMathMatch = inlineMathRe.exec(text);
			if (inCode(from, to) || inReplacedBlock(from, to) || !tex) continue;
			skipRanges.push({ from, to });
			if (selectionTouches(state, from, to)) continue;
			ctx.inlineItems.push({
				from,
				to,
				deco: Decoration.replace({ widget: new MathWidget(tex, false) }),
			});
		}

		// Footnotes [^key]
		const footnoteRe = /\[\^[^\]\n]+\]/g;
		let footnoteMatch = footnoteRe.exec(text);
		while (footnoteMatch) {
			const from = range.from + footnoteMatch.index;
			const to = from + footnoteMatch[0].length;
			footnoteMatch = footnoteRe.exec(text);
			if (inCode(from, to) || inReplacedBlock(from, to)) continue;
			ctx.inlineItems.push({
				from,
				to,
				deco: Decoration.mark({ class: "cm-live-footnote" }),
			});
		}
	}
}
