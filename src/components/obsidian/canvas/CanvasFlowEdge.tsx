import {
	BaseEdge,
	type Edge,
	EdgeLabelRenderer,
	type EdgeProps,
	getBezierPath,
	useReactFlow,
} from "@xyflow/react";
import {
	ArrowLeftRight,
	ArrowRight,
	Check,
	Minus,
	Palette,
	ScanSearch,
	SquarePen,
	SquareX,
	Trash2,
	X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useCanvasSelection } from "./CanvasSelectionContext";
import { COLOR_PRESETS } from "./canvasUtils";

export interface CanvasEdgeData extends Record<string, unknown> {
	/** Original color string from the .canvas file (preset id or hex) */
	rawColor?: string;
	label?: string;
	editing?: boolean;
	fromEnd?: "none" | "arrow";
	toEnd?: "none" | "arrow";
	onCommitEdgeLabel?: (id: string, label: string) => void;
	onDeleteEdge?: (id: string) => void;
	onSetEdgeColor?: (id: string, color: string | undefined) => void;
	onSetEdgeDirection?: (
		id: string,
		direction: "none" | "one-way" | "bidirectional",
	) => void;
	onClearEdgeLabel?: (id: string) => void;
	onStartEditEdge?: (id: string) => void;
}

export type CanvasFlowEdge = Edge<CanvasEdgeData, "canvasEdge">;

function autoFocus(el: HTMLInputElement | null) {
	if (!el) return;
	el.focus();
	el.select();
}

const toolbarButtonClass =
	"p-1.5 rounded-md text-muted hover:text-foreground hover:bg-surface-secondary/70 transition-colors cursor-pointer";

interface EdgeSelectionToolbarProps {
	id: string;
	data?: CanvasEdgeData;
	labelX: number;
	labelY: number;
	selected?: boolean;
}

/**
 * Action toolbar appearing above a selected edge:
 * Delete, Color Palette, Focus View, Direction Toggle (None / One-way / Bidirectional), Clear Text, Edit
 */
function EdgeSelectionToolbar({
	id,
	data,
	labelX,
	labelY,
	selected,
}: EdgeSelectionToolbarProps) {
	const [paletteOpen, setPaletteOpen] = useState(false);
	const [directionMenuOpen, setDirectionMenuOpen] = useState(false);
	const { setCenter } = useReactFlow();

	// Close popovers when edge becomes unselected
	useEffect(() => {
		if (!selected) {
			setPaletteOpen(false);
			setDirectionMenuOpen(false);
		}
	}, [selected]);

	const currentDirection: "none" | "one-way" | "bidirectional" =
		data?.fromEnd === "arrow" && data?.toEnd === "arrow"
			? "bidirectional"
			: data?.fromEnd === "none" && data?.toEnd === "none"
				? "none"
				: "one-way";

	const handleFocus = useCallback(() => {
		setCenter(labelX, labelY, { duration: 300, zoom: 1 });
	}, [setCenter, labelX, labelY]);

	return (
		<div
			role="toolbar"
			aria-label="连线工具栏"
			className="nodrag nopan absolute pointer-events-auto z-30"
			onMouseDown={(e) => e.stopPropagation()}
			onClick={(e) => e.stopPropagation()}
			onKeyDown={(e) => e.stopPropagation()}
			style={{
				transform: `translate(-50%, -100%) translate(${labelX}px, ${labelY - 14}px)`,
			}}
		>
			<div className="relative flex items-center gap-0.5 rounded-lg border border-border bg-surface p-1 shadow-md animate-in fade-in zoom-in-95 duration-100">
				{/* 1. 删除连线 */}
				<button
					type="button"
					aria-label="删除连线"
					title="删除连线"
					onClick={() => data?.onDeleteEdge?.(id)}
					className={`${toolbarButtonClass} hover:!text-danger`}
				>
					<Trash2 className="w-3.5 h-3.5" />
				</button>

				{/* 2. 替换连线颜色 */}
				<button
					type="button"
					aria-label="替换颜色"
					title="替换颜色"
					onClick={() => {
						setDirectionMenuOpen(false);
						setPaletteOpen((prev) => !prev);
					}}
					className={`${toolbarButtonClass} ${
						paletteOpen ? "text-accent bg-surface-secondary" : ""
					}`}
				>
					<Palette className="w-3.5 h-3.5" />
				</button>

				{/* 3. 聚焦到当前连线 */}
				<button
					type="button"
					aria-label="聚焦"
					title="聚焦到当前连线"
					onClick={handleFocus}
					className={toolbarButtonClass}
				>
					<ScanSearch className="w-3.5 h-3.5" />
				</button>

				{/* 4. 箭头方向切换菜单 */}
				<button
					type="button"
					aria-label="箭头方向"
					title="箭头方向"
					onClick={() => {
						setPaletteOpen(false);
						setDirectionMenuOpen((prev) => !prev);
					}}
					className={`${toolbarButtonClass} ${
						directionMenuOpen ? "text-accent bg-surface-secondary" : ""
					}`}
				>
					{currentDirection === "bidirectional" ? (
						<ArrowLeftRight className="w-3.5 h-3.5" />
					) : currentDirection === "none" ? (
						<Minus className="w-3.5 h-3.5" />
					) : (
						<ArrowRight className="w-3.5 h-3.5" />
					)}
				</button>

				{/* 5. 清除标签 */}
				<button
					type="button"
					aria-label="清空标签"
					title="清空标签"
					disabled={!data?.label}
					onClick={() => data?.onClearEdgeLabel?.(id)}
					className={`${toolbarButtonClass} disabled:opacity-30 disabled:cursor-not-allowed`}
				>
					<SquareX className="w-3.5 h-3.5" />
				</button>

				{/* 6. 编辑标签 */}
				<button
					type="button"
					aria-label="编辑标签"
					title="编辑标签"
					onClick={() => data?.onStartEditEdge?.(id)}
					className={toolbarButtonClass}
				>
					<SquarePen className="w-3.5 h-3.5" />
				</button>

				{/* 调色板浮层 */}
				{paletteOpen && (
					<div className="absolute top-full left-1/2 -translate-x-1/2 mt-1.5 flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2 py-1.5 shadow-lg z-40 animate-in fade-in zoom-in-95 duration-100">
						{Object.entries(COLOR_PRESETS).map(([key, value]) => (
							<button
								key={key}
								type="button"
								aria-label={`颜色 ${key}`}
								title={`颜色 ${key}`}
								onClick={() => {
									data?.onSetEdgeColor?.(
										id,
										data.rawColor === key ? undefined : key,
									);
									setPaletteOpen(false);
								}}
								className={`w-4 h-4 rounded-full cursor-pointer transition-transform hover:scale-110 ${
									data?.rawColor === key
										? "ring-2 ring-offset-1 ring-foreground/60"
										: ""
								}`}
								style={{ backgroundColor: value }}
							/>
						))}
						<button
							type="button"
							aria-label="清除颜色"
							title="清除颜色"
							onClick={() => {
								data?.onSetEdgeColor?.(id, undefined);
								setPaletteOpen(false);
							}}
							className={toolbarButtonClass}
						>
							<X className="w-3.5 h-3.5" />
						</button>
					</div>
				)}

				{/* 箭头方向下拉菜单 */}
				{directionMenuOpen && (
					<div className="absolute top-full left-1/2 -translate-x-1/2 mt-1.5 min-w-[105px] rounded-lg border border-border bg-surface p-1 shadow-lg z-40 flex flex-col gap-0.5 animate-in fade-in zoom-in-95 duration-100">
						<button
							type="button"
							onClick={() => {
								data?.onSetEdgeDirection?.(id, "none");
								setDirectionMenuOpen(false);
							}}
							className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-md text-xs text-foreground/85 hover:bg-surface-secondary/70 transition-colors cursor-pointer"
						>
							<span className="flex items-center gap-1.5">
								<Minus className="w-3 h-3 text-muted" />
								无方向
							</span>
							{currentDirection === "none" && (
								<Check className="w-3.5 h-3.5 text-accent" />
							)}
						</button>
						<button
							type="button"
							onClick={() => {
								data?.onSetEdgeDirection?.(id, "one-way");
								setDirectionMenuOpen(false);
							}}
							className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-md text-xs text-foreground/85 hover:bg-surface-secondary/70 transition-colors cursor-pointer"
						>
							<span className="flex items-center gap-1.5">
								<ArrowRight className="w-3 h-3 text-muted" />
								单向
							</span>
							{currentDirection === "one-way" && (
								<Check className="w-3.5 h-3.5 text-accent" />
							)}
						</button>
						<button
							type="button"
							onClick={() => {
								data?.onSetEdgeDirection?.(id, "bidirectional");
								setDirectionMenuOpen(false);
							}}
							className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-md text-xs text-foreground/85 hover:bg-surface-secondary/70 transition-colors cursor-pointer"
						>
							<span className="flex items-center gap-1.5">
								<ArrowLeftRight className="w-3 h-3 text-muted" />
								双向
							</span>
							{currentDirection === "bidirectional" && (
								<Check className="w-3.5 h-3.5 text-accent" />
							)}
						</button>
					</div>
				)}
			</div>
		</div>
	);
}

/** Bezier edge with Obsidian-style centered label, double-click to edit */
export function CanvasEdgeComponent({
	id,
	sourceX,
	sourceY,
	targetX,
	targetY,
	sourcePosition,
	targetPosition,
	style,
	markerEnd,
	markerStart,
	data,
	interactionWidth,
	selected,
}: EdgeProps<CanvasFlowEdge>) {
	const [path, labelX, labelY] = getBezierPath({
		sourceX,
		sourceY,
		targetX,
		targetY,
		sourcePosition,
		targetPosition,
	});
	const color = typeof style?.stroke === "string" ? style.stroke : undefined;
	const { isSelecting, selectedNodesCount } = useCanvasSelection();
	const { getNodes } = useReactFlow();
	const hasSelectedNodes =
		selectedNodesCount > 0 || getNodes().some((n) => n.selected);

	return (
		<>
			<BaseEdge
				id={id}
				path={path}
				style={style}
				markerStart={markerStart}
				markerEnd={markerEnd}
				interactionWidth={interactionWidth ?? 24}
			/>

			{/* Edge floating action toolbar only when individually selected and not marquee selecting */}
			{selected && !data?.editing && !isSelecting && !hasSelectedNodes && (
				<EdgeLabelRenderer>
					<EdgeSelectionToolbar
						id={id}
						data={data}
						labelX={labelX}
						labelY={labelY}
						selected={selected}
					/>
				</EdgeLabelRenderer>
			)}

			{/* Edge label rendering / editing */}
			{(data?.label || data?.editing) && (
				<EdgeLabelRenderer>
					<div
						className="nodrag nopan absolute pointer-events-auto"
						style={{
							transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
						}}
					>
						{data?.editing ? (
							<input
								ref={autoFocus}
								defaultValue={data.label ?? ""}
								onBlur={(e) => data.onCommitEdgeLabel?.(id, e.target.value)}
								onKeyDown={(e) => {
									if (e.key === "Enter") e.currentTarget.blur();
									if (e.key === "Escape") {
										data.onCommitEdgeLabel?.(id, data.label ?? "");
									}
								}}
								placeholder="标签"
								className="w-28 rounded border border-accent bg-surface px-1.5 py-0.5 text-[11px] text-foreground/90 outline-none shadow-sm"
							/>
						) : (
							<div
								className="rounded border border-border bg-surface px-1.5 py-0.5 text-[11px] shadow-sm select-none"
								style={{ color }}
							>
								{data?.label}
							</div>
						)}
					</div>
				</EdgeLabelRenderer>
			)}
		</>
	);
}
