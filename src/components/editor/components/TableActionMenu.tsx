import type { Editor } from "@tiptap/core";
import {
	ArrowDownToLine,
	ArrowLeftToLine,
	ArrowRightToLine,
	ArrowUpToLine,
	ChevronDown,
	Columns3,
	Rows3,
	TableCellsMerge,
	TableCellsSplit,
	TableProperties,
	Trash2,
} from "lucide-react";
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

type DropdownKind = "row" | "column" | null;

interface ToolbarButtonProps {
	title: string;
	onClick: () => void;
	disabled?: boolean;
	danger?: boolean;
	active?: boolean;
	children: React.ReactNode;
}

function ToolbarButton({
	title,
	onClick,
	disabled,
	danger,
	active,
	children,
}: ToolbarButtonProps) {
	const base =
		"flex items-center justify-center w-7 h-7 rounded-md transition-colors";
	const state = disabled
		? "text-muted/40 cursor-not-allowed"
		: danger
			? "text-danger/80 hover:text-danger hover:bg-danger/10 cursor-pointer"
			: active
				? "text-accent bg-accent/10 cursor-pointer"
				: "text-muted hover:text-foreground hover:bg-muted/15 cursor-pointer";

	return (
		<button
			type="button"
			title={title}
			aria-label={title}
			disabled={disabled}
			onClick={onClick}
			className={`${base} ${state}`}
		>
			{children}
		</button>
	);
}

interface DropdownItemProps {
	icon: React.ReactNode;
	label: string;
	danger?: boolean;
	onClick: () => void;
}

function DropdownItem({ icon, label, danger, onClick }: DropdownItemProps) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={`w-full flex items-center gap-2 px-2.5 py-1.5 text-xs rounded-md transition-colors cursor-pointer ${
				danger
					? "text-danger/80 hover:text-danger hover:bg-danger/10"
					: "text-foreground/80 hover:text-foreground hover:bg-muted/15"
			}`}
		>
			<span className="shrink-0 flex items-center">{icon}</span>
			<span className="whitespace-nowrap">{label}</span>
		</button>
	);
}

const ICON_CLS = "w-3.5 h-3.5";

/**
 * Floating toolbar anchored to the active or hovered table in the editor.
 * Tiptap/Notion style: icon buttons + grouped dropdowns for row/column ops.
 */
export function TableActionMenu({ editor }: TableActionMenuProps) {
	const [pos, setPos] = useState<FloatPosition>({
		top: 0,
		right: 0,
		visible: false,
	});
	const [openDropdown, setOpenDropdown] = useState<DropdownKind>(null);
	// Forces re-render so can() states (merge/split) stay fresh
	const [, setEditorTick] = useState(0);
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
			tableRect.bottom < 48 ||
			tableRect.top > window.innerHeight
		) {
			setPos((prev) => (prev.visible ? { ...prev, visible: false } : prev));
			return;
		}

		const menuH = menuRef.current?.offsetHeight || 36;
		const GAP = 8;
		// Position above the top-right corner of the table
		let top = tableRect.top - menuH - 6;
		if (top < GAP) {
			// Table top clipped by viewport: stick to the table's visible top edge
			// instead of jumping deep into the table body
			top = Math.min(
				Math.max(tableRect.top + 6, GAP),
				tableRect.bottom - menuH - 6,
			);
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
			setEditorTick((tick) => tick + 1);
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
			setOpenDropdown(null);
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

	// Close dropdown when clicking outside the menu
	useEffect(() => {
		if (!openDropdown) return;
		const handlePointerDown = (e: MouseEvent) => {
			if (!menuRef.current?.contains(e.target as Node)) {
				setOpenDropdown(null);
			}
		};
		document.addEventListener("mousedown", handlePointerDown);
		return () => document.removeEventListener("mousedown", handlePointerDown);
	}, [openDropdown]);

	if (!pos.visible) return null;

	// Prevent blur when clicking buttons
	const preventDefault = (e: React.MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
	};

	const runCommand = (command: () => void) => {
		setOpenDropdown(null);
		command();
	};

	const toggleDropdown = (kind: Exclude<DropdownKind, null>) => {
		setOpenDropdown((prev) => (prev === kind ? null : kind));
	};

	const canMerge = editor.can().mergeCells();
	const canSplit = editor.can().splitCell();

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
			className="fixed z-40 flex items-center gap-0.5 p-1 bg-surface/95 backdrop-blur-md border border-border/80 shadow-lg rounded-xl text-foreground select-none animate-in fade-in zoom-in-95 duration-150"
		>
			{/* Row dropdown */}
			<div className="relative">
				<button
					type="button"
					title="行操作"
					aria-label="行操作"
					aria-expanded={openDropdown === "row"}
					onClick={() => toggleDropdown("row")}
					className={`flex items-center gap-0.5 h-7 pl-1.5 pr-1 rounded-md text-xs transition-colors cursor-pointer ${
						openDropdown === "row"
							? "bg-muted/15 text-foreground"
							: "text-muted hover:text-foreground hover:bg-muted/15"
					}`}
				>
					<Rows3 className={ICON_CLS} />
					<span className="font-medium">行</span>
					<ChevronDown
						className={`w-3 h-3 transition-transform ${openDropdown === "row" ? "rotate-180" : ""}`}
					/>
				</button>
				{openDropdown === "row" && (
					<div className="absolute top-full right-0 mt-1.5 w-max min-w-[10rem] p-1 bg-surface border border-border/80 shadow-lg rounded-lg animate-in fade-in zoom-in-95 duration-100">
						<DropdownItem
							icon={<ArrowUpToLine className={ICON_CLS} />}
							label="在上方插入行"
							onClick={() =>
								runCommand(() => editor.chain().focus().addRowBefore().run())
							}
						/>
						<DropdownItem
							icon={<ArrowDownToLine className={ICON_CLS} />}
							label="在下方插入行"
							onClick={() =>
								runCommand(() => editor.chain().focus().addRowAfter().run())
							}
						/>
						<div className="my-1 h-px bg-border/60" />
						<DropdownItem
							icon={<Trash2 className={ICON_CLS} />}
							label="删除当前行"
							danger
							onClick={() =>
								runCommand(() => editor.chain().focus().deleteRow().run())
							}
						/>
					</div>
				)}
			</div>

			{/* Column dropdown */}
			<div className="relative">
				<button
					type="button"
					title="列操作"
					aria-label="列操作"
					aria-expanded={openDropdown === "column"}
					onClick={() => toggleDropdown("column")}
					className={`flex items-center gap-0.5 h-7 pl-1.5 pr-1 rounded-md text-xs transition-colors cursor-pointer ${
						openDropdown === "column"
							? "bg-muted/15 text-foreground"
							: "text-muted hover:text-foreground hover:bg-muted/15"
					}`}
				>
					<Columns3 className={ICON_CLS} />
					<span className="font-medium">列</span>
					<ChevronDown
						className={`w-3 h-3 transition-transform ${openDropdown === "column" ? "rotate-180" : ""}`}
					/>
				</button>
				{openDropdown === "column" && (
					<div className="absolute top-full right-0 mt-1.5 w-max min-w-[10rem] p-1 bg-surface border border-border/80 shadow-lg rounded-lg animate-in fade-in zoom-in-95 duration-100">
						<DropdownItem
							icon={<ArrowLeftToLine className={ICON_CLS} />}
							label="在左侧插入列"
							onClick={() =>
								runCommand(() => editor.chain().focus().addColumnBefore().run())
							}
						/>
						<DropdownItem
							icon={<ArrowRightToLine className={ICON_CLS} />}
							label="在右侧插入列"
							onClick={() =>
								runCommand(() => editor.chain().focus().addColumnAfter().run())
							}
						/>
						<div className="my-1 h-px bg-border/60" />
						<DropdownItem
							icon={<Trash2 className={ICON_CLS} />}
							label="删除当前列"
							danger
							onClick={() =>
								runCommand(() => editor.chain().focus().deleteColumn().run())
							}
						/>
					</div>
				)}
			</div>

			<div className="w-px h-4 bg-border/80 mx-0.5" />

			{/* Merge / split cells */}
			<ToolbarButton
				title="合并单元格"
				disabled={!canMerge}
				onClick={() =>
					runCommand(() => editor.chain().focus().mergeCells().run())
				}
			>
				<TableCellsMerge className={ICON_CLS} />
			</ToolbarButton>
			<ToolbarButton
				title="拆分单元格"
				disabled={!canSplit}
				onClick={() =>
					runCommand(() => editor.chain().focus().splitCell().run())
				}
			>
				<TableCellsSplit className={ICON_CLS} />
			</ToolbarButton>
			<ToolbarButton
				title="切换表头行"
				onClick={() =>
					runCommand(() => editor.chain().focus().toggleHeaderRow().run())
				}
			>
				<TableProperties className={ICON_CLS} />
			</ToolbarButton>

			<div className="w-px h-4 bg-border/80 mx-0.5" />

			{/* Delete table */}
			<ToolbarButton
				title="删除表格"
				danger
				onClick={() =>
					runCommand(() => editor.chain().focus().deleteTable().run())
				}
			>
				<Trash2 className={ICON_CLS} />
			</ToolbarButton>
		</div>
	);
}
