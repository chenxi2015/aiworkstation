import {
	Handle,
	type Node,
	type NodeProps,
	NodeResizeControl,
	NodeToolbar,
	Position,
	ResizeControlVariant,
} from "@xyflow/react";
import {
	ExternalLink,
	FileText,
	PenLine,
	Trash2,
	Waypoints,
	X,
} from "lucide-react";
import { useEffect, useRef } from "react";
import { getVaultFileCategory, vaultAssetUrl } from "../utils/vaultFileUtils";
import {
	type CanvasNode,
	COLOR_PRESETS,
	resolveColor,
	type Side,
} from "./canvasUtils";

export interface CanvasNodeActions {
	onDeleteNode?: (id: string) => void;
	onSetColor?: (id: string, color: string | undefined) => void;
	onStartEdit?: (id: string) => void;
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
	"p-1 rounded-md text-muted hover:text-foreground hover:bg-surface-secondary/60 transition-colors cursor-pointer";

/** Obsidian-style floating toolbar above a selected node: delete / color / edit */
function SelectionToolbar({
	id,
	color,
	selected,
	readOnly,
	canEdit,
	editing,
	onDeleteNode,
	onSetColor,
	onStartEdit,
}: SelectionToolbarProps) {
	if (readOnly) return null;
	return (
		<NodeToolbar
			isVisible={selected && !editing}
			position={Position.Top}
			offset={8}
		>
			<div className="nodrag flex items-center gap-1.5 rounded-lg border border-border bg-surface px-1.5 py-1 shadow-md">
				<button
					type="button"
					aria-label="删除"
					title="删除"
					onClick={() => onDeleteNode?.(id)}
					className={`${toolbarButtonClass} hover:!text-danger`}
				>
					<Trash2 className="w-3.5 h-3.5" />
				</button>
				<div className="flex items-center gap-1">
					{Object.entries(COLOR_PRESETS).map(([key, value]) => (
						<button
							key={key}
							type="button"
							aria-label={`颜色 ${key}`}
							title={`颜色 ${key}`}
							onClick={() => onSetColor?.(id, color === key ? undefined : key)}
							className={`w-3.5 h-3.5 rounded-full cursor-pointer transition-transform hover:scale-110 ${
								color === key ? "ring-2 ring-offset-1 ring-foreground/50" : ""
							}`}
							style={{ backgroundColor: value }}
						/>
					))}
					<button
						type="button"
						aria-label="清除颜色"
						title="清除颜色"
						onClick={() => onSetColor?.(id, undefined)}
						className={toolbarButtonClass}
					>
						<X className="w-3 h-3" />
					</button>
				</div>
				{canEdit && (
					<button
						type="button"
						aria-label="编辑"
						title="编辑"
						onClick={() => onStartEdit?.(id)}
						className={toolbarButtonClass}
					>
						<PenLine className="w-3.5 h-3.5" />
					</button>
				)}
			</div>
		</NodeToolbar>
	);
}

const cardClass =
	"w-full h-full rounded-lg border border-border bg-surface shadow-sm overflow-hidden";

function autoFocus(el: HTMLTextAreaElement | HTMLInputElement | null) {
	if (!el) return;
	el.focus();
	el.select();
}

export function CanvasGroupNode({
	id,
	data,
	selected,
}: NodeProps<CanvasGroupFlowNode>) {
	const color = resolveColor(data.color);
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
				onDeleteNode={data.onDeleteNode}
				onSetColor={data.onSetColor}
				onStartEdit={data.onStartEdit}
			/>
			<div
				className="w-full h-full rounded-xl border bg-surface/30 dark:bg-white/[0.03]"
				style={{ borderColor: color ?? "rgba(128,128,128,0.3)" }}
			>
				{data.editing ? (
					<input
						ref={autoFocus}
						defaultValue={data.label ?? ""}
						onBlur={(e) => data.onCommitLabel?.(id, e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter") e.currentTarget.blur();
							if (e.key === "Escape")
								data.onCommitLabel?.(id, data.label ?? "");
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
}

function TextCardBody({
	node,
	data,
	borderStyle,
}: {
	node: CanvasNode;
	data: CanvasCardData;
	borderStyle: React.CSSProperties;
}) {
	const draftRef = useRef<string>(node.text ?? "");

	// Keep draft in sync when the underlying text changes externally
	useEffect(() => {
		draftRef.current = node.text ?? "";
	}, [node.text]);

	if (data.editing) {
		return (
			<textarea
				ref={autoFocus}
				defaultValue={node.text ?? ""}
				onChange={(e) => {
					draftRef.current = e.target.value;
				}}
				onBlur={() => data.onCommitText?.(node.id, draftRef.current)}
				onKeyDown={(e) => {
					if (e.key === "Escape") data.onCommitText?.(node.id, node.text ?? "");
				}}
				className={`${cardClass} nodrag nowheel p-3 text-xs text-foreground/90 leading-relaxed whitespace-pre-wrap resize-none outline-none focus:border-accent`}
				style={borderStyle}
			/>
		);
	}

	return (
		<div
			className={`${cardClass} nowheel p-3 text-xs text-foreground/90 leading-relaxed whitespace-pre-wrap overflow-y-auto cursor-default`}
			style={borderStyle}
		>
			{node.text ?? ""}
		</div>
	);
}

export function CanvasCardNode({
	id,
	data,
	selected,
}: NodeProps<CanvasCardFlowNode>) {
	const { canvasNode: node, onNavigateNote } = data;
	const color = resolveColor(node.color);
	const borderStyle = { borderColor: color };
	const isImage =
		node.type === "file" &&
		Boolean(node.file) &&
		getVaultFileCategory(node.file ?? "") === "image";

	let body: React.ReactNode = null;

	if (node.type === "text") {
		body = <TextCardBody node={node} data={data} borderStyle={borderStyle} />;
	} else if (node.type === "file" && node.file) {
		const file = node.file;
		const category = getVaultFileCategory(file);
		const name = file.split("/").pop() ?? file;

		if (category === "image") {
			body = (
				<div className={cardClass} style={borderStyle}>
					<img
						src={vaultAssetUrl(file)}
						alt={name}
						loading="lazy"
						decoding="async"
						className="w-full h-full object-cover select-none"
						draggable={false}
					/>
				</div>
			);
		} else {
			const isNavigable = category === "markdown" || category === "canvas";
			body = (
				<button
					type="button"
					disabled={!isNavigable}
					onClick={() => isNavigable && onNavigateNote?.(file)}
					className={`${cardClass} flex flex-col items-center justify-center gap-2 p-3 transition-colors ${
						isNavigable
							? "hover:border-accent cursor-pointer"
							: "cursor-default"
					}`}
					style={borderStyle}
					title={file}
				>
					{category === "canvas" ? (
						<Waypoints className="w-5 h-5 text-muted" />
					) : (
						<FileText className="w-5 h-5 text-muted" />
					)}
					<span className="text-xs text-foreground/90 text-center break-all leading-snug">
						{category === "markdown" ? name.replace(/\.md$/i, "") : name}
					</span>
				</button>
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

	return (
		<>
			<NodeHandles readOnly={data.readOnly} />
			<CornerResizer
				visible={Boolean(selected) && !data.readOnly && !data.editing}
				minWidth={120}
				minHeight={40}
				keepAspectRatio={isImage}
			/>
			<SelectionToolbar
				id={id}
				color={node.color}
				selected={selected}
				readOnly={data.readOnly}
				canEdit={node.type === "text"}
				editing={data.editing}
				onDeleteNode={data.onDeleteNode}
				onSetColor={data.onSetColor}
				onStartEdit={data.onStartEdit}
			/>
			{body}
		</>
	);
}
