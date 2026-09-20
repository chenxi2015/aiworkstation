import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import {
	defaultHighlightStyle,
	syntaxHighlighting,
} from "@codemirror/language";
import { languages } from "@codemirror/language-data";
import { searchKeymap } from "@codemirror/search";
import { EditorState, Prec } from "@codemirror/state";
import {
	EditorView,
	highlightActiveLine,
	highlightActiveLineGutter,
	keymap,
	lineNumbers,
	placeholder,
} from "@codemirror/view";
import { useEffect, useRef } from "react";
import { htmlToMarkdown } from "../../editor/markdown";
import { livePreview } from "./livePreview";

export interface MarkdownEditorProps {
	/** 受控初始值；仅在外部值与编辑器内容不一致时同步（如重新加载笔记） */
	value: string;
	onChange: (value: string) => void;
	/** 暴露 EditorView 实例（划词 AI 需要读取选区坐标） */
	onReady?: (view: EditorView | null) => void;
	placeholderText?: string;
	/** 只读模式（超大截断文件） */
	readOnly?: boolean;
	/** 当前笔记相对 Vault 路径（解析笔记内相对图片/资源引用） */
	noteRelPath?: string;
	/** Cmd/Ctrl+S 保存回调 */
	onSaveShortcut?: () => void;
}

/**
 * CodeMirror 6 Markdown 编辑器（Obsidian 风格 Live Preview）：
 * - 底层是纯 Markdown 文本，装饰层实时渲染样式，零失真读写 Vault
 * - 粘贴 HTML（网页复制内容）自动转为 Markdown（复用创作模块转换链路）
 */
export function MarkdownEditor({
	value,
	onChange,
	onReady,
	placeholderText = "开始用 Markdown 记录…",
	readOnly = false,
	noteRelPath,
	onSaveShortcut,
}: MarkdownEditorProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const viewRef = useRef<EditorView | null>(null);
	const onChangeRef = useRef(onChange);
	onChangeRef.current = onChange;
	const onReadyRef = useRef(onReady);
	onReadyRef.current = onReady;
	const onSaveRef = useRef(onSaveShortcut);
	onSaveRef.current = onSaveShortcut;

	// 编辑器实例只创建一次；外部值同步走下方 effect，回调经 ref 透传
	// biome-ignore lint/correctness/useExhaustiveDependencies: 实例只随挂载创建一次
	useEffect(() => {
		if (!containerRef.current) return;

		const view = new EditorView({
			parent: containerRef.current,
			state: EditorState.create({
				doc: value,
				extensions: [
					Prec.high(
						keymap.of([
							{
								key: "Mod-s",
								run: () => {
									onSaveRef.current?.();
									return true;
								},
							},
						]),
					),
					lineNumbers(),
					history(),
					highlightActiveLine(),
					highlightActiveLineGutter(),
					markdown({ base: markdownLanguage, codeLanguages: languages }),
					syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
					keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),
					placeholder(placeholderText),
					EditorView.lineWrapping,
					livePreview({ noteRelPath }),
					appTheme,
					EditorState.readOnly.of(readOnly),
					EditorView.editable.of(!readOnly),
					// 粘贴 HTML → Markdown（复用创作模块的 HTML→MD 转换链路）
					EditorView.domEventHandlers({
						paste(event, v) {
							if (readOnly) return false;
							const html = event.clipboardData?.getData("text/html");
							if (!html) return false; // 纯文本走默认行为
							const md = htmlToMarkdown(html);
							if (!md.trim()) return false;
							event.preventDefault();
							const range = v.state.selection.main;
							v.dispatch({
								changes: { from: range.from, to: range.to, insert: md },
								selection: { anchor: range.from + md.length },
							});
							return true;
						},
					}),
					EditorView.updateListener.of((update) => {
						if (update.docChanged) {
							onChangeRef.current(update.state.doc.toString());
						}
					}),
				],
			}),
		});
		viewRef.current = view;
		onReadyRef.current?.(view);

		return () => {
			onReadyRef.current?.(null);
			view.destroy();
			viewRef.current = null;
		};
	}, []);

	// 外部值变化（重新加载 / AI 整体替换）时同步进编辑器，本地编辑不被覆盖
	useEffect(() => {
		const view = viewRef.current;
		if (!view) return;
		const current = view.state.doc.toString();
		if (value === current) return;
		view.dispatch({
			changes: { from: 0, to: current.length, insert: value },
		});
	}, [value]);

	return <div ref={containerRef} className="h-full min-h-0 text-[13px]" />;
}

/** 跟随应用 CSS 变量的主题（亮/暗模式自动适配） */
const appTheme = EditorView.theme({
	"&": {
		height: "100%",
		backgroundColor: "transparent",
		color: "var(--foreground)",
		fontSize: "13px",
	},
	".cm-content": {
		fontFamily:
			"ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
		lineHeight: "1.75",
		padding: "20px 24px",
		caretColor: "var(--accent)",
		// Obsidian 式窄屏阅读宽度：内容居中聚焦
		maxWidth: "760px",
		margin: "0 auto",
	},
	".cm-scroller": {
		fontFamily: "inherit",
		overflow: "auto",
	},
	".cm-gutters": {
		backgroundColor: "transparent",
		color: "var(--muted)",
		border: "none",
		opacity: "0.6",
	},
	".cm-activeLine": {
		backgroundColor: "var(--surface-secondary)",
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

	// ── Live Preview 装饰样式 ─────────────────────────────
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
	},
	".cm-live-codeblock": {
		backgroundColor: "var(--surface-secondary)",
	},
	".cm-live-quote": {
		borderLeft: "3px solid var(--border)",
		paddingLeft: "12px",
		color: "var(--muted)",
	},
	".cm-live-link": {
		color: "var(--accent)",
		textDecoration: "underline",
		textUnderlineOffset: "2px",
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
	},
	".cm-live-highlight": {
		backgroundColor: "color-mix(in srgb, gold 30%, transparent)",
		borderRadius: "2px",
	},
	// ── 表格 / 媒体 widget 样式 ────────────────────────────
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
	".cm-live-media:hover .cm-live-media-toolbar, .cm-live-media:focus-within .cm-live-media-toolbar":
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
});
