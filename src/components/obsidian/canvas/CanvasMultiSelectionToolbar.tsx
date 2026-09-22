import { useReactFlow, useViewport } from "@xyflow/react";
import { FolderPlus, Palette, ScanSearch, Trash2, X } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCanvasSelection } from "./CanvasSelectionContext";
import { type AlignmentType, getNodesBoundingBox } from "./canvasAlignment";
import { COLOR_PRESETS } from "./canvasUtils";

export interface CanvasMultiSelectionToolbarProps {
	readOnly?: boolean;
	onBatchDelete?: (ids: string[]) => void;
	onBatchSetColor?: (ids: string[], color?: string) => void;
	onCreateGroupFromSelection?: (
		ids: string[],
		box: { minX: number; minY: number; width: number; height: number },
	) => void;
	onAlign?: (type: AlignmentType) => void;
}

/** Align menu item definition */
interface AlignMenuItem {
	id: AlignmentType;
	label: string;
	icon: React.ReactNode;
}

/** SVG icons matching Obsidian Canvas alignment tools exactly */
function AlignLeftIcon() {
	return (
		<svg
			aria-hidden="true"
			role="img"
			width="15"
			height="15"
			viewBox="0 0 16 16"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.5"
			strokeLinecap="round"
			strokeLinejoin="round"
		>
			<line x1="2" y1="2" x2="2" y2="14" />
			<rect x="2" y="3.5" width="10" height="3" rx="0.5" />
			<rect x="2" y="9.5" width="6" height="3" rx="0.5" />
		</svg>
	);
}

function AlignCenterHIcon() {
	return (
		<svg
			aria-hidden="true"
			role="img"
			width="15"
			height="15"
			viewBox="0 0 16 16"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.5"
			strokeLinecap="round"
			strokeLinejoin="round"
		>
			<line x1="8" y1="1" x2="8" y2="15" strokeDasharray="1.5 1.5" />
			<rect x="3" y="3.5" width="10" height="3" rx="0.5" />
			<rect x="5" y="9.5" width="6" height="3" rx="0.5" />
		</svg>
	);
}

function AlignRightIcon() {
	return (
		<svg
			aria-hidden="true"
			role="img"
			width="15"
			height="15"
			viewBox="0 0 16 16"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.5"
			strokeLinecap="round"
			strokeLinejoin="round"
		>
			<line x1="14" y1="2" x2="14" y2="14" />
			<rect x="4" y="3.5" width="10" height="3" rx="0.5" />
			<rect x="8" y="9.5" width="6" height="3" rx="0.5" />
		</svg>
	);
}

function AlignTopIcon() {
	return (
		<svg
			aria-hidden="true"
			role="img"
			width="15"
			height="15"
			viewBox="0 0 16 16"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.5"
			strokeLinecap="round"
			strokeLinejoin="round"
		>
			<line x1="2" y1="2" x2="14" y2="2" />
			<rect x="3.5" y="2" width="3" height="10" rx="0.5" />
			<rect x="9.5" y="2" width="3" height="6" rx="0.5" />
		</svg>
	);
}

function AlignCenterVIcon() {
	return (
		<svg
			aria-hidden="true"
			role="img"
			width="15"
			height="15"
			viewBox="0 0 16 16"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.5"
			strokeLinecap="round"
			strokeLinejoin="round"
		>
			<line x1="1" y1="8" x2="15" y2="8" strokeDasharray="1.5 1.5" />
			<rect x="3.5" y="3" width="3" height="10" rx="0.5" />
			<rect x="9.5" y="5" width="3" height="6" rx="0.5" />
		</svg>
	);
}

function AlignBottomIcon() {
	return (
		<svg
			aria-hidden="true"
			role="img"
			width="15"
			height="15"
			viewBox="0 0 16 16"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.5"
			strokeLinecap="round"
			strokeLinejoin="round"
		>
			<line x1="2" y1="14" x2="14" y2="14" />
			<rect x="3.5" y="4" width="3" height="10" rx="0.5" />
			<rect x="9.5" y="8" width="3" height="6" rx="0.5" />
		</svg>
	);
}

function ArrangeRowIcon() {
	return (
		<svg
			aria-hidden="true"
			role="img"
			width="15"
			height="15"
			viewBox="0 0 16 16"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.5"
			strokeLinecap="round"
			strokeLinejoin="round"
		>
			<rect x="1.5" y="4.5" width="3.5" height="7" rx="0.5" />
			<rect x="6.25" y="4.5" width="3.5" height="7" rx="0.5" />
			<rect x="11" y="4.5" width="3.5" height="7" rx="0.5" />
		</svg>
	);
}

function ArrangeColumnIcon() {
	return (
		<svg
			aria-hidden="true"
			role="img"
			width="15"
			height="15"
			viewBox="0 0 16 16"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.5"
			strokeLinecap="round"
			strokeLinejoin="round"
		>
			<rect x="3" y="2" width="10" height="3" rx="0.5" />
			<rect x="3" y="6.5" width="10" height="3" rx="0.5" />
			<rect x="3" y="11" width="10" height="3" rx="0.5" />
		</svg>
	);
}

function ArrangeGridIcon() {
	return (
		<svg
			aria-hidden="true"
			role="img"
			width="15"
			height="15"
			viewBox="0 0 16 16"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.5"
			strokeLinecap="round"
			strokeLinejoin="round"
		>
			<rect x="2" y="2" width="5" height="5" rx="0.5" />
			<rect x="9" y="2" width="5" height="5" rx="0.5" />
			<rect x="2" y="9" width="5" height="5" rx="0.5" />
			<rect x="9" y="9" width="5" height="5" rx="0.5" />
		</svg>
	);
}

function DistributeHIcon() {
	return (
		<svg
			aria-hidden="true"
			role="img"
			width="15"
			height="15"
			viewBox="0 0 16 16"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.5"
			strokeLinecap="round"
			strokeLinejoin="round"
		>
			<line x1="2" y1="2" x2="2" y2="14" />
			<line x1="14" y1="2" x2="14" y2="14" />
			<rect x="6" y="4" width="4" height="8" rx="0.5" />
		</svg>
	);
}

function DistributeVIcon() {
	return (
		<svg
			aria-hidden="true"
			role="img"
			width="15"
			height="15"
			viewBox="0 0 16 16"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.5"
			strokeLinecap="round"
			strokeLinejoin="round"
		>
			<line x1="2" y1="2" x2="14" y2="2" />
			<line x1="2" y1="14" x2="14" y2="14" />
			<rect x="4" y="6" width="8" height="4" rx="0.5" />
		</svg>
	);
}

function StretchWidthIcon() {
	return (
		<svg
			aria-hidden="true"
			role="img"
			width="15"
			height="15"
			viewBox="0 0 16 16"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.5"
			strokeLinecap="round"
			strokeLinejoin="round"
		>
			<line x1="1.5" y1="3" x2="1.5" y2="13" />
			<line x1="14.5" y1="3" x2="14.5" y2="13" />
			<rect x="3.5" y="5" width="9" height="6" rx="0.5" />
		</svg>
	);
}

function StretchHeightIcon() {
	return (
		<svg
			aria-hidden="true"
			role="img"
			width="15"
			height="15"
			viewBox="0 0 16 16"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.5"
			strokeLinecap="round"
			strokeLinejoin="round"
		>
			<line x1="3" y1="1.5" x2="13" y2="1.5" />
			<line x1="3" y1="14.5" x2="13" y2="14.5" />
			<rect x="5" y="3.5" width="6" height="9" rx="0.5" />
		</svg>
	);
}

export function AlignToolIcon() {
	return (
		<svg
			aria-hidden="true"
			role="img"
			width="15"
			height="15"
			viewBox="0 0 16 16"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.5"
			strokeLinecap="round"
			strokeLinejoin="round"
		>
			<line x1="2" y1="2" x2="2" y2="14" />
			<rect x="2" y="4" width="9" height="3.5" rx="0.5" />
			<rect x="2" y="9.5" width="5.5" height="3" rx="0.5" />
		</svg>
	);
}

/** 5 groups of alignment options matching image 1 */
export const ALIGN_GROUPS: { groupName: string; items: AlignMenuItem[] }[] = [
	{
		groupName: "horizontal-align",
		items: [
			{ id: "align-left", label: "左对齐", icon: <AlignLeftIcon /> },
			{ id: "align-center-h", label: "水平居中", icon: <AlignCenterHIcon /> },
			{ id: "align-right", label: "右对齐", icon: <AlignRightIcon /> },
		],
	},
	{
		groupName: "vertical-align",
		items: [
			{ id: "align-top", label: "顶端对齐", icon: <AlignTopIcon /> },
			{ id: "align-center-v", label: "垂直居中", icon: <AlignCenterVIcon /> },
			{ id: "align-bottom", label: "底端对齐", icon: <AlignBottomIcon /> },
		],
	},
	{
		groupName: "arrange",
		items: [
			{ id: "arrange-row", label: "按行排列", icon: <ArrangeRowIcon /> },
			{ id: "arrange-column", label: "按列排列", icon: <ArrangeColumnIcon /> },
			{ id: "arrange-grid", label: "按网格排列", icon: <ArrangeGridIcon /> },
		],
	},
	{
		groupName: "distribute",
		items: [
			{ id: "distribute-h", label: "横向分布", icon: <DistributeHIcon /> },
			{ id: "distribute-v", label: "纵向分布", icon: <DistributeVIcon /> },
		],
	},
	{
		groupName: "stretch",
		items: [
			{
				id: "stretch-width",
				label: "水平拉伸对齐",
				icon: <StretchWidthIcon />,
			},
			{
				id: "stretch-height",
				label: "纵向拉伸对齐",
				icon: <StretchHeightIcon />,
			},
		],
	},
];

export interface CanvasAlignDropdownProps {
	isOpen: boolean;
	onSelect: (type: AlignmentType) => void;
	className?: string;
}

/** Reusable alignment dropdown menu matching Figure 1 */
export function CanvasAlignDropdown({
	isOpen,
	onSelect,
	className = "right-0",
}: CanvasAlignDropdownProps) {
	if (!isOpen) return null;
	return (
		<div
			className={`absolute top-full mt-1.5 w-44 rounded-lg border border-border bg-surface py-1.5 shadow-xl z-30 animate-in fade-in zoom-in-95 duration-100 text-xs ${className}`}
		>
			{ALIGN_GROUPS.map((group, groupIdx) => (
				<div key={group.groupName}>
					{groupIdx > 0 && <div className="my-1 border-t border-border/60" />}
					{group.items.map((item) => (
						<button
							key={item.id}
							type="button"
							onClick={() => onSelect(item.id)}
							className="flex w-full items-center gap-2.5 px-3 py-1.5 text-foreground/80 hover:bg-surface-secondary/70 hover:text-foreground transition-colors text-left cursor-pointer"
						>
							<span className="text-muted shrink-0 flex items-center justify-center">
								{item.icon}
							</span>
							<span className="font-normal">{item.label}</span>
						</button>
					))}
				</div>
			))}
		</div>
	);
}

const toolbarButtonClass =
	"p-1.5 rounded-md text-muted hover:text-foreground hover:bg-surface-secondary/70 transition-colors cursor-pointer";

/**
 * Floating toolbar and multi-selection bounding box for 2+ selected canvas nodes
 */
export const CanvasMultiSelectionToolbar = memo(
	function CanvasMultiSelectionToolbar({
		readOnly = false,
		onBatchDelete,
		onBatchSetColor,
		onCreateGroupFromSelection,
		onAlign,
	}: CanvasMultiSelectionToolbarProps) {
		const { getNodes, fitView } = useReactFlow();
		const viewport = useViewport();

		const [paletteOpen, setPaletteOpen] = useState(false);
		const [alignMenuOpen, setAlignMenuOpen] = useState(false);
		const menuRef = useRef<HTMLDivElement>(null);

		// Get all currently selected nodes
		const nodes = getNodes();
		const selectedNodes = useMemo(
			() => nodes.filter((n) => n.selected),
			[nodes],
		);

		const box = useMemo(
			() => getNodesBoundingBox(selectedNodes),
			[selectedNodes],
		);

		// Close popovers on unselect or clicking outside
		useEffect(() => {
			if (selectedNodes.length < 2) {
				setPaletteOpen(false);
				setAlignMenuOpen(false);
			}
		}, [selectedNodes.length]);

		useEffect(() => {
			if (!alignMenuOpen && !paletteOpen) return;
			const handleClickOutside = (e: MouseEvent) => {
				if (
					menuRef.current &&
					!menuRef.current.contains(e.target as HTMLElement)
				) {
					setAlignMenuOpen(false);
					setPaletteOpen(false);
				}
			};
			window.addEventListener("pointerdown", handleClickOutside);
			return () =>
				window.removeEventListener("pointerdown", handleClickOutside);
		}, [alignMenuOpen, paletteOpen]);

		const selectedIds = useMemo(
			() => selectedNodes.map((n) => n.id),
			[selectedNodes],
		);

		const handleFocusSelection = useCallback(() => {
			if (selectedNodes.length === 0) return;
			fitView({
				nodes: selectedNodes,
				duration: 350,
				padding: 0.25,
			});
		}, [fitView, selectedNodes]);

		const handleDelete = useCallback(() => {
			onBatchDelete?.(selectedIds);
		}, [onBatchDelete, selectedIds]);

		const handleCreateGroup = useCallback(() => {
			if (!box) return;
			onCreateGroupFromSelection?.(selectedIds, box);
		}, [onCreateGroupFromSelection, selectedIds, box]);

		const handleAlignSelect = useCallback(
			(type: AlignmentType) => {
				onAlign?.(type);
				setAlignMenuOpen(false);
			},
			[onAlign],
		);

		const { isSelecting } = useCanvasSelection();

		if (readOnly || isSelecting || selectedNodes.length < 2 || !box) {
			return null;
		}

		// Compute screen coordinates for the bounding box
		const screenLeft = box.minX * viewport.zoom + viewport.x;
		const screenTop = box.minY * viewport.zoom + viewport.y;
		const screenWidth = box.width * viewport.zoom;
		const screenHeight = box.height * viewport.zoom;

		return (
			<>
				{/* Multi-Selection Bounding Box (Shown in image 2) */}
				<div
					className="pointer-events-none absolute z-10 transition-all duration-75"
					style={{
						left: screenLeft,
						top: screenTop,
						width: screenWidth,
						height: screenHeight,
						border: "1.5px solid rgba(120, 83, 238, 0.45)",
						borderRadius: 8,
					}}
				>
					{/* 8 control dots around the multi-selection box */}
					<span className="absolute -top-1.5 -left-1.5 w-2.5 h-2.5 rounded-full bg-[#7853ee] border border-white dark:border-zinc-900 shadow-xs" />
					<span className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-[#7853ee] border border-white dark:border-zinc-900 shadow-xs" />
					<span className="absolute -top-1.5 -right-1.5 w-2.5 h-2.5 rounded-full bg-[#7853ee] border border-white dark:border-zinc-900 shadow-xs" />
					<span className="absolute top-1/2 -left-1.5 -translate-y-1/2 w-2 h-2 rounded-full bg-[#7853ee] border border-white dark:border-zinc-900 shadow-xs" />
					<span className="absolute top-1/2 -right-1.5 -translate-y-1/2 w-2 h-2 rounded-full bg-[#7853ee] border border-white dark:border-zinc-900 shadow-xs" />
					<span className="absolute -bottom-1.5 -left-1.5 w-2.5 h-2.5 rounded-full bg-[#7853ee] border border-white dark:border-zinc-900 shadow-xs" />
					<span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-[#7853ee] border border-white dark:border-zinc-900 shadow-xs" />
					<span className="absolute -bottom-1.5 -right-1.5 w-2.5 h-2.5 rounded-full bg-[#7853ee] border border-white dark:border-zinc-900 shadow-xs" />
				</div>

				{/* Floating Action Toolbar on top-center of selection box (Shown in image 1) */}
				<div
					ref={menuRef}
					className="absolute z-20 -translate-x-1/2 -translate-y-full mb-3 flex items-center"
					style={{
						left: screenLeft + screenWidth / 2,
						top: screenTop - 8,
					}}
				>
					<div className="relative flex items-center gap-0.5 rounded-lg border border-border bg-surface px-1.5 py-1 shadow-lg backdrop-blur-md">
						{/* 1. 删除选中 */}
						<button
							type="button"
							aria-label="删除"
							title="删除"
							onClick={handleDelete}
							className={`${toolbarButtonClass} hover:!text-danger`}
						>
							<Trash2 className="w-3.5 h-3.5" />
						</button>

						{/* 2. 批量替换颜色 */}
						<button
							type="button"
							aria-label="替换颜色"
							title="替换颜色"
							onClick={() => {
								setPaletteOpen((prev) => !prev);
								setAlignMenuOpen(false);
							}}
							className={`${toolbarButtonClass} ${
								paletteOpen ? "text-accent bg-surface-secondary" : ""
							}`}
						>
							<Palette className="w-3.5 h-3.5" />
						</button>

						{/* 3. 聚焦到选中卡片 */}
						<button
							type="button"
							aria-label="聚焦到选中卡片"
							title="聚焦到选中卡片"
							onClick={handleFocusSelection}
							className={toolbarButtonClass}
						>
							<ScanSearch className="w-3.5 h-3.5" />
						</button>

						{/* 4. 创建分组 */}
						<button
							type="button"
							aria-label="创建分组"
							title="创建分组"
							onClick={handleCreateGroup}
							className={toolbarButtonClass}
						>
							<FolderPlus className="w-3.5 h-3.5" />
						</button>

						{/* 5. 对齐工具 */}
						<button
							type="button"
							aria-label="对齐与分布"
							title="对齐与分布"
							onClick={() => {
								setAlignMenuOpen((prev) => !prev);
								setPaletteOpen(false);
							}}
							className={`${toolbarButtonClass} ${
								alignMenuOpen ? "text-accent bg-surface-secondary" : ""
							}`}
						>
							<AlignToolIcon />
						</button>

						{/* 调色板浮层 */}
						{paletteOpen && (
							<div className="absolute top-full left-1/2 -translate-x-1/2 mt-1.5 flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2 py-1.5 shadow-lg z-30 animate-in fade-in zoom-in-95 duration-100">
								{Object.entries(COLOR_PRESETS).map(([key, value]) => (
									<button
										key={key}
										type="button"
										aria-label={`颜色 ${key}`}
										title={`颜色 ${key}`}
										onClick={() => {
											onBatchSetColor?.(selectedIds, key);
											setPaletteOpen(false);
										}}
										className="w-4 h-4 rounded-full cursor-pointer transition-transform hover:scale-110"
										style={{ backgroundColor: value }}
									/>
								))}
								<button
									type="button"
									aria-label="清除颜色"
									title="清除颜色"
									onClick={() => {
										onBatchSetColor?.(selectedIds, undefined);
										setPaletteOpen(false);
									}}
									className="w-4 h-4 rounded-full border border-border flex items-center justify-center text-muted hover:text-foreground cursor-pointer transition-transform hover:scale-110"
								>
									<X className="w-2.5 h-2.5" />
								</button>
							</div>
						)}

						{/* 对齐与分布下拉菜单 */}
						<CanvasAlignDropdown
							isOpen={alignMenuOpen}
							onSelect={handleAlignSelect}
						/>
					</div>
				</div>
			</>
		);
	},
);
