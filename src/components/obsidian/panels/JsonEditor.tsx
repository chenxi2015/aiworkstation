import {
	defaultKeymap,
	history,
	historyKeymap,
	redoDepth,
	undoDepth,
} from "@codemirror/commands";
import { json } from "@codemirror/lang-json";
import { syntaxHighlighting } from "@codemirror/language";
import { searchKeymap } from "@codemirror/search";
import { EditorState, Prec } from "@codemirror/state";
import {
	EditorView,
	highlightActiveLine,
	highlightActiveLineGutter,
	keymap,
	lineNumbers,
} from "@codemirror/view";
import { useCallback, useEffect, useRef } from "react";
import { appHighlightStyle, appTheme } from "../markdown/editorTheme";

export interface JsonEditorProps {
	/** 受控初始值；仅在外部值与编辑器内容不一致时同步（如合并回灌） */
	value: string;
	onChange: (value: string) => void;
	onReady?: (view: EditorView | null) => void;
	/** 撤销/重做可用状态变化回调 */
	onHistoryChange?: (canUndo: boolean, canRedo: boolean) => void;
	readOnly?: boolean;
	onSaveShortcut?: () => void;
}

/**
 * 轻量 CodeMirror JSON 源码编辑器（.canvas 源码模式）：
 * 复用笔记编辑器主题与受控同步模式，由父组件以 key=relPath 控制重建。
 */
export function JsonEditor({
	value,
	onChange,
	onReady,
	onHistoryChange,
	readOnly = false,
	onSaveShortcut,
}: JsonEditorProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const viewRef = useRef<EditorView | null>(null);
	const onChangeRef = useRef(onChange);
	onChangeRef.current = onChange;
	const onReadyRef = useRef(onReady);
	onReadyRef.current = onReady;
	const onHistoryChangeRef = useRef(onHistoryChange);
	onHistoryChangeRef.current = onHistoryChange;
	const onSaveRef = useRef(onSaveShortcut);
	onSaveRef.current = onSaveShortcut;
	const selfChangeRef = useRef(false);
	const rafIdRef = useRef(0);
	const lastHistoryStateRef = useRef({ canUndo: false, canRedo: false });

	const emitHistoryChange = useCallback((view: EditorView | null) => {
		if (!onHistoryChangeRef.current) return;
		const canUndo = view ? undoDepth(view.state) > 0 : false;
		const canRedo = view ? redoDepth(view.state) > 0 : false;
		if (
			lastHistoryStateRef.current.canUndo !== canUndo ||
			lastHistoryStateRef.current.canRedo !== canRedo
		) {
			lastHistoryStateRef.current = { canUndo, canRedo };
			onHistoryChangeRef.current(canUndo, canRedo);
		}
	}, []);

	// 编辑器实例只随挂载创建一次；外部值同步走下方 effect，回调经 ref 透传
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
					highlightActiveLine(),
					highlightActiveLineGutter(),
					history(),
					json(),
					syntaxHighlighting(appHighlightStyle, { fallback: true }),
					keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),
					EditorView.lineWrapping,
					appTheme,
					EditorState.readOnly.of(readOnly),
					EditorView.editable.of(!readOnly),
					EditorView.updateListener.of((update) => {
						if (update.docChanged) {
							selfChangeRef.current = true;
							if (!rafIdRef.current) {
								rafIdRef.current = requestAnimationFrame(() => {
									rafIdRef.current = 0;
									const v = viewRef.current;
									if (v) onChangeRef.current(v.state.doc.toString());
								});
							}
						}
						if (update.docChanged || update.transactions.length > 0) {
							emitHistoryChange(update.view);
						}
					}),
				],
			}),
		});
		viewRef.current = view;
		onReadyRef.current?.(view);
		emitHistoryChange(view);
		return () => {
			onReadyRef.current?.(null);
			emitHistoryChange(null);
			if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
			view.destroy();
			viewRef.current = null;
		};
	}, []);

	// 外部值同步：跳过编辑器自身发起的变更
	useEffect(() => {
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
	}, [value]);

	return <div ref={containerRef} className="h-full min-h-0" />;
}
