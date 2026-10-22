import {
	defaultKeymap,
	history,
	historyKeymap,
	redoDepth,
	undoDepth,
} from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { syntaxHighlighting } from "@codemirror/language";
import { languages } from "@codemirror/language-data";
import { search } from "@codemirror/search";
import {
	Compartment,
	EditorState,
	Prec,
	StateEffect,
	Transaction,
} from "@codemirror/state";
import {
	EditorView,
	highlightActiveLine,
	highlightActiveLineGutter,
	keymap,
	lineNumbers,
	placeholder,
} from "@codemirror/view";
import { useCallback, useEffect, useRef, useState } from "react";
import { cmSearchHighlightExtension } from "./cmSearchHighlightExtension";
import "katex/dist/katex.min.css";
import { toast } from "@heroui/react";
import { uploadVaultAsset } from "../../../services/api/obsidianClient";
import { htmlToMarkdown } from "../../editor/markdown";
import { useImagePreview } from "../../workbench/ai/shared/ImagePreviewModal";
import { aiSelectionDecorationExtension } from "./cmAiHighlightExtension";
import { appHighlightStyle, appTheme } from "./editorTheme";
import { insertLink, toggleInlineFormat } from "./formatCommands";
import { livePreview } from "./livePreview";
import { MarkdownContextMenu } from "./MarkdownContextMenu";
import { markdownAutoPair } from "./markdownAutoPair";
import { getCachedNoteState, saveCachedNoteState } from "./noteStateCache";
import { wikilinkAutocomplete } from "./wikilinkAutocomplete";

export interface MarkdownEditorProps {
	/** 受控初始值；仅在外部值与编辑器内容不一致时同步（如重新加载笔记） */
	value: string;
	onChange: (value: string) => void;
	/** 暴露 EditorView 实例（划词 AI 需要读取选区坐标） */
	onReady?: (view: EditorView | null) => void;
	/** 撤销/重做可用状态变化回调 */
	onHistoryChange?: (canUndo: boolean, canRedo: boolean) => void;
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
	/** Cmd/Ctrl+F 打开搜索框回调 */
	onOpenSearch?: () => void;
	/** Cmd/Ctrl+Alt+F 打开并展开替换栏回调 */
	onOpenReplace?: () => void;
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

/** Check if a dropped/pasted file is an image */
function isImageFile(file: File): boolean {
	if (file.type?.startsWith("image/")) return true;
	const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
	return ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "avif"].includes(
		ext,
	);
}

/**
 * Upload local image files to Vault and insert wiki image embeds at target position.
 * Live preview extension automatically renders them into images immediately.
 */
async function insertUploadedImages(
	files: File[],
	targetPos: number,
	view: EditorView,
	noteRelPath?: string,
): Promise<void> {
	if (files.length === 0) return;
	try {
		const inserts: string[] = [];
		for (const file of files) {
			const { name } = await uploadVaultAsset(file, noteRelPath);
			inserts.push(`![[${name}]]`);
		}

		const doc = view.state.doc;
		const safePos = Math.max(0, Math.min(doc.length, targetPos));
		const prevChar = safePos > 0 ? doc.sliceString(safePos - 1, safePos) : "\n";
		const nextChar =
			safePos < doc.length ? doc.sliceString(safePos, safePos + 1) : "\n";

		let textToInsert = inserts.join("\n\n");
		if (prevChar !== "\n") textToInsert = `\n\n${textToInsert}`;
		if (nextChar !== "\n") textToInsert = `${textToInsert}\n\n`;

		view.dispatch({
			changes: { from: safePos, insert: textToInsert },
			selection: { anchor: safePos + textToInsert.length },
		});
		view.focus();
		toast.success(
			files.length === 1
				? "图片已插入笔记"
				: `已成功插入 ${files.length} 张图片`,
		);
	} catch (err) {
		toast.danger(err instanceof Error ? err.message : "图片上传失败");
	}
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
	onHistoryChange,
	placeholderText = "开始用 Markdown 记录…",
	readOnly = false,
	reading = false,
	noteRelPath,
	onSaveShortcut,
	onNavigateNote,
	onCreateNote,
	onOpenSearch,
	onOpenReplace
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
	const onHistoryChangeRef = useRef(onHistoryChange);
	onHistoryChangeRef.current = onHistoryChange;
	const onSaveRef = useRef(onSaveShortcut);
	onSaveRef.current = onSaveShortcut;
	const onOpenSearchRef = useRef(onOpenSearch);
	onOpenSearchRef.current = onOpenSearch;
	const onOpenReplaceRef = useRef(onOpenReplace);
	onOpenReplaceRef.current = onOpenReplace;
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
	const noteRelPathRef = useRef(noteRelPath);
	noteRelPathRef.current = noteRelPath;
	const lastHistoryStateRef = useRef({ canUndo: false, canRedo: false });

	const emitHistoryChange = useCallback(
		(view: EditorView | null, force = false) => {
			if (!onHistoryChangeRef.current) return;
			const canUndo = view ? undoDepth(view.state) > 0 : false;
			const canRedo = view ? redoDepth(view.state) > 0 : false;
			if (
				force ||
				lastHistoryStateRef.current.canUndo !== canUndo ||
				lastHistoryStateRef.current.canRedo !== canRedo
			) {
				lastHistoryStateRef.current = { canUndo, canRedo };
				onHistoryChangeRef.current(canUndo, canRedo);
			}
		},
		[],
	);

	const modeCompartment = useRef(new Compartment()).current;
	const readingRef = useRef(reading);
	readingRef.current = reading;
	const readOnlyRef = useRef(readOnly);
	readOnlyRef.current = readOnly;
	const isMountedRef = useRef(false);

	const getModeExtensions = useCallback(
		(isReading: boolean, isReadOnly: boolean, path?: string) => [
			...(isReading
				? []
				: [
						markdownAutoPair(),
						wikilinkAutocomplete(),
						keymap.of([
							{
								key: "Enter",
								run: (v) => {
									const sel = v.state.selection.main;
									if (!sel.empty) {
										const selectedText = v.state.doc
											.sliceString(sel.from, sel.to)
											.trim();
										// Prevent accidental deletion if selection spans entire image embed markdown
										if (
											/^!\[\[[^\]\n]+\]\]$/.test(selectedText) ||
											/^!\[.*?\]\((?:<[^>]+>|[^)\n]+)\)$/s.test(selectedText)
										) {
											v.dispatch({
												changes: { from: sel.to, insert: "\n" },
												selection: { anchor: sel.to + 1 },
											});
											return true;
										}
									}
									return false;
								},
							},
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
			livePreview({
				readingMode: isReading,
				noteRelPath: path,
				onPreviewImage: (data) =>
					openPreviewRef.current({ src: data.src, title: data.alt }),
				onNavigateNote: (rel) => onNavigateNoteRef.current?.(rel),
				onCreateNote: (name) => onCreateNoteRef.current?.(name),
			}),
			...(isReading ? [readingTheme] : []),
			// 阅读视图不设 EditorState.readOnly：保留复选框等控件的程序化改写能力
			EditorState.readOnly.of(isReading ? false : isReadOnly),
			EditorView.editable.of(!(isReadOnly || isReading)),
		],
		[],
	);

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
					{
						key: "Mod-f",
						run: () => {
							if (onOpenSearchRef.current) {
								onOpenSearchRef.current();
								return true;
							}
							return false;
						},
					},
					{
						key: "Mod-Alt-f",
						run: () => {
							if (onOpenReplaceRef.current) {
								onOpenReplaceRef.current();
								return true;
							}
							return false;
						},
					},
				]),
			),
			history(),
			search({ top: true }),
			cmSearchHighlightExtension(),
			markdown({ base: markdownLanguage, codeLanguages: languages }),
			syntaxHighlighting(appHighlightStyle, { fallback: true }),
			keymap.of([...defaultKeymap, ...historyKeymap]),
			placeholder(placeholderText),
			EditorView.lineWrapping,
			aiSelectionDecorationExtension(),
			appTheme,
			modeCompartment.of(getModeExtensions(reading, readOnly, path)),
			EditorView.domEventHandlers({
				dragover(event) {
					if (readOnlyRef.current || readingRef.current) return false;
					if (event.dataTransfer?.types.includes("Files")) {
						event.preventDefault();
						event.dataTransfer.dropEffect = "copy";
						return true;
					}
					return false;
				},
				drop(event, v) {
					if (readOnlyRef.current || readingRef.current) return false;
					const files = Array.from(event.dataTransfer?.files ?? []);
					const imageFiles = files.filter(isImageFile);
					if (imageFiles.length === 0) return false;

					event.preventDefault();
					event.stopPropagation();

					const pos =
						v.posAtCoords({ x: event.clientX, y: event.clientY }) ??
						v.state.selection.main.head;
					void insertUploadedImages(imageFiles, pos, v, noteRelPathRef.current);
					return true;
				},
				paste(event, v) {
					if (readOnlyRef.current || readingRef.current) return false;

					// 1. Handle pasted image files (e.g. screenshots from clipboard)
					const files = Array.from(event.clipboardData?.files ?? []);
					const imageFiles = files.filter(isImageFile);
					if (imageFiles.length > 0) {
						event.preventDefault();
						event.stopPropagation();
						const pos = v.state.selection.main.head;
						void insertUploadedImages(
							imageFiles,
							pos,
							v,
							noteRelPathRef.current,
						);
						return true;
					}

					// 2. Handle HTML paste to Markdown
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
					event.preventDefault();
					const hasCmSelection = !v.state.selection.main.empty;
					const domSel = window.getSelection()?.toString();
					const hasDomSelection = Boolean(domSel && domSel.length > 0);

					// Move caret to click position when clicking outside active selection
					if (!hasDomSelection && !hasCmSelection) {
						const pos = v.posAtCoords({
							x: event.clientX,
							y: event.clientY,
						});
						if (pos != null && !readingRef.current && !readOnlyRef.current) {
							const inSelection = v.state.selection.ranges.some(
								(r) => pos >= r.from && pos <= r.to,
							);
							if (!inSelection) {
								v.dispatch({ selection: { anchor: pos } });
							}
						}
					}
					if (!readingRef.current && !readOnlyRef.current) v.focus();
					setContextMenu({
						x: event.clientX,
						y: event.clientY,
					});
					return true;
				},
			}),
			EditorView.updateListener.of((update) => {
				if (update.docChanged) {
					selfChangeRef.current = true;
					const currentPath = noteRelPathRef.current;
					if (currentPath) {
						saveCachedNoteState(currentPath, update.state, {
							top: update.view.scrollDOM.scrollTop,
							left: update.view.scrollDOM.scrollLeft,
						});
					}
					// Debounce toString via rAF: coalesce multiple rapid updates into one
					if (!rafIdRef.current) {
						rafIdRef.current = requestAnimationFrame(() => {
							rafIdRef.current = 0;
							const v = viewRef.current;
							if (v) onChangeRef.current(v.state.doc.toString());
						});
					}
				}
				if (update.selectionSet) {
					const sel = update.state.selection.main;
					if (sel.empty) {
						update.view.dom
							.querySelectorAll(".cm-live-media-selected")
							.forEach((el) => {
								el.classList.remove("cm-live-media-selected");
							});
					}
				}
				if (update.docChanged || update.transactions.length > 0) {
					emitHistoryChange(update.view);
				}
			}),
		],
		[
			getModeExtensions,
			reading,
			readOnly,
			placeholderText,
			modeCompartment,
			emitHistoryChange,
		],
	);

	// 编辑器实例创建（优先复用缓存状态以保留撤销/重做历史）；外部值同步走下方 effect，回调经 ref 透传
	// biome-ignore lint/correctness/useExhaustiveDependencies: 实例只随挂载创建一次
	useEffect(() => {
		if (!containerRef.current) return;

		const currentPath = noteRelPathRef.current;
		const cached = currentPath ? getCachedNoteState(currentPath) : null;
		let initialState: EditorState;
		const extensions = getExtensions(currentPath);

		if (cached) {
			const cachedDoc = cached.state.doc.toString();
			// Reconfigure extensions for new instance, preserving the note's isolated history stack intact
			initialState = cached.state.update({
				effects: StateEffect.reconfigure.of(extensions),
			}).state;

			// If the cached note has newer unsaved edits, align parent draft state immediately
			if (cachedDoc !== value) {
				onChangeRef.current(cachedDoc);
			}
		} else {
			initialState = EditorState.create({
				doc: value,
				extensions,
			});
		}

		const view = new EditorView({
			parent: containerRef.current,
			state: initialState,
		});
		viewRef.current = view;

		if (cached?.scroll) {
			view.scrollDOM.scrollTop = cached.scroll.top;
			view.scrollDOM.scrollLeft = cached.scroll.left;
		}

		onReadyRef.current?.(view);
		emitHistoryChange(view, true);

		// Double-check history status after React layout batching
		requestAnimationFrame(() => {
			if (viewRef.current === view) {
				onReadyRef.current?.(view);
				emitHistoryChange(view, true);
			}
		});

		// Synchronize CodeMirror heightMap after DOM layout stabilizes
		requestAnimationFrame(() => {
			view.requestMeasure();
		});

		// Re-measure after asynchronous web fonts (e.g. Google Fonts Inter) finish loading
		if (typeof document !== "undefined" && document.fonts) {
			document.fonts.ready.then(() => {
				if (viewRef.current === view) {
					view.requestMeasure();
				}
			});
		}

		// Keep heightMap accurate across panel resize, tab split, or flexbox container layout shifts
		const resizeObserver = new ResizeObserver(() => {
			if (viewRef.current === view) {
				view.requestMeasure();
			}
		});
		resizeObserver.observe(containerRef.current);

		return () => {
			resizeObserver.disconnect();
			const activePath = noteRelPathRef.current;
			if (activePath && viewRef.current) {
				saveCachedNoteState(activePath, viewRef.current.state, {
					top: viewRef.current.scrollDOM.scrollTop,
					left: viewRef.current.scrollDOM.scrollLeft,
				});
			}
			if (rafIdRef.current) {
				cancelAnimationFrame(rafIdRef.current);
				rafIdRef.current = 0;
				if (viewRef.current) {
					onChangeRef.current(viewRef.current.state.doc.toString());
				}
			}
			onReadyRef.current?.(null);
			emitHistoryChange(null, true);
			view.destroy();
			viewRef.current = null;
		};
	}, []);

	// Dynamically reconfigure mode extensions when reading or readOnly toggles, preserving exact scroll position
	useEffect(() => {
		if (!isMountedRef.current) {
			isMountedRef.current = true;
			return;
		}
		const view = viewRef.current;
		if (!view) return;

		// Record current scroll position before reconfiguration
		const currentScrollTop = view.scrollDOM.scrollTop;
		const currentScrollLeft = view.scrollDOM.scrollLeft;

		view.dispatch({
			effects: modeCompartment.reconfigure(
				getModeExtensions(reading, readOnly, noteRelPath),
			),
		});

		// Restore scroll position immediately and after the browser layout cycle
		view.scrollDOM.scrollTop = currentScrollTop;
		view.scrollDOM.scrollLeft = currentScrollLeft;
		requestAnimationFrame(() => {
			if (view.scrollDOM) {
				view.scrollDOM.scrollTop = currentScrollTop;
				view.scrollDOM.scrollLeft = currentScrollLeft;
			}
		});
	}, [reading, readOnly, noteRelPath, getModeExtensions, modeCompartment]);

	// Cleanly switch note state when noteRelPath changes without unmounting DOM
	useEffect(() => {
		if (prevRelPathRef.current === noteRelPath) return;
		const oldPath = prevRelPathRef.current;
		prevRelPathRef.current = noteRelPath;
		const view = viewRef.current;
		if (!view) return;

		// Save previous note editor state before switching to new note
		if (oldPath) {
			saveCachedNoteState(oldPath, view.state, {
				top: view.scrollDOM.scrollTop,
				left: view.scrollDOM.scrollLeft,
			});
		}

		const cached = noteRelPath ? getCachedNoteState(noteRelPath) : null;
		let nextState: EditorState;
		const freshExtensions = getExtensions(noteRelPath);

		if (cached) {
			const cachedDoc = cached.state.doc.toString();
			// Reconfigure extensions preserving the note's isolated history stack
			nextState = cached.state.update({
				effects: StateEffect.reconfigure.of(freshExtensions),
			}).state;
			if (cachedDoc !== value) {
				onChangeRef.current(cachedDoc);
			}
		} else {
			nextState = EditorState.create({
				doc: value,
				extensions: freshExtensions,
			});
		}

		view.setState(nextState);
		if (cached?.scroll) {
			view.scrollDOM.scrollTop = cached.scroll.top;
			view.scrollDOM.scrollLeft = cached.scroll.left;
		} else {
			view.scrollDOM.scrollTop = 0;
		}
		emitHistoryChange(view, true);
		requestAnimationFrame(() => {
			if (viewRef.current === view) {
				view.requestMeasure();
			}
		});
	}, [noteRelPath, value, getExtensions, emitHistoryChange]);

	// External value sync within the same note: skip when the change originated from editor itself
	useEffect(() => {
		if (prevRelPathRef.current !== noteRelPath) return;
		const view = viewRef.current;
		if (!view) return;
		const current = view.state.doc.toString();
		if (value === current) return;
		if (selfChangeRef.current) {
			selfChangeRef.current = false;
			// Never swallow incoming non-empty content if editor is currently blank
			if (current.trim().length > 0 || !value.trim()) {
				return;
			}
		}
		// Apply external synchronization without polluting the note's private undo/redo history
		view.dispatch({
			changes: { from: 0, to: current.length, insert: value },
			annotations: Transaction.addToHistory.of(false),
		});
	}, [value, noteRelPath]);

	const handleContextMenu = useCallback((event: React.MouseEvent) => {
		const v = viewRef.current;
		if (!v) return;
		event.preventDefault();

		const hasCmSelection = !v.state.selection.main.empty;
		const domSel = window.getSelection()?.toString();
		const hasDomSelection = Boolean(domSel && domSel.length > 0);

		// Move caret to click position when clicking outside active selection
		if (!hasDomSelection && !hasCmSelection) {
			const pos = v.posAtCoords({
				x: event.clientX,
				y: event.clientY,
			});
			if (pos != null && !readingRef.current && !readOnlyRef.current) {
				const inSelection = v.state.selection.ranges.some(
					(r) => pos >= r.from && pos <= r.to,
				);
				if (!inSelection) {
					v.dispatch({ selection: { anchor: pos } });
				}
			}
		}

		if (!readingRef.current && !readOnlyRef.current) {
			v.focus();
		}

		setContextMenu({
			x: event.clientX,
			y: event.clientY,
		});
	}, []);

	return (
		<>
			{/* biome-ignore lint/a11y/noStaticElementInteractions: context menu handler on editor wrapper container */}
			<div
				ref={containerRef}
				className="h-full min-h-0"
				onContextMenu={handleContextMenu}
			/>
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
