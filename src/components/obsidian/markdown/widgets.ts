import { type EditorView, WidgetType } from "@codemirror/view";
import katex from "katex";
import { markdownToHtml } from "../../editor/markdown";

export const HEADING_CLASSES: Record<string, string> = {
	ATXHeading1: "cm-live-h1",
	ATXHeading2: "cm-live-h2",
	ATXHeading3: "cm-live-h3",
	ATXHeading4: "cm-live-h4",
	ATXHeading5: "cm-live-h5",
	ATXHeading6: "cm-live-h6",
	SetextHeading1: "cm-live-h1",
	SetextHeading2: "cm-live-h2",
};

/** Table block widget: rendered as HTML table when cursor is outside */
export class TableWidget extends WidgetType {
	constructor(readonly source: string) {
		super();
	}

	override eq(other: TableWidget) {
		return other.source === this.source;
	}

	override toDOM() {
		const div = document.createElement("div");
		div.className = "cm-live-table";
		div.innerHTML = markdownToHtml(this.source);
		return div;
	}
}

export interface PropEntry {
	key: string;
	values: string[];
}

function cleanYamlScalar(value: string): string {
	const trimmed = value.trim();
	const quoted = trimmed.match(/^(["'])(.*)\1$/);
	return quoted ? (quoted[2] ?? "") : trimmed;
}

/** Lightweight YAML subset parser (key: value / inline list / dash list) */
export function parseYamlProps(yaml: string): PropEntry[] {
	const entries: PropEntry[] = [];
	let current: PropEntry | null = null;
	for (const rawLine of yaml.split("\n")) {
		const line = rawLine.replace(/\s+$/, "");
		if (!line.trim() || line.trim().startsWith("#")) continue;
		const listItem = line.match(/^\s+-\s+(.*)$/);
		if (listItem && current) {
			current.values.push(cleanYamlScalar(listItem[1] ?? ""));
			continue;
		}
		const kv = line.match(/^([^\s:#][^:]*):\s*(.*)$/);
		if (kv) {
			current = { key: (kv[1] ?? "").trim(), values: [] };
			entries.push(current);
			const value = (kv[2] ?? "").trim();
			if (!value) continue;
			const inlineArr = value.match(/^\[(.*)\]$/);
			if (inlineArr) {
				for (const part of (inlineArr[1] ?? "").split(",")) {
					const v = cleanYamlScalar(part);
					if (v) current.values.push(v);
				}
			} else {
				current.values.push(cleanYamlScalar(value));
			}
		}
	}
	return entries;
}

/** Frontmatter properties panel widget */
export class FrontmatterWidget extends WidgetType {
	constructor(readonly yamlText: string) {
		super();
	}

	override eq(other: FrontmatterWidget) {
		return other.yamlText === this.yamlText;
	}

	override toDOM(view: EditorView) {
		const wrap = document.createElement("div");
		wrap.className = "cm-live-props";
		const entries = parseYamlProps(this.yamlText);
		if (!entries.length) {
			const empty = document.createElement("div");
			empty.className = "cm-live-props-row cm-live-props-empty";
			empty.textContent = "笔记属性";
			wrap.appendChild(empty);
		}
		for (const entry of entries) {
			const row = document.createElement("div");
			row.className = "cm-live-props-row";
			const key = document.createElement("span");
			key.className = "cm-live-props-key";
			key.textContent = entry.key;
			row.appendChild(key);
			const val = document.createElement("span");
			val.className = "cm-live-props-val";
			if (!entry.values.length) {
				const emptyVal = document.createElement("span");
				emptyVal.className = "cm-live-props-empty-val";
				emptyVal.textContent = "空";
				val.appendChild(emptyVal);
			}
			for (const v of entry.values) {
				const wikilink = v.match(/^\[\[([^\]]+)\]\]$/);
				const chip = document.createElement("span");
				if (wikilink) {
					chip.className = "cm-live-wikilink cm-live-props-link";
					chip.textContent = (wikilink[1] ?? "").split("|").pop() ?? v;
				} else {
					chip.className = "cm-live-props-chip";
					chip.textContent = v;
				}
				val.appendChild(chip);
			}
			row.appendChild(val);
			wrap.appendChild(row);
		}
		// Click properties panel: move selection to start of frontmatter block
		wrap.addEventListener("mousedown", (e) => {
			e.preventDefault();
			view.dispatch({ selection: { anchor: 0 } });
			view.focus();
		});
		return wrap;
	}

	override ignoreEvent() {
		return true;
	}
}

/** Task list checkbox widget: clicking toggles [ ] <-> [x] in doc */
export class CheckboxWidget extends WidgetType {
	constructor(
		readonly checked: boolean,
		readonly markerFrom: number,
	) {
		super();
	}

	override eq(other: CheckboxWidget) {
		return (
			other.checked === this.checked && other.markerFrom === this.markerFrom
		);
	}

	override toDOM(view: EditorView) {
		const checkbox = document.createElement("input");
		checkbox.type = "checkbox";
		checkbox.checked = this.checked;
		checkbox.className = "cm-live-checkbox";
		checkbox.tabIndex = -1;
		checkbox.addEventListener("mousedown", (e) => e.preventDefault());
		checkbox.addEventListener("click", (e) => {
			e.preventDefault();
			// TaskMarker text is [ ] or [x], inner character is at markerFrom + 1
			const from = this.markerFrom + 1;
			if (from + 1 > view.state.doc.length) return;
			view.dispatch({
				changes: { from, to: from + 1, insert: this.checked ? " " : "x" },
			});
		});
		return checkbox;
	}
}

/** Unordered list bullet widget (`-` rendered as bullet •) */
export class BulletWidget extends WidgetType {
	override eq() {
		return true;
	}

	override toDOM() {
		const span = document.createElement("span");
		span.className = "cm-live-bullet";
		span.textContent = "•";
		return span;
	}
}

export const CALLOUT_ICONS: Record<string, string> = {
	note: "📝",
	info: "ℹ️",
	todo: "☑️",
	tip: "💡",
	hint: "💡",
	important: "❗",
	success: "✅",
	check: "✅",
	done: "✅",
	question: "❓",
	help: "❓",
	faq: "❓",
	warning: "⚠️",
	caution: "⚠️",
	attention: "⚠️",
	failure: "❌",
	fail: "❌",
	missing: "❌",
	danger: "⛔",
	error: "⛔",
	bug: "🐛",
	example: "🔍",
	quote: "💬",
	cite: "💬",
	abstract: "📋",
	summary: "📋",
	tldr: "📋",
};

export const CALLOUT_ALIASES: Record<string, string> = {
	hint: "tip",
	important: "tip",
	check: "success",
	done: "success",
	help: "question",
	faq: "question",
	caution: "warning",
	attention: "warning",
	fail: "failure",
	missing: "failure",
	error: "danger",
	cite: "quote",
	summary: "abstract",
	tldr: "abstract",
};

/** Callout title icon widget replacing `[!type]` */
export class CalloutIconWidget extends WidgetType {
	constructor(readonly type: string) {
		super();
	}

	override eq(other: CalloutIconWidget) {
		return other.type === this.type;
	}

	override toDOM() {
		const span = document.createElement("span");
		span.className = "cm-live-callout-icon";
		span.textContent = CALLOUT_ICONS[this.type] ?? CALLOUT_ICONS.note;
		return span;
	}

	override ignoreEvent() {
		return true;
	}
}

/** KaTeX math formula widget */
export class MathWidget extends WidgetType {
	constructor(
		readonly tex: string,
		readonly display: boolean,
	) {
		super();
	}

	override eq(other: MathWidget) {
		return other.tex === this.tex && other.display === this.display;
	}

	override toDOM() {
		const span = document.createElement(this.display ? "div" : "span");
		span.className = this.display
			? "cm-live-math cm-live-math-block"
			: "cm-live-math";
		try {
			katex.render(this.tex, span, {
				displayMode: this.display,
				throwOnError: false,
			});
		} catch {
			span.textContent = this.tex;
		}
		return span;
	}

	override ignoreEvent() {
		return true;
	}
}
