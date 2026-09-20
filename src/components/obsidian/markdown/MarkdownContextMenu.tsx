import type { EditorView } from "@codemirror/view";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
	clearFormatting,
	insertLink,
	toggleBlockFormat,
	toggleInlineFormat,
} from "./formatCommands";

/**
 * Obsidian 风格右键菜单：文本格式 + 段落设置 + 清除格式。
 * 由 MarkdownEditor 在 contextmenu 事件中挂载，点击外部 / Esc / 执行命令后关闭。
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
	action: (view: EditorView) => boolean;
}

interface MenuSection {
	title: string;
	entries: MenuEntry[];
}

const SECTIONS: MenuSection[] = [
	{
		title: "文本格式",
		entries: [
			{
				label: "加粗",
				hint: "⌘B",
				action: (v) => toggleInlineFormat(v, "bold"),
			},
			{
				label: "倾斜",
				hint: "⌘I",
				action: (v) => toggleInlineFormat(v, "italic"),
			},
			{
				label: "删除线",
				hint: "⌘⇧X",
				action: (v) => toggleInlineFormat(v, "strike"),
			},
			{
				label: "高亮",
				hint: "⌘⇧H",
				action: (v) => toggleInlineFormat(v, "highlight"),
			},
			{
				label: "代码",
				hint: "⌘E",
				action: (v) => toggleInlineFormat(v, "code"),
			},
			{ label: "链接", hint: "⌘K", action: (v) => insertLink(v) },
		],
	},
	{
		title: "段落设置",
		entries: [
			{ label: "标题 1", action: (v) => toggleBlockFormat(v, "h1") },
			{ label: "标题 2", action: (v) => toggleBlockFormat(v, "h2") },
			{ label: "标题 3", action: (v) => toggleBlockFormat(v, "h3") },
			{ label: "引用", action: (v) => toggleBlockFormat(v, "quote") },
			{ label: "无序列表", action: (v) => toggleBlockFormat(v, "bullet") },
			{ label: "有序列表", action: (v) => toggleBlockFormat(v, "ordered") },
			{ label: "任务列表", action: (v) => toggleBlockFormat(v, "task") },
		],
	},
	{
		title: "",
		entries: [{ label: "清除格式", action: (v) => clearFormatting(v) }],
	},
];

export function MarkdownContextMenu({
	x,
	y,
	view,
	onClose,
}: MarkdownContextMenuProps) {
	const menuRef = useRef<HTMLDivElement>(null);
	// 出屏修正：挂载后按实际尺寸收回视口内
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

	const run = (entry: MenuEntry) => {
		entry.action(view);
		onClose();
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
				className="fixed z-50 min-w-[176px] rounded-xl border border-border bg-surface p-1 shadow-xl"
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
						{section.entries.map((entry) => (
							<button
								key={entry.label}
								type="button"
								className="flex w-full items-center justify-between gap-6 rounded-lg px-2.5 py-1.5 text-left text-[13px] text-foreground transition-colors hover:bg-surface-secondary"
								onClick={() => run(entry)}
							>
								<span>{entry.label}</span>
								{entry.hint && (
									<span className="text-[11px] text-muted">{entry.hint}</span>
								)}
							</button>
						))}
					</div>
				))}
			</div>
		</>,
		document.body,
	);
}
