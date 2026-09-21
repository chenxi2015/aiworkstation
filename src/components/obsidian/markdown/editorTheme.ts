import { HighlightStyle } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { tags } from "@lezer/highlight";

/**
 * Syntax highlighting style based on CodeMirror default, but removing underline from headings.
 * Heading sizes and weights are handled by livePreview line decorations.
 */
export const appHighlightStyle = HighlightStyle.define([
	{ tag: tags.meta, color: "#404740" },
	{ tag: tags.link, textDecoration: "underline" },
	{ tag: tags.heading, fontWeight: "bold" },
	{ tag: tags.emphasis, fontStyle: "italic" },
	{ tag: tags.strong, fontWeight: "bold" },
	{ tag: tags.strikethrough, textDecoration: "line-through" },
	{ tag: tags.keyword, color: "#708" },
	{
		tag: [
			tags.atom,
			tags.bool,
			tags.url,
			tags.contentSeparator,
			tags.labelName,
		],
		color: "#219",
	},
	{ tag: [tags.literal, tags.inserted], color: "#164" },
	{ tag: [tags.string, tags.deleted], color: "#a11" },
	{ tag: [tags.regexp, tags.escape, tags.special(tags.string)], color: "#e40" },
	{ tag: tags.definition(tags.variableName), color: "#00f" },
	{ tag: tags.local(tags.variableName), color: "#30a" },
	{ tag: [tags.typeName, tags.namespace], color: "#085" },
	{ tag: tags.className, color: "#167" },
	{ tag: [tags.special(tags.variableName), tags.macroName], color: "#256" },
	{ tag: tags.definition(tags.propertyName), color: "#00c" },
	{ tag: tags.comment, color: "#940" },
	{ tag: tags.invalid, color: "#f00" },
]);

/** Theme matching application CSS variables (supporting light/dark mode) */
export const appTheme = EditorView.theme({
	"&": {
		height: "100%",
		backgroundColor: "transparent",
		color: "var(--foreground)",
		fontSize: "14px",
	},
	".cm-content": {
		fontFamily: "inherit",
		lineHeight: "1.75",
		padding: "20px 24px",
		caretColor: "var(--accent)",
		// Obsidian-like reading width: centered focus
		maxWidth: "760px",
		margin: "0 auto",
	},
	".cm-scroller": {
		fontFamily: "inherit",
		overflow: "auto",
	},
	".cm-gutters": {
		backgroundColor: "var(--surface-secondary)",
		color: "var(--muted)",
		border: "none",
		borderRight: "1px solid var(--border)",
	},
	".cm-lineNumbers .cm-gutterElement": {
		textAlign: "center",
		padding: "0 4px",
		minWidth: "28px",
		fontSize: "12px",
	},
	".cm-activeLine": {
		backgroundColor: "var(--surface)",
	},
	".cm-activeLineGutter": {
		backgroundColor: "transparent",
		color: "var(--foreground)",
	},
	"&.cm-focused": {
		outline: "none",
	},
	".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
		backgroundColor: "var(--accent-soft, rgba(59, 91, 219, 0.18))",
	},
	".cm-cursor": {
		borderLeftColor: "var(--accent)",
	},
	".cm-placeholder": {
		color: "var(--muted)",
	},

	// ── Live Preview line & inline decorations ────────────
	".cm-live-h1": {
		fontSize: "1.7em",
		fontWeight: "700",
		lineHeight: "1.4",
	},
	".cm-live-h2": {
		fontSize: "1.45em",
		fontWeight: "700",
		lineHeight: "1.4",
	},
	".cm-live-h3": { fontSize: "1.25em", fontWeight: "600" },
	".cm-live-h4": { fontSize: "1.12em", fontWeight: "600" },
	".cm-live-h5, .cm-live-h6": { fontSize: "1.05em", fontWeight: "600" },
	".cm-live-strong": { fontWeight: "700" },
	".cm-live-em": { fontStyle: "italic" },
	".cm-live-strike": { textDecoration: "line-through" },
	".cm-live-incode": {
		backgroundColor: "var(--surface-secondary)",
		borderRadius: "4px",
		padding: "0 4px",
		fontSize: "0.92em",
		fontFamily:
			"ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
	},
	".cm-live-codeblock": {
		backgroundColor: "var(--surface-secondary)",
		fontFamily:
			"ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
		fontSize: "0.92em",
	},
	".cm-live-quote": {
		borderLeft: "3px solid var(--border)",
		paddingLeft: "12px",
		color: "var(--muted)",
	},
	".cm-live-link": {
		color: "var(--accent)",
		textUnderlineOffset: "2px",
	},
	// 外链：Obsidian 风格 ↗ 角标 + 指针光标（点击直接打开）
	".cm-live-external-link": {
		cursor: "pointer",
	},
	".cm-live-external-link::after": {
		content: '""',
		display: "inline-block",
		width: "0.68em",
		height: "0.68em",
		marginLeft: "1px",
		verticalAlign: "baseline",
		backgroundColor: "currentColor",
		WebkitMaskImage:
			"url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M7 17L17 7'/%3E%3Cpath d='M7 7h10v10'/%3E%3C/svg%3E\")",
		maskImage:
			"url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M7 17L17 7'/%3E%3Cpath d='M7 7h10v10'/%3E%3C/svg%3E\")",
		WebkitMaskRepeat: "no-repeat",
		maskRepeat: "no-repeat",
		WebkitMaskSize: "contain",
		maskSize: "contain",
	},
	".cm-live-image": { color: "var(--muted)" },
	".cm-live-hr": {
		borderTop: "1px solid var(--border)",
		color: "transparent",
	},
	".cm-live-frontmatter": {
		color: "var(--muted)",
		fontSize: "0.92em",
		opacity: "0.75",
	},
	".cm-live-wikilink": {
		color: "var(--accent)",
		fontWeight: "500",
		cursor: "pointer",
	},
	".cm-live-highlight": {
		backgroundColor: "color-mix(in srgb, gold 30%, transparent)",
		borderRadius: "2px",
	},
	// ── Table & Media widgets ─────────────────────────────
	".cm-live-table": {
		margin: "8px 0",
	},
	".cm-live-table table": {
		borderCollapse: "collapse",
		width: "100%",
		fontSize: "0.92em",
	},
	".cm-live-table th, .cm-live-table td": {
		border: "1px solid var(--border)",
		padding: "6px 12px",
		textAlign: "left",
	},
	".cm-live-table th": {
		backgroundColor: "var(--surface-secondary)",
		fontWeight: "600",
	},
	".cm-live-media": {
		display: "block",
		margin: "8px 0",
		position: "relative",
	},
	".cm-live-media-toolbar": {
		position: "absolute",
		top: "8px",
		right: "8px",
		display: "flex",
		gap: "4px",
		opacity: "0",
		transition: "opacity 0.15s ease",
		backgroundColor: "var(--overlay)",
		border: "1px solid var(--border)",
		borderRadius: "8px",
		padding: "3px",
		boxShadow: "0 2px 8px rgb(0 0 0 / 0.12)",
		zIndex: "5",
	},
	".cm-live-media:hover .cm-live-media-toolbar, .cm-live-media:focus-within .cm-live-media-toolbar, .cm-live-mermaid:hover .cm-live-media-toolbar, .cm-live-mermaid:focus-within .cm-live-media-toolbar":
		{
			opacity: "1",
		},
	".cm-live-media-btn": {
		display: "flex",
		alignItems: "center",
		justifyContent: "center",
		width: "24px",
		height: "24px",
		border: "none",
		borderRadius: "6px",
		backgroundColor: "transparent",
		color: "var(--foreground)",
		cursor: "pointer",
	},
	".cm-live-media-btn:hover": {
		backgroundColor: "var(--surface-secondary)",
	},
	".cm-live-media-btn svg": {
		width: "14px",
		height: "14px",
	},
	".cm-live-media img, .cm-live-media video": {
		maxWidth: "100%",
		borderRadius: "8px",
	},
	// ── Media source line (source viewing mode) ───────────
	".cm-live-media-source-line": {
		backgroundColor: "var(--surface-secondary)",
		textAlign: "center",
	},
	".cm-live-media-audio": {
		display: "block",
		margin: "8px 0",
	},
	".cm-live-media-error": {
		color: "var(--muted)",
		fontSize: "0.85em",
	},
	".cm-live-tag": {
		color: "var(--accent)",
		backgroundColor: "var(--accent-soft, rgba(59, 91, 219, 0.10))",
		borderRadius: "4px",
		padding: "0 2px",
	},
	".cm-live-checkbox": {
		accentColor: "var(--accent)",
		width: "13px",
		height: "13px",
		margin: "0 6px 0 0",
		verticalAlign: "-1px",
		cursor: "pointer",
	},
	".cm-live-bullet": {
		color: "var(--muted)",
		fontWeight: "600",
	},
	// ── Callouts ──────────────────────────────────────────
	".cm-live-callout": {
		borderLeft: "3px solid var(--callout-color, var(--accent))",
		backgroundColor:
			"color-mix(in srgb, var(--callout-color, var(--accent)) 8%, transparent)",
		paddingLeft: "12px",
	},
	".cm-live-callout-note, .cm-live-callout-info, .cm-live-callout-todo": {
		"--callout-color": "rgb(2, 122, 255)",
	},
	".cm-live-callout-tip, .cm-live-callout-success": {
		"--callout-color": "rgb(0, 180, 120)",
	},
	".cm-live-callout-question": {
		"--callout-color": "rgb(146, 102, 255)",
	},
	".cm-live-callout-warning": {
		"--callout-color": "rgb(255, 170, 0)",
	},
	".cm-live-callout-failure, .cm-live-callout-danger, .cm-live-callout-bug": {
		"--callout-color": "rgb(255, 68, 68)",
	},
	".cm-live-callout-example": {
		"--callout-color": "rgb(146, 102, 255)",
	},
	".cm-live-callout-quote": {
		"--callout-color": "rgb(158, 158, 158)",
	},
	".cm-live-callout-abstract": {
		"--callout-color": "rgb(0, 190, 220)",
	},
	".cm-live-callout-icon": {
		marginRight: "4px",
	},
	// ── Comment / Math / Footnote / Task Done ─────────────
	".cm-live-comment": {
		color: "var(--muted)",
		opacity: "0.6",
	},
	".cm-live-math-block": {
		margin: "8px 0",
		padding: "8px 0",
		overflowX: "auto",
	},
	".cm-live-footnote": {
		color: "var(--accent)",
		fontSize: "0.85em",
	},
	".cm-live-task-done": {
		textDecoration: "line-through",
		color: "var(--muted)",
	},
	// ── Frontmatter properties panel ──────────────────────
	".cm-live-props": {
		border: "1px solid var(--border)",
		borderRadius: "10px",
		padding: "6px 14px",
		margin: "4px 0 16px",
		fontSize: "0.92em",
		backgroundColor: "var(--surface)",
	},
	".cm-live-props-row": {
		display: "flex",
		alignItems: "baseline",
		gap: "16px",
		padding: "3px 0",
	},
	".cm-live-props-empty": {
		color: "var(--muted)",
	},
	".cm-live-props-key": {
		color: "var(--muted)",
		minWidth: "96px",
		flexShrink: "0",
	},
	".cm-live-props-val": {
		display: "flex",
		flexWrap: "wrap",
		gap: "4px",
	},
	".cm-live-props-empty-val": {
		color: "var(--muted)",
		opacity: "0.6",
	},
	".cm-live-props-chip": {
		backgroundColor: "var(--surface-secondary)",
		borderRadius: "4px",
		padding: "0 6px",
	},
	".cm-live-props-link": {
		cursor: "pointer",
	},
	// ── Dataview query results ────────────────────────────
	".cm-live-dataview": {
		margin: "8px 0",
		fontSize: "0.92em",
	},
	".cm-live-dataview-status": {
		color: "var(--muted)",
		padding: "8px 0",
	},
	".cm-live-dataview-error": {
		color: "var(--danger, #e5484d)",
		padding: "8px 0",
	},
	".cm-live-dataview table": {
		borderCollapse: "collapse",
		width: "100%",
	},
	".cm-live-dataview th, .cm-live-dataview td": {
		border: "1px solid var(--border)",
		padding: "6px 12px",
		textAlign: "left",
	},
	".cm-live-dataview th": {
		backgroundColor: "var(--surface-secondary)",
		fontWeight: "600",
	},
	".cm-live-dataview-link": {
		color: "var(--accent)",
		cursor: "pointer",
	},
	".cm-live-dataview-file": {
		color: "var(--muted)",
		fontSize: "0.85em",
		margin: "6px 0 2px",
	},
	// ── Mermaid ───────────────────────────────────────────────
	// ── Raw HTML (inline & block) ─────────────────────────────
	".cm-live-html": {
		cursor: "text",
	},
	".cm-live-html-block": {
		margin: "4px 0",
	},
	".cm-live-html-raw": {
		color: "var(--muted)",
		fontFamily:
			"ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
		fontSize: "0.92em",
	},
	".cm-live-mermaid": {
		margin: "8px 0",
		backgroundColor: "var(--surface)",
		border: "1px solid var(--border)",
		borderRadius: "10px",
		overflow: "hidden",
		position: "relative",
	},
	".cm-live-mermaid-code": {
		marginTop: "10px",
		padding: "10px 12px",
		backgroundColor: "var(--surface-secondary)",
		borderRadius: "8px",
		textAlign: "left",
		fontSize: "0.85em",
		fontFamily:
			"ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
		whiteSpace: "pre",
		overflowX: "auto",
		color: "var(--foreground)",
	},
});
