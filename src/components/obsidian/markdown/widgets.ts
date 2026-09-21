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

// ── Raw HTML rendering (Obsidian-style) ──────────────────────────────

/** Void elements: renderable without a closing tag */
const VOID_HTML_TAGS = new Set([
	"area",
	"base",
	"br",
	"col",
	"embed",
	"hr",
	"img",
	"input",
	"link",
	"meta",
	"source",
	"track",
	"wbr",
]);

/** Tags never rendered from raw HTML (XSS / global-style pollution) */
const BLOCKED_HTML_TAGS = new Set(["script", "style", "title", "textarea"]);

export function isVoidHtmlTag(tag: string): boolean {
	return VOID_HTML_TAGS.has(tag.toLowerCase());
}

function isSafeUrlAttr(value: string): boolean {
	return !/^\s*(javascript|vbscript):/i.test(value);
}

/** Sets attributes parsed from an open-tag string onto el, dropping on* handlers and javascript: URLs */
function applyHtmlAttributes(el: HTMLElement, openTagText: string): void {
	const attrSource =
		openTagText.match(/^<[a-zA-Z][\w-]*([\s\S]*?)\/?>$/)?.[1] ?? "";
	const attrRe = /([\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
	for (let m = attrRe.exec(attrSource); m; m = attrRe.exec(attrSource)) {
		const name = (m[1] ?? "").toLowerCase();
		if (!name || name.startsWith("on")) continue;
		const value = m[2] ?? m[3] ?? m[4] ?? "";
		if (
			(name === "href" || name === "src" || name === "xlink:href") &&
			!isSafeUrlAttr(value)
		)
			continue;
		try {
			el.setAttribute(name, value);
		} catch {
			// 非法属性名静默跳过
		}
	}
}

/**
 * Builds a live DOM element from an inline open tag + plain-text inner content.
 * Returns null when the tag must not be rendered (script/style/...).
 */
export function buildInlineHtmlElement(
	openTagText: string,
	innerText: string | null,
): HTMLElement | null {
	const m = openTagText.match(/^<([a-zA-Z][\w-]*)[\s\S]*?\/?>$/);
	if (!m) return null;
	const tag = (m[1] ?? "").toLowerCase();
	if (BLOCKED_HTML_TAGS.has(tag)) return null;
	const el = document.createElement(tag);
	applyHtmlAttributes(el, openTagText);
	if (innerText != null && !isVoidHtmlTag(tag)) el.textContent = innerText;
	return el;
}

/** Sanitizes an HTML block: strips script/style and event-handler / javascript: attributes */
export function sanitizeHtmlBlock(html: string): string {
	const tpl = document.createElement("template");
	tpl.innerHTML = html;
	const walk = (root: ParentNode) => {
		for (const child of Array.from(root.children)) {
			if (BLOCKED_HTML_TAGS.has(child.tagName.toLowerCase())) {
				child.remove();
				continue;
			}
			for (const attr of Array.from(child.attributes)) {
				const name = attr.name.toLowerCase();
				if (name.startsWith("on")) {
					child.removeAttribute(attr.name);
				} else if (
					(name === "href" || name === "src" || name === "xlink:href") &&
					!isSafeUrlAttr(attr.value)
				) {
					child.removeAttribute(attr.name);
				}
			}
			walk(child);
		}
	};
	walk(tpl.content);
	return tpl.innerHTML;
}

/** Inline HTML widget: `<span style="…">text</span>` rendered as a live element */
export class InlineHtmlWidget extends WidgetType {
	constructor(
		readonly openTag: string,
		readonly innerText: string | null,
	) {
		super();
	}

	override eq(other: InlineHtmlWidget) {
		return other.openTag === this.openTag && other.innerText === this.innerText;
	}

	override toDOM() {
		const el = buildInlineHtmlElement(this.openTag, this.innerText);
		if (el) {
			el.classList.add("cm-live-html");
			return el;
		}
		const span = document.createElement("span");
		span.className = "cm-live-html-raw";
		span.textContent = this.innerText ?? this.openTag;
		return span;
	}
}

/** HTML block widget: multi-line raw HTML rendered when cursor is outside */
export class HtmlBlockWidget extends WidgetType {
	constructor(readonly source: string) {
		super();
	}

	override eq(other: HtmlBlockWidget) {
		return other.source === this.source;
	}

	override toDOM() {
		const div = document.createElement("div");
		div.className = "cm-live-html-block";
		div.innerHTML = sanitizeHtmlBlock(this.source);
		return div;
	}
}
