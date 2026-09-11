import type { Editor } from "@tiptap/core";
import { Columns, Rows, Table as TableIcon, Trash2 } from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";

interface TableActionMenuProps {
	editor: Editor;
}

interface FloatPosition {
	top: number;
	right: number;
	visible: boolean;
}

/**
 * Floating toolbar anchored to the active or hovered table in the editor
 */
export function TableActionMenu({ editor }: TableActionMenuProps) {
	const [pos, setPos] = useState<FloatPosition>({
		top: 0,
		right: 0,
		visible: false,
	});
	const menuRef = useRef<HTMLDivElement>(null);
	const hoveredTableRef = useRef<HTMLTableElement | null>(null);

	// Find the current active or hovered table element
	const getTargetTable = useCallback((): HTMLTableElement | null => {
		if (!editor || !editor.view) return null;

		// 1. If currently hovering a table
		if (
			hoveredTableRef.current &&
			editor.view.dom.contains(hoveredTableRef.current)
		) {
			return hoveredTableRef.current;
		}

		// 2. If editor selection is inside a table
		if (editor.isActive("table")) {
			const domSelection = window.getSelection();
			if (domSelection?.anchorNode) {
				const el =
					domSelection.anchorNode instanceof HTMLElement
						? domSelection.anchorNode
						: domSelection.anchorNode.parentElement;
				const table = el?.closest("table");
				if (table && editor.view.dom.contains(table)) {
					return table;
				}
			}

			// Fallback: resolve from ProseMirror selection pos
			try {
				const { from } = editor.state.selection;
				const domNode = editor.view.domAtPos(from).node;
				const el =
					domNode instanceof HTMLElement ? domNode : domNode.parentElement;
				const table = el?.closest("table");
				if (table && editor.view.dom.contains(table)) {
					return table;
				}
			} catch {
				// Ignore pos resolution errors
			}
		}

		return null;
	}, [editor]);

	// Update the floating menu position
	const updatePosition = useCallback(() => {
		if (!editor.isEditable) {
			setPos((prev) => (prev.visible ? { ...prev, visible: false } : prev));
			return;
		}

		const table = getTargetTable();
		if (!table) {
			setPos((prev) => (prev.visible ? { ...prev, visible: false } : prev));
			return;
		}

		const tableRect = table.getBoundingClientRect();
		// If table is detached or offscreen
		if (
			tableRect.width === 0 ||
			tableRect.bottom < 0 ||
			tableRect.top > window.innerHeight
		) {
			setPos((prev) => (prev.visible ? { ...prev, visible: false } : prev));
			return;
		}

		const menuH = menuRef.current?.offsetHeight || 34;
		// Position at top-right corner of table
		let top = tableRect.top - menuH - 6;
		// If clipped at the viewport top, dock inside the table header
		if (top < 56) {
			top = tableRect.top + 6;
		}

		const right = Math.max(16, window.innerWidth - tableRect.right);

		setPos({
			top,
			right,
			visible: true,
		});
	}, [editor, getTargetTable]);

	// Listen for editor events, mouse events, and viewport scroll/resize
	useEffect(() => {
		const handleEvent = () => {
			updatePosition();
		};

		// Mouse enter/leave delegation for table hover detection
		const handleMouseOver = (e: MouseEvent) => {
			const target = e.target as HTMLElement | null;
			const table = target?.closest("table");
			if (table && editor.view.dom.contains(table)) {
				hoveredTableRef.current = table;
				updatePosition();
			}
		};

		const handleMouseLeave = (e: MouseEvent) => {
			const related = e.relatedTarget as HTMLElement | null;
			// Don't hide if moving onto the menu itself or staying inside the table
			if (menuRef.current?.contains(related)) return;
			if (hoveredTableRef.current?.contains(related)) return;

			hoveredTableRef.current = null;
			updatePosition();
		};

		const dom = editor.view.dom;
		dom.addEventListener("mouseover", handleMouseOver);
		dom.addEventListener("mouseleave", handleMouseLeave);

		editor.on("selectionUpdate", handleEvent);
		editor.on("transaction", handleEvent);
		editor.on("focus", handleEvent);

		// Capture phase scroll listener to catch inner container scrolling
		window.addEventListener("scroll", handleEvent, true);
		window.addEventListener("resize", handleEvent);

		return () => {
			dom.removeEventListener("mouseover", handleMouseOver);
			dom.removeEventListener("mouseleave", handleMouseLeave);
			editor.off("selectionUpdate", handleEvent);
			editor.off("transaction", handleEvent);
			editor.off("focus", handleEvent);
			window.removeEventListener("scroll", handleEvent, true);
			window.removeEventListener("resize", handleEvent);
		};
	}, [editor, updatePosition]);

	if (!pos.visible) return null;

	// Prevent blur when clicking buttons
	const preventDefault = (e: React.MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
	};

	return (
		<div
			ref={menuRef}
			role="toolbar"
			aria-label="表格操作栏"
			style={{
				top: `${pos.top}px`,
				right: `${pos.right}px`,
			}}
			onMouseDown={preventDefault}
			className="fixed z-40 flex items-center gap-0.5 px-1.5 py-1 bg-surface/95 backdrop-blur-md border border-border/80 shadow-md rounded-lg text-xs text-foreground select-none animate-in fade-in zoom-in-95 duration-150"
		>
			<div className="flex items-center gap-1 text-[11px] text-muted font-medium px-1 mr-0.5">
				<TableIcon className="w-3.5 h-3.5 text-accent" />
				<span>表格</span>
			</div>

			<div className="w-[1px] h-3.5 bg-border mx-0.5" />

			{/* Row Operations */}
			<div className="flex items-center gap-0.5">
				<button
					type="button"
					onClick={() => editor.chain().focus().addRowBefore().run()}
					className="px-1.5 py-0.5 text-[11px] text-muted hover:text-foreground hover:bg-muted/15 rounded cursor-pointer transition-colors flex items-center gap-0.5"
					title="在上方插入行"
				>
					<Rows className="w-3 h-3 text-muted/80" />
					<span>+上行</span>
				</button>
				<button
					type="button"
					onClick={() => editor.chain().focus().addRowAfter().run()}
					className="px-1.5 py-0.5 text-[11px] text-muted hover:text-foreground hover:bg-muted/15 rounded cursor-pointer transition-colors flex items-center gap-0.5"
					title="在下方插入行"
				>
					<span>+下行</span>
				</button>
				<button
					type="button"
					onClick={() => editor.chain().focus().deleteRow().run()}
					className="px-1.5 py-0.5 text-[11px] text-muted hover:text-danger hover:bg-danger/10 rounded cursor-pointer transition-colors"
					title="删除当前行"
				>
					<span>-行</span>
				</button>
			</div>

			<div className="w-[1px] h-3.5 bg-border mx-0.5" />

			{/* Column Operations */}
			<div className="flex items-center gap-0.5">
				<button
					type="button"
					onClick={() => editor.chain().focus().addColumnBefore().run()}
					className="px-1.5 py-0.5 text-[11px] text-muted hover:text-foreground hover:bg-muted/15 rounded cursor-pointer transition-colors flex items-center gap-0.5"
					title="在左侧插入列"
				>
					<Columns className="w-3 h-3 text-muted/80" />
					<span>+左列</span>
				</button>
				<button
					type="button"
					onClick={() => editor.chain().focus().addColumnAfter().run()}
					className="px-1.5 py-0.5 text-[11px] text-muted hover:text-foreground hover:bg-muted/15 rounded cursor-pointer transition-colors flex items-center gap-0.5"
					title="在右侧插入列"
				>
					<span>+右列</span>
				</button>
				<button
					type="button"
					onClick={() => editor.chain().focus().deleteColumn().run()}
					className="px-1.5 py-0.5 text-[11px] text-muted hover:text-danger hover:bg-danger/10 rounded cursor-pointer transition-colors"
					title="删除当前列"
				>
					<span>-列</span>
				</button>
			</div>

			<div className="w-[1px] h-3.5 bg-border mx-0.5" />

			{/* Toggle Header */}
			<button
				type="button"
				onClick={() => editor.chain().focus().toggleHeaderRow().run()}
				className="px-1.5 py-0.5 text-[11px] text-muted hover:text-foreground hover:bg-muted/15 rounded cursor-pointer transition-colors"
				title="切换首行表头"
			>
				<span>首行表头</span>
			</button>

			<div className="w-[1px] h-3.5 bg-border mx-0.5" />

			{/* Delete Table */}
			<button
				type="button"
				onClick={() => editor.chain().focus().deleteTable().run()}
				className="px-1.5 py-0.5 text-[11px] text-danger/80 hover:text-danger hover:bg-danger/10 rounded cursor-pointer transition-colors flex items-center gap-0.5 font-medium"
				title="删除整个表格"
			>
				<Trash2 className="w-3 h-3" />
				<span>删表</span>
			</button>
		</div>
	);
}
