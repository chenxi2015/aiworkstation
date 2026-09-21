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
	constructor(
		readonly yamlText: string,
		readonly onFollowWikilink?: (target: string) => void,
	) {
		super();
	}

	override eq(other: FrontmatterWidget) {
		return (
			other.yamlText === this.yamlText &&
			other.onFollowWikilink === this.onFollowWikilink
		);
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
					// 属性面板里的双链：单击跳转（阻止冒泡，避免触发面板的选区重置）
					const target =
						(wikilink[1] ?? "").split("|")[0]?.split("#")[0]?.trim() ?? "";
					chip.addEventListener("mousedown", (e) => {
						e.stopPropagation();
						e.preventDefault();
						if (target) this.onFollowWikilink?.(target);
					});
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
		checkbox.setAttribute("aria-label", "Toggle task");
		checkbox.addEventListener("mousedown", (e) => {
			e.preventDefault();
			e.stopPropagation();
		});
		checkbox.addEventListener("click", (e) => {
			e.preventDefault();
			e.stopPropagation();
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

export const CALLOUT_SVGS: Record<string, string> = {
	note: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="cm-live-callout-svg"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>`,
	info: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="cm-live-callout-svg"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>`,
	todo: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="cm-live-callout-svg"><path d="m9 11 3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>`,
	tip: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="cm-live-callout-svg"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></svg>`,
	important: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="cm-live-callout-svg"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
	success: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="cm-live-callout-svg"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
	question: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="cm-live-callout-svg"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>`,
	warning: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="cm-live-callout-svg"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
	failure: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="cm-live-callout-svg"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
	danger: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="cm-live-callout-svg"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
	bug: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="cm-live-callout-svg"><path d="m8 2 1.88 1.88"/><path d="M14.12 3.88 16 2"/><path d="M9 7.13v-1a3.003 3.003 0 1 1 6 0v1"/><path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6"/><path d="M12 20v-9"/><path d="M6.53 9C4.6 8.8 3 7.1 3 5"/><path d="M6 13H2"/><path d="M3 21c0-2.1 1.7-3.9 3.8-4"/><path d="M20.97 5c0 2.1-1.6 3.8-3.5 4"/><path d="M22 13h-4"/><path d="M17.2 17c2.1.1 3.8 1.9 3.8 4"/></svg>`,
	example: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="cm-live-callout-svg"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>`,
	quote: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="cm-live-callout-svg"><path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"/><path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"/></svg>`,
	abstract: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="cm-live-callout-svg"><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4"/><path d="M12 16h4"/><path d="M8 11h.01"/><path d="M8 16h.01"/></svg>`,
	summary: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="cm-live-callout-svg"><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4"/><path d="M12 16h4"/><path d="M8 11h.01"/><path d="M8 16h.01"/></svg>`,
	tldr: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="cm-live-callout-svg"><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4"/><path d="M12 16h4"/><path d="M8 11h.01"/><path d="M8 16h.01"/></svg>`,
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
		const key = (this.type ?? "").toLowerCase();
		const normalized = CALLOUT_ALIASES[key] ?? key;
		const svg = CALLOUT_SVGS[normalized] ?? CALLOUT_SVGS[key];
		if (svg) {
			span.innerHTML = svg;
		} else {
			span.textContent = CALLOUT_ICONS[key] ?? CALLOUT_ICONS.note;
		}
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
