import { EditorSelection, type Extension, Prec } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";

/**
 * Specification for markdown & bracket auto-pairing rules
 */
export interface AutoPairRule {
	/** Rule identifier */
	name: string;
	/** Single-character triggers (open or close keys) */
	triggers: string[];
	/** Exact multi-character triggers (e.g. "[[" or "**") */
	multiTriggers?: string[];
	/** Opening marker */
	open: string;
	/** Closing marker */
	close: string;
	/** Maximum level for escalation (e.g. 2 for [[, 3 for ***) */
	maxLevel: number;
}

/**
 * Complete Markdown and bracket auto-pair rules table
 */
export const AUTO_PAIR_RULES: AutoPairRule[] = [
	// 1. Wikilink / Link: [text] -> [[text]]
	{
		name: "wikilink",
		triggers: ["[", "]"],
		multiTriggers: ["[[", "]]"],
		open: "[",
		close: "]",
		maxLevel: 2,
	},
	// 2. Bold / Italic / Bold-Italic: *text* -> **text** -> ***text***
	{
		name: "asterisk",
		triggers: ["*"],
		multiTriggers: ["**", "***"],
		open: "*",
		close: "*",
		maxLevel: 3,
	},
	// 3. Underscore Italic / Bold: _text_ -> __text__
	{
		name: "underscore",
		triggers: ["_"],
		multiTriggers: ["__"],
		open: "_",
		close: "_",
		maxLevel: 2,
	},
	// 4. Highlight (Obsidian style): =text= -> ==text==
	{
		name: "highlight",
		triggers: ["="],
		multiTriggers: ["=="],
		open: "=",
		close: "=",
		maxLevel: 2,
	},
	// 5. Strikethrough: ~text~ -> ~~text~~
	{
		name: "strikethrough",
		triggers: ["~"],
		multiTriggers: ["~~"],
		open: "~",
		close: "~",
		maxLevel: 2,
	},
	// 6. LaTeX Math: $text$ -> $$text$$
	{
		name: "math",
		triggers: ["$"],
		multiTriggers: ["$$"],
		open: "$",
		close: "$",
		maxLevel: 2,
	},
	// 7. Inline code & code block: `text` -> ```text```
	{
		name: "code",
		triggers: ["`"],
		multiTriggers: ["```"],
		open: "`",
		close: "`",
		maxLevel: 3,
	},
	// 8. Parentheses: (text)
	{
		name: "parentheses",
		triggers: ["(", ")"],
		open: "(",
		close: ")",
		maxLevel: 1,
	},
	// 9. Curly braces: {text}
	{
		name: "braces",
		triggers: ["{", "}"],
		open: "{",
		close: "}",
		maxLevel: 1,
	},
	// 10. Angle brackets / HTML tags: <text>
	{
		name: "angle-brackets",
		triggers: ["<", ">"],
		open: "<",
		close: ">",
		maxLevel: 1,
	},
	// 11. Double quotes: "text"
	{
		name: "double-quotes",
		triggers: ['"'],
		open: '"',
		close: '"',
		maxLevel: 1,
	},
	// 12. Single quotes: 'text'
	{
		name: "single-quotes",
		triggers: ["'"],
		open: "'",
		close: "'",
		maxLevel: 1,
	},
	// 13. Chinese full-width book marks: 《text》
	{
		name: "cn-book-marks",
		triggers: ["《", "》"],
		open: "《",
		close: "》",
		maxLevel: 1,
	},
	// 14. Chinese full-width parentheses: （text）
	{
		name: "cn-parentheses",
		triggers: ["（", "）"],
		open: "（",
		close: "）",
		maxLevel: 1,
	},
	// 15. Chinese full-width brackets: 【text】
	{
		name: "cn-brackets",
		triggers: ["【", "】"],
		open: "【",
		close: "】",
		maxLevel: 1,
	},
	// 16. Chinese full-width double quotes: “text”
	{
		name: "cn-double-quotes",
		triggers: ["“", "”"],
		open: "“",
		close: "”",
		maxLevel: 1,
	},
	// 17. Chinese full-width single quotes: ‘text’
	{
		name: "cn-single-quotes",
		triggers: ["‘", "’"],
		open: "‘",
		close: "’",
		maxLevel: 1,
	},
];

/**
 * Detect how many matching open/close markers surround the selection [from, to]
 */
function getSurroundingLevel(
	doc: { sliceString: (from: number, to: number) => string; length: number },
	from: number,
	to: number,
	openChar: string,
	closeChar: string,
	maxLevel: number,
): number {
	const openLen = openChar.length;
	const closeLen = closeChar.length;
	let level = 0;

	while (level < maxLevel) {
		const nextLevel = level + 1;
		const startPos = from - nextLevel * openLen;
		const endPos = to + nextLevel * closeLen;

		if (startPos < 0 || endPos > doc.length) break;

		const leftSlice = doc.sliceString(startPos, from);
		const rightSlice = doc.sliceString(to, endPos);

		if (
			leftSlice === openChar.repeat(nextLevel) &&
			rightSlice === closeChar.repeat(nextLevel)
		) {
			level = nextLevel;
		} else {
			break;
		}
	}

	return level;
}

/**
 * Match an input text against the auto-pair rules table
 */
function findMatchingRule(
	text: string,
): { rule: AutoPairRule; isMulti: boolean } | null {
	for (const rule of AUTO_PAIR_RULES) {
		if (rule.multiTriggers?.includes(text)) {
			return { rule, isMulti: true };
		}
		if (rule.triggers.includes(text)) {
			return { rule, isMulti: false };
		}
	}
	return null;
}

/**
 * Handle wrapping selections with paired Markdown syntax or brackets
 */
function handleSelectionWrap(
	view: EditorView,
	matched: { rule: AutoPairRule; isMulti: boolean },
): boolean {
	const { rule, isMulti } = matched;
	const { state } = view;
	const changes: { from: number; to: number; insert: string }[] = [];
	const newRanges: { anchor: number; head: number }[] = [];

	// Track offset accumulator for accurate cursor position mapping
	const rangeMappings: { originalIndex: number; from: number; to: number }[] =
		[];

	for (let i = 0; i < state.selection.ranges.length; i++) {
		const range = state.selection.ranges[i];
		if (range.empty) continue;

		const { from, to } = range;
		const currentLevel = getSurroundingLevel(
			state.doc,
			from,
			to,
			rule.open,
			rule.close,
			rule.maxLevel,
		);

		let openToInsert = rule.open;
		let closeToInsert = rule.close;

		if (isMulti) {
			// Direct multi-character insertion (e.g. typing "[[" or "**" at once)
			const targetLevel = rule.maxLevel;
			const needed = Math.max(1, targetLevel - currentLevel);
			openToInsert = rule.open.repeat(needed);
			closeToInsert = rule.close.repeat(needed);
		} else if (currentLevel >= rule.maxLevel) {
			// Reached max escalation limit, ignore or allow standard replacement
			return false;
		}

		// Insert open before selection and close after selection
		changes.push({ from, to: from, insert: openToInsert });
		changes.push({ from: to, to, insert: closeToInsert });

		rangeMappings.push({
			originalIndex: i,
			from,
			to,
		});
	}

	if (changes.length === 0) return false;

	// Execute transaction atomically
	view.dispatch({
		changes,
		userEvent: "input.wrap",
	});

	// Recompute selection ranges to keep the inner text selected
	// In the new document, the selection shifts by the length of prepended open markers
	let currentOffset = 0;
	// Sort changes ascending to calculate shifts
	const ascendingChanges = [...changes].sort((a, b) => a.from - b.from);
	const changePositions = new Map<number, number>();

	for (const change of ascendingChanges) {
		changePositions.set(change.from, change.insert.length);
	}

	for (const mapping of rangeMappings) {
		const openLen =
			changePositions.get(mapping.from) ??
			(isMulti ? rule.open.length * 2 : rule.open.length);
		// Cumulative offset for previously inserted characters
		const anchor = mapping.from + openLen + currentOffset;
		const head = mapping.to + openLen + currentOffset;
		newRanges.push({ anchor, head });
		currentOffset += openLen + (changePositions.get(mapping.to) ?? openLen);
	}

	view.dispatch({
		selection: EditorSelection.create(
			newRanges.map((r) => EditorSelection.range(r.anchor, r.head)),
		),
	});

	return true;
}

/**
 * Handle auto-closing empty brackets when typing "[[" without selection
 */
function handleEmptyWikilinkAutoPair(
	view: EditorView,
	from: number,
	to: number,
	text: string,
): boolean {
	if (text !== "[" && text !== "[[") return false;

	const { state } = view;
	if (text === "[[") {
		// Type "[[" directly: insert "[[]]" and place cursor inside
		view.dispatch({
			changes: { from, to, insert: "[[]]" },
			selection: { anchor: from + 2 },
			userEvent: "input.autopair",
		});
		return true;
	}

	// Check if previous character is already "["
	if (from > 0 && state.doc.sliceString(from - 1, from) === "[") {
		const charAfter = state.doc.sliceString(to, to + 2);
		// Don't auto-close if already followed by "]]"
		if (charAfter === "]]") {
			view.dispatch({
				changes: { from, to, insert: "[" },
				selection: { anchor: from + 1 },
				userEvent: "input.autopair",
			});
			return true;
		}

		view.dispatch({
			changes: { from, to, insert: "[]]" },
			selection: { anchor: from + 1 },
			userEvent: "input.autopair",
		});
		return true;
	}

	return false;
}

/**
 * Pairs of symmetric or opening-closing characters that should be deleted together on Backspace
 */
const BACKSPACE_PAIRS: [string, string][] = [
	["[[", "]]"],
	["[", "]"],
	["**", "**"],
	["*", "*"],
	["__", "__"],
	["_", "_"],
	["==", "=="],
	["=", "="],
	["~~", "~~"],
	["~", "~"],
	["$$", "$$"],
	["$", "$"],
	["`", "`"],
	["(", ")"],
	["{", "}"],
	['"', '"'],
	["'", "'"],
	["《", "》"],
	["（", "）"],
	["【", "】"],
	["“", "”"],
	["‘", "’"],
];

/**
 * Backspace handler to delete paired markers when cursor is right in the middle
 */
function handleBackspacePair(view: EditorView): boolean {
	const { state } = view;
	if (state.readOnly) return false;

	const mainSel = state.selection.main;
	if (!mainSel.empty) return false;

	const pos = mainSel.from;
	const doc = state.doc;

	for (const [open, close] of BACKSPACE_PAIRS) {
		const openLen = open.length;
		const closeLen = close.length;

		if (pos >= openLen && pos + closeLen <= doc.length) {
			const before = doc.sliceString(pos - openLen, pos);
			const after = doc.sliceString(pos, pos + closeLen);

			if (before === open && after === close) {
				view.dispatch({
					changes: {
						from: pos - openLen,
						to: pos + closeLen,
						insert: "",
					},
					selection: { anchor: pos - openLen },
					userEvent: "delete.autopair",
				});
				return true;
			}
		}
	}

	return false;
}

/**
 * Main CodeMirror 6 extension for Obsidian-styled Markdown auto-pairing and selection wrapping
 */
export function markdownAutoPair(): Extension {
	return [
		EditorView.inputHandler.of((view, from, to, text) => {
			if (view.state.readOnly || !view.state.facet(EditorView.editable)) {
				return false;
			}

			// Case 1: Active selection exists (Selection Wrapping)
			const hasSelection = view.state.selection.ranges.some((r) => !r.empty);
			if (hasSelection) {
				const matched = findMatchingRule(text);
				if (matched) {
					return handleSelectionWrap(view, matched);
				}
			}

			// Case 2: No selection, typing [[ auto-close to [[]]
			const allEmpty = view.state.selection.ranges.every((r) => r.empty);
			if (allEmpty) {
				if (handleEmptyWikilinkAutoPair(view, from, to, text)) {
					return true;
				}
			}

			return false;
		}),
		Prec.high(
			keymap.of([
				{
					key: "Backspace",
					run: handleBackspacePair,
				},
			]),
		),
	];
}
