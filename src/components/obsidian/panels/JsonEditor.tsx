import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
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
import { useEffect, useRef } from "react";
import { appHighlightStyle, appTheme } from "../markdown/editorTheme";

export interface JsonEditorProps {
	/** 受控初始值；仅在外部值与编辑器内容不一致时同步（如合并回灌） */
	value: string;
	onChange: (value: string) => void;
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
	readOnly = false,
	onSaveShortcut,
}: JsonEditorProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const viewRef = useRef<EditorView | null>(null);
	const onChangeRef = useRef(onChange);
	onChangeRef.current = onChange;
	const onSaveRef = useRef(onSaveShortcut);
	onSaveRef.current = onSaveShortcut;
	const selfChangeRef = useRef(false);
	const rafIdRef = useRef(0);

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
					}),
				],
			}),
		});
		viewRef.current = view;
		return () => {
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
