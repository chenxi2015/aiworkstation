import { EditorSelection, type EditorState } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";

/**
 * Markdown 行内/块级格式命令（供快捷键与右键菜单复用）：
 * 行为对齐 Obsidian —— 有选区包裹/解包裹，无选区插入标记符并把光标放中间。
 */

export type InlineFormat = "bold" | "italic" | "code" | "strike" | "highlight";
export type BlockFormat =
	| "h1"
	| "h2"
	| "h3"
	| "quote"
	| "bullet"
	| "ordered"
	| "task";

const INLINE_MARKS: Record<InlineFormat, string> = {
	bold: "**",
	italic: "*",
	code: "`",
	strike: "~~",
	highlight: "==",
};

/** 判断 from/to 两侧是否恰好被 mark 包裹（italic 需排除命中 bold 的 `**`） */
function isWrapped(
	state: EditorState,
	from: number,
	to: number,
	mark: string,
): boolean {
	const len = mark.length;
	if (from < len || to + len > state.doc.length) return false;
	if (state.doc.sliceString(from - len, from) !== mark) return false;
	if (state.doc.sliceString(to, to + len) !== mark) return false;
	if (mark === "*") {
		// `**text**` 的两端也是 `*`，但那是 bold，不算 italic 包裹
		if (state.doc.sliceString(from - 2, from) === "**") return false;
		if (state.doc.sliceString(to, to + 2) === "**") return false;
	}
	return true;
}

export function toggleInlineFormat(
	view: EditorView,
	format: InlineFormat,
): boolean {
	if (view.state.readOnly) return false;
	const mark = INLINE_MARKS[format];
	const len = mark.length;
	const { state } = view;
	const changes: { from: number; to: number; insert: string }[] = [];
	const newRanges: { anchor: number; head: number }[] = [];

	for (const range of state.selection.ranges) {
		const { from, to } = range;
		if (range.empty) {
			// 无选区：插入标记符，光标居中
			changes.push({ from, to, insert: mark + mark });
			newRanges.push({ anchor: from + len, head: from + len });
			continue;
		}
		const selected = state.doc.sliceString(from, to);
		if (isWrapped(state, from, to, mark)) {
			// 已被包裹 → 去掉外层标记
			changes.push({ from: from - len, to: from, insert: "" });
			changes.push({ from: to, to: to + len, insert: "" });
			newRanges.push({ anchor: from - len, head: to - len });
		} else if (
			selected.startsWith(mark) &&
			selected.endsWith(mark) &&
			selected.length > len * 2
		) {
			// 选区内自带标记 → 去掉
			changes.push({ from, to: from + len, insert: "" });
			changes.push({ from: to - len, to, insert: "" });
			newRanges.push({ anchor: from, head: to - len * 2 });
		} else {
			changes.push({ from, to, insert: mark + selected + mark });
			newRanges.push({ anchor: from + len, head: to + len });
		}
	}

	view.dispatch({
		changes,
		selection: EditorSelection.create(
			newRanges.map((r) => EditorSelection.range(r.anchor, r.head)),
		),
	});
	view.focus();
	return true;
}

export function insertLink(view: EditorView): boolean {
	if (view.state.readOnly) return false;
	const range = view.state.selection.main;
	const selected = view.state.sliceDoc(range.from, range.to);
	if (range.empty) {
		const insert = "[]()";
		view.dispatch({
			changes: { from: range.from, insert },
			selection: { anchor: range.from + 1 },
		});
	} else if (/^https?:\/\/\S+$/.test(selected)) {
		// 选中的是 URL：作为链接目标，光标落在标题处
		const insert = `[](${selected})`;
		view.dispatch({
			changes: { from: range.from, to: range.to, insert },
			selection: { anchor: range.from + 1 },
		});
	} else {
		const insert = `[${selected}]()`;
		view.dispatch({
			changes: { from: range.from, to: range.to, insert },
			selection: { anchor: range.from + insert.length - 1 },
		});
	}
	view.focus();
	return true;
}

/** 清除选区内的行内格式标记（无选区时作用于当前行） */
export function clearFormatting(view: EditorView): boolean {
	if (view.state.readOnly) return false;
	const { state } = view;
	const range = state.selection.main;
	const target =
		range.empty && range.from <= state.doc.length
			? state.doc.lineAt(range.from)
			: { from: range.from, to: range.to };
	const text = state.doc.sliceString(target.from, target.to);
	const cleaned = text
		.replace(/(\*\*|__)(.*?)\1/g, "$2")
		.replace(/(\*|_)([^*_]+?)\1/g, "$2")
		.replace(/~~(.*?)~~/g, "$1")
		.replace(/==(.*?)==/g, "$1")
		.replace(/`([^`]+?)`/g, "$1")
		.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");
	if (cleaned === text) return false;
	view.dispatch({
		changes: { from: target.from, to: target.to, insert: cleaned },
		selection: { anchor: target.from },
	});
	view.focus();
	return true;
}

const BLOCK_PREFIX: Record<BlockFormat, RegExp | null> = {
	h1: null,
	h2: null,
	h3: null,
	quote: /^>\s?/,
	bullet: /^[-+*]\s+/,
	ordered: /^\d+[.)]\s+/,
	task: /^[-+*]\s+\[[ xX]\]\s+/,
};

function blockPrefixText(format: BlockFormat): string {
	switch (format) {
		case "h1":
			return "# ";
		case "h2":
			return "## ";
		case "h3":
			return "### ";
		case "quote":
			return "> ";
		case "bullet":
			return "- ";
		case "ordered":
			return "1. ";
		case "task":
			return "- [ ] ";
	}
}

/** 块级格式切换：作用于选区覆盖的所有行，已是目标格式则移除前缀（toggle） */
export function toggleBlockFormat(
	view: EditorView,
	format: BlockFormat,
): boolean {
	if (view.state.readOnly) return false;
	const { state } = view;
	const range = state.selection.main;
	const startLine = state.doc.lineAt(range.from);
	const endLine = state.doc.lineAt(Math.min(range.to, state.doc.length));
	const headingRe = /^#{1,6}\s+/;
	const newPrefix = blockPrefixText(format);
	const changes: { from: number; to: number; insert: string }[] = [];

	// 先判断所有行是否已是目标格式（决定整体是加还是减）
	let allMatch = true;
	for (let n = startLine.number; n <= endLine.number; n++) {
		const line = state.doc.line(n);
		if (!line.text.trim()) continue;
		const current =
			format === "h1" || format === "h2" || format === "h3"
				? headingRe.test(line.text) &&
					line.text.match(headingRe)?.[0].trim().length ===
						Number(format.slice(1))
				: BLOCK_PREFIX[format]?.test(line.text);
		if (!current) {
			allMatch = false;
			break;
		}
	}

	for (let n = startLine.number; n <= endLine.number; n++) {
		const line = state.doc.line(n);
		if (!line.text.trim()) continue;
		const headingMatch = line.text.match(headingRe);
		if (allMatch) {
			// 移除目标前缀
			const re =
				format === "h1" || format === "h2" || format === "h3"
					? headingRe
					: BLOCK_PREFIX[format];
			const m = re ? line.text.match(re) : null;
			if (m)
				changes.push({
					from: line.from,
					to: line.from + m[0].length,
					insert: "",
				});
		} else {
			// 先剥离同类前缀再套目标前缀（标题之间互转、列表类型互转）
			const from = line.from;
			let to = line.from;
			if (headingMatch) {
				to = line.from + headingMatch[0].length;
			} else {
				// 注意顺序：task 先于 bullet，避免 `- [ ] ` 被 `- ` 截断
				const stripOrder = [
					BLOCK_PREFIX.task,
					BLOCK_PREFIX.quote,
					BLOCK_PREFIX.ordered,
					BLOCK_PREFIX.bullet,
				];
				for (const re of stripOrder) {
					if (!re) continue;
					const m = line.text.match(re);
					if (m) {
						to = line.from + m[0].length;
						break;
					}
				}
			}
			changes.push({ from, to, insert: newPrefix });
		}
	}

	if (!changes.length) return false;
	view.dispatch({ changes });
	view.focus();
	return true;
}
