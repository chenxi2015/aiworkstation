import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { syntaxHighlighting } from "@codemirror/language";
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
import { useCallback, useEffect, useRef, useState } from "react";
import "katex/dist/katex.min.css";
import { htmlToMarkdown } from "../../editor/markdown";
import { useImagePreview } from "../../workbench/ai/shared/ImagePreviewModal";
import { appHighlightStyle, appTheme } from "./editorTheme";
import { insertLink, toggleInlineFormat } from "./formatCommands";
import { livePreview } from "./livePreview";
import { MarkdownContextMenu } from "./MarkdownContextMenu";
import { wikilinkAutocomplete } from "./wikilinkAutocomplete";

export interface MarkdownEditorProps {
	/** 受控初始值；仅在外部值与编辑器内容不一致时同步（如重新加载笔记） */
	value: string;
	onChange: (value: string) => void;
	/** 暴露 EditorView 实例（划词 AI 需要读取选区坐标） */
	onReady?: (view: EditorView | null) => void;
	placeholderText?: string;
	/** 只读模式（超大截断文件） */
	readOnly?: boolean;
	/** 阅读视图：不可编辑、无行号/光标、Markdown 源码全程保持渲染态 */
	reading?: boolean;
	/** 当前笔记相对 Vault 路径（解析笔记内相对图片/资源引用） */
	noteRelPath?: string;
	/** Cmd/Ctrl+S 保存回调 */
	onSaveShortcut?: () => void;
	/** 点击笔记链接（Dataview 结果等）跳转回调 */
	onNavigateNote?: (relPath: string) => void;
	/** 双链目标不存在时的新建回调（name 不含 .md 后缀） */
	onCreateNote?: (name: string) => void;
}

/** Imperative handle for precise editor operations (avoids full-document round-trip) */
export interface MarkdownEditorHandle {
	/** Append text at the end via precise dispatch (no full replace) */
	appendText: (text: string) => void;
	/** Get the EditorView instance */
	getView: () => EditorView | null;
}

/** 阅读视图主题：隐藏文本光标（不可编辑但保留选区/点击交互） */
const readingTheme = EditorView.theme({
	".cm-content": { caretColor: "transparent" },
});

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
	reading = false,
	noteRelPath,
	onSaveShortcut,
	onNavigateNote,
	onCreateNote,
}: MarkdownEditorProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const viewRef = useRef<EditorView | null>(null);
	const [contextMenu, setContextMenu] = useState<{
		x: number;
		y: number;
	} | null>(null);
	const onChangeRef = useRef(onChange);
	onChangeRef.current = onChange;
	const onReadyRef = useRef(onReady);
	onReadyRef.current = onReady;
	const onSaveRef = useRef(onSaveShortcut);
	onSaveRef.current = onSaveShortcut;
	const onNavigateNoteRef = useRef(onNavigateNote);
	onNavigateNoteRef.current = onNavigateNote;
	const onCreateNoteRef = useRef(onCreateNote);
	onCreateNoteRef.current = onCreateNote;
	const { openPreview } = useImagePreview();
	const openPreviewRef = useRef(openPreview);
	openPreviewRef.current = openPreview;
	// Track whether the last doc change was initiated by the editor (vs external value prop)
	const selfChangeRef = useRef(false);
	const rafIdRef = useRef(0);
	const prevRelPathRef = useRef(noteRelPath);

	const getExtensions = useCallback(
		(path?: string) => [
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
			// 行内格式快捷键（对齐 Obsidian：⌘B 加粗 / ⌘I 倾斜 / ⌘E 代码 / ⌘K 链接）
			...(reading
				? []
				: [
						wikilinkAutocomplete(),
						keymap.of([
							{
								key: "Mod-b",
								run: (v) => toggleInlineFormat(v, "bold"),
							},
							{
								key: "Mod-i",
								run: (v) => toggleInlineFormat(v, "italic"),
							},
							{
								key: "Mod-e",
								run: (v) => toggleInlineFormat(v, "code"),
							},
							{ key: "Mod-k", run: (v) => insertLink(v) },
							{
								key: "Mod-Shift-x",
								run: (v) => toggleInlineFormat(v, "strike"),
							},
							{
								key: "Mod-Shift-h",
								run: (v) => toggleInlineFormat(v, "highlight"),
							},
						]),
						lineNumbers(),
						highlightActiveLine(),
						highlightActiveLineGutter(),
					]),
			history(),
			markdown({ base: markdownLanguage, codeLanguages: languages }),
			syntaxHighlighting(appHighlightStyle, { fallback: true }),
			keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),
			placeholder(placeholderText),
			EditorView.lineWrapping,
			livePreview({
				readingMode: reading,
				noteRelPath: path,
				onPreviewImage: (data) =>
					openPreviewRef.current({ src: data.src, title: data.alt }),
				onNavigateNote: (rel) => onNavigateNoteRef.current?.(rel),
				onCreateNote: (name) => onCreateNoteRef.current?.(name),
			}),
			appTheme,
			...(reading ? [readingTheme] : []),
			// 阅读视图不设 EditorState.readOnly：保留复选框等控件的程序化改写能力
			EditorState.readOnly.of(reading ? false : readOnly),
			EditorView.editable.of(!(readOnly || reading)),
			// 粘贴 HTML → Markdown（复用创作模块的 HTML→MD 转换链路）
			...(reading
				? []
				: [
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
									changes: {
										from: range.from,
										to: range.to,
										insert: md,
									},
									selection: { anchor: range.from + md.length },
								});
								return true;
							},
							contextmenu(event, v) {
								if (readOnly) return false;
								event.preventDefault();
								// 右键落在选区外时先把光标移过去（对齐 Obsidian 行为）
								const pos = v.posAtCoords({
									x: event.clientX,
									y: event.clientY,
								});
								if (pos != null) {
									const inSelection = v.state.selection.ranges.some(
										(r) => pos >= r.from && pos <= r.to,
									);
									if (!inSelection) {
										v.dispatch({ selection: { anchor: pos } });
									}
								}
								v.focus();
								setContextMenu({
									x: event.clientX,
									y: event.clientY,
								});
								return true;
							},
						}),
					]),
			EditorView.updateListener.of((update) => {
				if (update.docChanged) {
					selfChangeRef.current = true;
					// Debounce toString via rAF: coalesce multiple rapid updates into one
					if (!rafIdRef.current) {
						rafIdRef.current = requestAnimationFrame(() => {
							rafIdRef.current = 0;
							const v = viewRef.current;
							if (v) onChangeRef.current(v.state.doc.toString());
						});
					}
				}
			}),
		],
		[reading, readOnly, placeholderText],
	);

	// 编辑器实例只创建一次；外部值同步走下方 effect，回调经 ref 透传
	// biome-ignore lint/correctness/useExhaustiveDependencies: 实例只随挂载创建一次
	useEffect(() => {
		if (!containerRef.current) return;

		const view = new EditorView({
			parent: containerRef.current,
			state: EditorState.create({
				doc: value,
				extensions: getExtensions(noteRelPath),
			}),
		});
		viewRef.current = view;
		onReadyRef.current?.(view);

		return () => {
			onReadyRef.current?.(null);
			if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
			view.destroy();
			viewRef.current = null;
		};
	}, []);

	// Cleanly switch note state when noteRelPath changes without unmounting DOM
	useEffect(() => {
		if (prevRelPathRef.current === noteRelPath) return;
		prevRelPathRef.current = noteRelPath;
		const view = viewRef.current;
		if (!view) return;
		const nextState = EditorState.create({
			doc: value,
			extensions: getExtensions(noteRelPath),
		});
		view.setState(nextState);
		view.scrollDOM.scrollTop = 0;
	}, [noteRelPath, value, getExtensions]);

	// External value sync within the same note: skip when the change originated from editor itself
	useEffect(() => {
		if (prevRelPathRef.current !== noteRelPath) return;
		if (selfChangeRef.current) {
			selfChangeRef.current = false;
			return;
		}
		const view = viewRef.current;
		if (!view) return;
		const current = view.state.doc.toString();
		if (value === current) return;
		view.dispatch({
			changes: { from: 0, to: current.length, insert: value },
		});
	}, [value, noteRelPath]);

	return (
		<>
			<div ref={containerRef} className="h-full min-h-0" />
			{contextMenu && viewRef.current && (
				<MarkdownContextMenu
					x={contextMenu.x}
					y={contextMenu.y}
					view={viewRef.current}
					onClose={() => setContextMenu(null)}
				/>
			)}
		</>
	);
}
