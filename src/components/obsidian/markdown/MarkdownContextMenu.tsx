import { redo, redoDepth, undo, undoDepth } from "@codemirror/commands";
import { EditorView } from "@codemirror/view";
import { toast } from "@heroui/react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
	clearFormatting,
	insertLink,
	toggleBlockFormat,
	toggleInlineFormat,
} from "./formatCommands";

/**
 * Obsidian-style context menu: Clipboard + Text Formatting + Paragraph Settings + Clear Formatting + Undo/Redo.
 * Mounted by MarkdownEditor on contextmenu events, closed on backdrop click / Esc / action execution.
 */

export interface MarkdownContextMenuProps {
	x: number;
	y: number;
	view: EditorView;
	onClose: () => void;
}

interface MenuEntry {
	label: string;
	hint?: string;
	action: (view: EditorView) => boolean | Promise<boolean>;
	disabled?: (view: EditorView) => boolean;
}

interface MenuSection {
	title: string;
	entries: MenuEntry[];
}

/**
 * Determine whether the editor is in read-only or non-editable reading mode
 */
function isReadOnly(view: EditorView): boolean {
	return view.state.readOnly || !view.state.facet(EditorView.editable);
}

/**
 * Check if text is currently selected in CodeMirror or native DOM selection
 */
function hasSelection(view: EditorView): boolean {
	if (!view.state.selection.main.empty) return true;
	const domSel = window.getSelection()?.toString();
	return Boolean(domSel && domSel.length > 0);
}

/**
 * Copy selected text to system clipboard with user toast feedback
 */
async function copySelection(view: EditorView): Promise<boolean> {
	let text = "";
	const sel = view.state.selection.main;
	if (!sel.empty) {
		text = view.state.sliceDoc(sel.from, sel.to);
	} else {
		text = window.getSelection()?.toString() ?? "";
	}
	if (!text) return false;
	try {
		await navigator.clipboard.writeText(text);
		toast.success("已复制到剪贴板");
		return true;
	} catch {
		return false;
	}
}

/**
 * Cut selected text and remove from editor document
 */
async function cutSelection(view: EditorView): Promise<boolean> {
	if (isReadOnly(view)) return false;
	const sel = view.state.selection.main;
	if (sel.empty) return false;
	const text = view.state.sliceDoc(sel.from, sel.to);
	try {
		await navigator.clipboard.writeText(text);
		view.dispatch({
			changes: { from: sel.from, to: sel.to, insert: "" },
			selection: { anchor: sel.from },
		});
		toast.success("已剪切");
		return true;
	} catch {
		return false;
	}
}

/**
 * Paste clipboard text into current selection or cursor position
 */
async function pasteClipboard(view: EditorView): Promise<boolean> {
	if (isReadOnly(view)) return false;
	try {
		const text = await navigator.clipboard.readText();
		if (!text) return false;
		const range = view.state.selection.main;
		view.dispatch({
			changes: { from: range.from, to: range.to, insert: text },
			selection: { anchor: range.from + text.length },
		});
		return true;
	} catch {
		return false;
	}
}

const SECTIONS: MenuSection[] = [
	{
		title: "历史操作",
		entries: [
			{
				label: "撤销",
				hint: "⌘Z",
				action: (v) => undo(v),
				disabled: (v) => isReadOnly(v) || undoDepth(v.state) === 0,
			},
			{
				label: "重做",
				hint: "⌘⇧Z",
				action: (v) => redo(v),
				disabled: (v) => isReadOnly(v) || redoDepth(v.state) === 0,
			},
		],
	},
	{
		title: "剪贴板",
		entries: [
			{
				label: "剪切",
				hint: "⌘X",
				action: (v) => cutSelection(v),
				disabled: (v) => isReadOnly(v) || !hasSelection(v),
			},
			{
				label: "复制",
				hint: "⌘C",
				action: (v) => copySelection(v),
				disabled: (v) => !hasSelection(v),
			},
			{
				label: "粘贴",
				hint: "⌘V",
				action: (v) => pasteClipboard(v),
				disabled: (v) => isReadOnly(v),
			},
			{
				label: "全选",
				hint: "⌘A",
				action: (v) => {
					v.dispatch({ selection: { anchor: 0, head: v.state.doc.length } });
					return true;
				},
			},
		],
	},
	{
		title: "文本格式",
		entries: [
			{
				label: "加粗",
				hint: "⌘B",
				action: (v) => toggleInlineFormat(v, "bold"),
				disabled: (v) => isReadOnly(v),
			},
			{
				label: "倾斜",
				hint: "⌘I",
				action: (v) => toggleInlineFormat(v, "italic"),
				disabled: (v) => isReadOnly(v),
			},
			{
				label: "删除线",
				hint: "⌘⇧X",
				action: (v) => toggleInlineFormat(v, "strike"),
				disabled: (v) => isReadOnly(v),
			},
			{
				label: "高亮",
				hint: "⌘⇧H",
				action: (v) => toggleInlineFormat(v, "highlight"),
				disabled: (v) => isReadOnly(v),
			},
			{
				label: "代码",
				hint: "⌘E",
				action: (v) => toggleInlineFormat(v, "code"),
				disabled: (v) => isReadOnly(v),
			},
			{
				label: "链接",
				hint: "⌘K",
				action: (v) => insertLink(v),
				disabled: (v) => isReadOnly(v),
			},
		],
	},
	{
		title: "段落设置",
		entries: [
			{
				label: "标题 1",
				action: (v) => toggleBlockFormat(v, "h1"),
				disabled: (v) => isReadOnly(v),
			},
			{
				label: "标题 2",
				action: (v) => toggleBlockFormat(v, "h2"),
				disabled: (v) => isReadOnly(v),
			},
			{
				label: "标题 3",
				action: (v) => toggleBlockFormat(v, "h3"),
				disabled: (v) => isReadOnly(v),
			},
			{
				label: "引用",
				action: (v) => toggleBlockFormat(v, "quote"),
				disabled: (v) => isReadOnly(v),
			},
			{
				label: "无序列表",
				action: (v) => toggleBlockFormat(v, "bullet"),
				disabled: (v) => isReadOnly(v),
			},
			{
				label: "有序列表",
				action: (v) => toggleBlockFormat(v, "ordered"),
				disabled: (v) => isReadOnly(v),
			},
			{
				label: "任务列表",
				action: (v) => toggleBlockFormat(v, "task"),
				disabled: (v) => isReadOnly(v),
			},
		],
	},
	{
		title: "",
		entries: [
			{
				label: "清除格式",
				action: (v) => clearFormatting(v),
				disabled: (v) => isReadOnly(v),
			},
		],
	},
];

export function MarkdownContextMenu({
	x,
	y,
	view,
	onClose,
}: MarkdownContextMenuProps) {
	const menuRef = useRef<HTMLDivElement>(null);
	// Screen bounds correction: clamp menu into viewport after mounting
	const [pos, setPos] = useState({ x, y });

	useEffect(() => {
		const el = menuRef.current;
		if (!el) return;
		const rect = el.getBoundingClientRect();
		const nx = Math.min(x, window.innerWidth - rect.width - 8);
		const ny = Math.min(y, window.innerHeight - rect.height - 8);
		if (nx !== x || ny !== y)
			setPos({ x: Math.max(8, nx), y: Math.max(8, ny) });
	}, [x, y]);

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				e.stopPropagation();
				onClose();
			}
		};
		window.addEventListener("keydown", onKey, true);
		return () => window.removeEventListener("keydown", onKey, true);
	}, [onClose]);

	const run = async (entry: MenuEntry) => {
		onClose();
		await entry.action(view);
		view.focus();
	};

	return createPortal(
		<>
			{/* 透明 backdrop：左键/右键点击任意处关闭 */}
			{/* biome-ignore lint/a11y/noStaticElementInteractions lint/a11y/useKeyWithClickEvents: backdrop 仅用于点击关闭菜单，Esc 关闭已挂在 window 上 */}
			<div
				className="fixed inset-0 z-40"
				onClick={onClose}
				onContextMenu={(e) => {
					e.preventDefault();
					onClose();
				}}
			/>
			<div
				ref={menuRef}
				className="fixed z-50 min-w-[176px] max-h-[min(540px,calc(100vh-32px))] overflow-y-auto rounded-xl border border-border bg-surface p-1 shadow-xl"
				style={{ left: pos.x, top: pos.y }}
			>
				{SECTIONS.map((section, i) => (
					<div key={section.title || "tail"}>
						{i > 0 && <div className="mx-2 my-1 border-t border-border" />}
						{section.title && (
							<div className="px-2.5 pt-1.5 pb-0.5 text-[11px] text-muted">
								{section.title}
							</div>
						)}
						{section.entries.map((entry) => {
							const isDisabled = entry.disabled?.(view) ?? false;
							return (
								<button
									key={entry.label}
									type="button"
									disabled={isDisabled}
									className={`flex w-full items-center justify-between gap-6 rounded-lg px-2.5 py-1.5 text-left text-[13px] transition-colors ${
										isDisabled
											? "text-muted/40 cursor-not-allowed"
											: "text-foreground hover:bg-surface-secondary"
									}`}
									onClick={() => !isDisabled && run(entry)}
								>
									<span>{entry.label}</span>
									{entry.hint && (
										<span
											className={
												isDisabled
													? "text-[11px] text-muted/30"
													: "text-[11px] text-muted"
											}
										>
											{entry.hint}
										</span>
									)}
								</button>
							);
						})}
					</div>
				))}
			</div>
		</>,
		document.body,
	);
}
