import {
	Handle,
	type Node,
	type NodeProps,
	NodeResizeControl,
	NodeToolbar,
	Position,
	ResizeControlVariant,
	useReactFlow,
} from "@xyflow/react";
import {
	ExternalLink,
	FileText,
	Palette,
	ScanSearch,
	SquarePen,
	Trash2,
	Waypoints,
	X,
} from "lucide-react";
import { memo, useCallback, useEffect, useState } from "react";
import { getVaultFileCategory } from "../utils/vaultFileUtils";
import { useCanvasActions } from "./CanvasActionContext";
import {
	AlignToolIcon,
	CanvasAlignDropdown,
} from "./CanvasMultiSelectionToolbar";
import { useCanvasSelection } from "./CanvasSelectionContext";
import type { AlignmentType } from "./canvasAlignment";
import {
	type CanvasNode,
	COLOR_PRESETS,
	colorToAlpha,
	resolveColor,
	type Side,
} from "./canvasUtils";
import { autoFocus, cardClass } from "./cards/cardShared";
import { ImageCardBody } from "./cards/ImageCardBody";
import { MarkdownCardBody } from "./cards/MarkdownCardBody";
import { TextCardBody } from "./cards/TextCardBody";

export interface CanvasNodeActions {
	onDeleteNode?: (id: string) => void;
	onSetColor?: (id: string, color: string | undefined) => void;
	onStartEdit?: (id: string) => void;
	onAlignGroup?: (groupId: string, type: AlignmentType) => void;
}

export interface CanvasCardData
	extends Record<string, unknown>,
		CanvasNodeActions {
	canvasNode: CanvasNode;
	onNavigateNote?: (relPath: string) => void;
	readOnly?: boolean;
	editing?: boolean;
	onCommitText?: (id: string, text: string) => void;
}

export interface CanvasGroupData
	extends Record<string, unknown>,
		CanvasNodeActions {
	label?: string;
	color?: string;
	readOnly?: boolean;
	editing?: boolean;
	onCommitLabel?: (id: string, label: string) => void;
}

export type CanvasCardFlowNode = Node<CanvasCardData, "canvasCard">;
export type CanvasGroupFlowNode = Node<CanvasGroupData, "canvasGroup">;

const SIDES: Side[] = ["top", "right", "bottom", "left"];
const HANDLE_POSITIONS: Record<Side, Position> = {
	top: Position.Top,
	right: Position.Right,
	bottom: Position.Bottom,
	left: Position.Left,
};

/**
 * Source/target handles on all four sides for side-anchored edges.
 * Hidden until node hover/selection in edit mode; fully inert in read-only mode.
 */
function NodeHandles({ readOnly }: { readOnly?: boolean }) {
	const handleClass = readOnly
		? "!opacity-0 !pointer-events-none"
		: "canvas-node-handle !w-2 !h-2 !bg-muted !border-0 opacity-0 transition-opacity";
	return (
		<>
			{SIDES.map((side) => (
				<Handle
					key={`t-${side}`}
					id={`t-${side}`}
					type="target"
					position={HANDLE_POSITIONS[side]}
					isConnectable={!readOnly}
					className={handleClass}
				/>
			))}
			{SIDES.map((side) => (
				<Handle
					key={`s-${side}`}
					id={`s-${side}`}
					type="source"
					position={HANDLE_POSITIONS[side]}
					isConnectable={!readOnly}
					className={handleClass}
				/>
			))}
		</>
	);
}

interface SelectionToolbarProps extends CanvasNodeActions {
	id: string;
	color?: string;
	selected?: boolean;
	readOnly?: boolean;
	canEdit?: boolean;
	editing?: boolean;
	isGroup?: boolean;
	onEdit?: () => void;
}

const RESIZE_CORNERS = [
	"top-left",
	"top-right",
	"bottom-left",
	"bottom-right",
] as const;

/**
 * Corner-only resize controls (no edge lines) so side-midpoint connection
 * handles stay grabbable when the node is selected.
 */
function CornerResizer({
	visible,
	minWidth,
	minHeight,
	keepAspectRatio,
}: {
	visible: boolean;
	minWidth: number;
	minHeight: number;
	keepAspectRatio?: boolean;
}) {
	if (!visible) return null;
	return RESIZE_CORNERS.map((position) => (
		<NodeResizeControl
			key={position}
			variant={ResizeControlVariant.Handle}
			position={position}
			minWidth={minWidth}
			minHeight={minHeight}
			keepAspectRatio={keepAspectRatio}
		/>
	));
}

const toolbarButtonClass =
	"p-1.5 rounded-md text-muted hover:text-foreground hover:bg-surface-secondary/70 transition-colors cursor-pointer";

/** Compact action toolbar above a selected node: delete / palette / focus / edit / align */
function SelectionToolbar({
	id,
	color,
	selected,
	readOnly,
	canEdit,
	editing,
	isGroup,
	onDeleteNode,
	onSetColor,
	onEdit,
	onAlignGroup,
}: SelectionToolbarProps) {
	const actions = useCanvasActions();
	const [paletteOpen, setPaletteOpen] = useState(false);
	const [alignOpen, setAlignOpen] = useState(false);
	const { fitView } = useReactFlow();
	const { isSelecting, selectedNodesCount } = useCanvasSelection();

	// Close popovers when node becomes unselected
	useEffect(() => {
		if (!selected) {
			setPaletteOpen(false);
			setAlignOpen(false);
		}
	}, [selected]);

	const handleFocus = useCallback(() => {
		fitView({
			nodes: [{ id }],
			duration: 350,
			padding: 0.25,
		});
	}, [fitView, id]);

	const handleDelete = useCallback(() => {
		(onDeleteNode ?? actions.deleteNode)(id);
	}, [onDeleteNode, actions.deleteNode, id]);

	const handleSetColor = useCallback(
		(col: string | undefined) => {
			(onSetColor ?? actions.setNodeColor)(id, col);
		},
		[onSetColor, actions.setNodeColor, id],
	);

	const handleAlign = useCallback(
		(type: AlignmentType) => {
			(onAlignGroup ?? actions.alignGroupChildren)(id, type);
			setAlignOpen(false);
		},
		[onAlignGroup, actions.alignGroupChildren, id],
	);

	if (readOnly) return null;

	return (
		<NodeToolbar
			isVisible={
				Boolean(selected) &&
				!editing &&
				!isSelecting &&
				selectedNodesCount === 1
			}
			position={Position.Top}
			offset={8}
		>
			<div className="nodrag relative flex items-center gap-0.5 rounded-lg border border-border bg-surface p-1 shadow-md">
				{/* 1. 删除 */}
				<button
					type="button"
					aria-label="删除"
					title="删除"
					onClick={handleDelete}
					className={`${toolbarButtonClass} hover:!text-danger`}
				>
					<Trash2 className="w-3.5 h-3.5" />
				</button>

				{/* 2. 替换颜色 */}
				<button
					type="button"
					aria-label="替换颜色"
					title="替换颜色"
					onClick={() => {
						setPaletteOpen((prev) => !prev);
						setAlignOpen(false);
					}}
					className={`${toolbarButtonClass} ${
						paletteOpen ? "text-accent bg-surface-secondary" : ""
					}`}
				>
					<Palette className="w-3.5 h-3.5" />
				</button>

				{/* 3. 聚焦到当前卡片 */}
				<button
					type="button"
					aria-label="聚焦到当前卡片"
					title="聚焦到当前卡片"
					onClick={handleFocus}
					className={toolbarButtonClass}
				>
					<ScanSearch className="w-3.5 h-3.5" />
				</button>

				{/* 4. 编辑 */}
				{canEdit && (
					<button
						type="button"
						aria-label="编辑"
						title="编辑"
						onClick={onEdit}
						className={toolbarButtonClass}
					>
						<SquarePen className="w-3.5 h-3.5" />
					</button>
				)}

				{/* 5. 分组内部内容对齐与分布工具 */}
				{isGroup && (
					<button
						type="button"
						aria-label="对齐分组内容"
						title="对齐分组内容"
						onClick={() => {
							setAlignOpen((prev) => !prev);
							setPaletteOpen(false);
						}}
						className={`${toolbarButtonClass} ${
							alignOpen ? "text-accent bg-surface-secondary" : ""
						}`}
					>
						<AlignToolIcon />
					</button>
				)}

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
									handleSetColor(color === key ? undefined : key);
									setPaletteOpen(false);
								}}
								className={`w-4 h-4 rounded-full cursor-pointer transition-transform hover:scale-110 ${
									color === key ? "ring-2 ring-offset-1 ring-foreground/60" : ""
								}`}
								style={{ backgroundColor: value }}
							/>
						))}
						<button
							type="button"
							aria-label="清除颜色"
							title="清除颜色"
							onClick={() => {
								handleSetColor(undefined);
								setPaletteOpen(false);
							}}
							className={toolbarButtonClass}
						>
							<X className="w-3.5 h-3.5" />
						</button>
					</div>
				)}

				{/* 分组对齐与分布下拉菜单 */}
				{isGroup && (
					<CanvasAlignDropdown isOpen={alignOpen} onSelect={handleAlign} />
				)}
			</div>
		</NodeToolbar>
	);
}

/** Memoized CanvasGroupNode component */
export const CanvasGroupNode = memo(function CanvasGroupNode({
	id,
	data,
	selected,
}: NodeProps<CanvasGroupFlowNode>) {
	const actions = useCanvasActions();
	const color = resolveColor(data.color);
	const defaultBorder = "rgba(128, 128, 128, 0.3)";
	const activeColor = color ?? "#7853ee";
	const currentBorder = color ?? defaultBorder;

	const groupBorderStyle: React.CSSProperties = selected
		? {
				borderColor: activeColor,
				boxShadow: `0 0 0 1px ${activeColor}, 0 4px 14px -2px ${colorToAlpha(
					activeColor,
					0.25,
				)}`,
				background: colorToAlpha(activeColor, color ? 0.08 : 0.06),
			}
		: {
				borderColor: currentBorder,
				background: colorToAlpha(currentBorder, color ? 0.08 : 0.06),
			};

	const handleCommitLabel = useCallback(
		(lbl: string) => {
			(data.onCommitLabel ?? actions.commitLabel)(id, lbl);
		},
		[data.onCommitLabel, actions.commitLabel, id],
	);

	return (
		<>
			<NodeHandles readOnly={data.readOnly} />
			<CornerResizer
				visible={Boolean(selected) && !data.readOnly && !data.editing}
				minWidth={160}
				minHeight={80}
			/>
			<SelectionToolbar
				id={id}
				color={data.color}
				selected={selected}
				readOnly={data.readOnly}
				canEdit
				editing={data.editing}
				isGroup
				onDeleteNode={data.onDeleteNode}
				onSetColor={data.onSetColor}
				onEdit={() => (data.onStartEdit ?? actions.startEdit)(id)}
				onAlignGroup={data.onAlignGroup}
			/>
			<div
				className="w-full h-full rounded-xl border bg-surface/30 dark:bg-white/[0.03] transition-[border-color,box-shadow] duration-150"
				style={groupBorderStyle}
			>
				{data.editing ? (
					<input
						ref={autoFocus}
						defaultValue={data.label ?? ""}
						onBlur={(e) => handleCommitLabel(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter") e.currentTarget.blur();
							if (e.key === "Escape") handleCommitLabel(data.label ?? "");
						}}
						className="nodrag absolute -top-6 left-1 text-sm font-semibold bg-transparent outline-none border-b border-accent w-40"
						style={{ color: color ?? "inherit" }}
					/>
				) : (
					data.label && (
						<span
							className="absolute -top-6 left-1 text-sm font-semibold select-none"
							style={{ color: color ?? "inherit" }}
						>
							{data.label}
						</span>
					)
				)}
			</div>
		</>
	);
});

/** Memoized CanvasCardNode component */
export const CanvasCardNode = memo(function CanvasCardNode({
	id,
	data,
	selected,
}: NodeProps<CanvasCardFlowNode>) {
	const actions = useCanvasActions();
	const { canvasNode: node, onNavigateNote } = data;
	const color = resolveColor(node.color);
	const activeColor = color ?? "#7853ee";
	const borderStyle: React.CSSProperties = selected
		? {
				borderColor: activeColor,
				boxShadow: `0 0 0 1px ${activeColor}, 0 4px 14px -2px ${
					color ? `${color}40` : "rgba(120, 83, 238, 0.28)"
				}`,
			}
		: {
				borderColor: color,
			};

	let body: React.ReactNode = null;

	if (node.type === "text") {
		body = (
			<TextCardBody
				node={node}
				editing={data.editing}
				selected={selected}
				borderStyle={borderStyle}
				onCommitText={data.onCommitText}
			/>
		);
	} else if (node.type === "file" && node.file) {
		const file = node.file;
		const category = getVaultFileCategory(file);
		const name = file.split("/").pop() ?? file;

		if (category === "image") {
			body = <ImageCardBody file={file} borderStyle={borderStyle} />;
		} else if (category === "markdown") {
			body = (
				<MarkdownCardBody
					file={file}
					selected={selected}
					borderStyle={borderStyle}
				/>
			);
		} else {
			body = (
				<div
					className={`${cardClass} flex flex-col items-center justify-center gap-2 p-3`}
					style={borderStyle}
					title={file}
				>
					{category === "canvas" ? (
						<Waypoints className="w-5 h-5 text-muted" />
					) : (
						<FileText className="w-5 h-5 text-muted" />
					)}
					<span className="text-xs text-foreground/90 text-center break-all leading-snug">
						{name}
					</span>
				</div>
			);
		}
	} else if (node.type === "link" && node.url) {
		let host = node.url;
		try {
			host = new URL(node.url).hostname;
		} catch {}
		body = (
			<a
				href={node.url}
				target="_blank"
				rel="noreferrer"
				className={`${cardClass} flex flex-col items-center justify-center gap-2 p-3 hover:border-accent transition-colors`}
				style={borderStyle}
			>
				<ExternalLink className="w-5 h-5 text-muted" />
				<span className="text-xs text-foreground/90 break-all text-center leading-snug">
					{host}
				</span>
			</a>
		);
	}

	if (!body) return null;

	const canEdit =
		node.type === "text" || (node.type === "file" && Boolean(node.file));

	return (
		<>
			<NodeHandles readOnly={data.readOnly} />
			<CornerResizer
				visible={Boolean(selected) && !data.readOnly && !data.editing}
				minWidth={120}
				minHeight={40}
				keepAspectRatio={false}
			/>
			<SelectionToolbar
				id={id}
				color={node.color}
				selected={selected}
				readOnly={data.readOnly}
				canEdit={canEdit}
				editing={data.editing}
				onDeleteNode={data.onDeleteNode}
				onSetColor={data.onSetColor}
				onEdit={() => {
					if (node.type === "text") {
						(data.onStartEdit ?? actions.startEdit)(id);
					} else if (node.type === "file" && node.file) {
						(onNavigateNote ?? actions.onNavigateNote)?.(node.file);
					}
				}}
			/>
			{body}
		</>
	);
});
