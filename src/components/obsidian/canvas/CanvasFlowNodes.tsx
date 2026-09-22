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
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	fetchVaultNote,
	getCachedVaultNote,
} from "../../../services/api/obsidianClient";
import { markdownToHtml } from "../../editor/markdown";
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

/** Compact action toolbar above a selected node: delete / palette / focus / edit */
function SelectionToolbar({
	id,
	color,
	selected,
	readOnly,
	canEdit,
	editing,
	onDeleteNode,
	onSetColor,
	onEdit,
}: SelectionToolbarProps) {
	const [paletteOpen, setPaletteOpen] = useState(false);
	const { fitView, getNodes } = useReactFlow();

	// Check if multiple nodes are selected to hide single-node toolbar
	const isMultiSelected =
		selected && getNodes().filter((n) => n.selected).length >= 2;

	// Close palette popover when node becomes unselected
	useEffect(() => {
		if (!selected) setPaletteOpen(false);
	}, [selected]);

	const handleFocus = useCallback(() => {
		fitView({
			nodes: [{ id }],
			duration: 350,
			padding: 0.25,
		});
	}, [fitView, id]);

	if (readOnly) return null;

	return (
		<NodeToolbar
			isVisible={Boolean(selected) && !editing && !isMultiSelected}
			position={Position.Top}
			offset={8}
		>
			<div className="nodrag relative flex items-center gap-0.5 rounded-lg border border-border bg-surface p-1 shadow-md">
				{/* 1. 删除 */}
				<button
					type="button"
					aria-label="删除"
					title="删除"
					onClick={() => onDeleteNode?.(id)}
					className={`${toolbarButtonClass} hover:!text-danger`}
				>
					<Trash2 className="w-3.5 h-3.5" />
				</button>

				{/* 2. 替换颜色 */}
				<button
					type="button"
					aria-label="替换颜色"
					title="替换颜色"
					onClick={() => setPaletteOpen((prev) => !prev)}
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
									onSetColor?.(id, color === key ? undefined : key);
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
								onSetColor?.(id, undefined);
								setPaletteOpen(false);
							}}
							className={toolbarButtonClass}
						>
							<X className="w-3.5 h-3.5" />
						</button>
					</div>
				)}
			</div>
		</NodeToolbar>
	);
}

const cardClass =
	"w-full h-full rounded-lg border border-border bg-surface shadow-sm overflow-hidden transition-[border-color,box-shadow] duration-150";

function autoFocus(el: HTMLTextAreaElement | HTMLInputElement | null) {
	if (!el) return;
	el.focus();
	el.select();
}

/** Memoized CanvasGroupNode component */
export const CanvasGroupNode = memo(function CanvasGroupNode({
	id,
	data,
	selected,
}: NodeProps<CanvasGroupFlowNode>) {
	const color = resolveColor(data.color);
	const activeColor = color ?? "#7853ee";
	const groupBorderStyle: React.CSSProperties = selected
		? {
				borderColor: activeColor,
				boxShadow: `0 0 0 1px ${activeColor}, 0 4px 14px -2px ${
					color ? `${color}40` : "rgba(120, 83, 238, 0.28)"
				}`,
			}
		: {
				borderColor: color ?? "rgba(128,128,128,0.3)",
			};

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
				onEdit={() => data.onStartEdit?.(id)}
			/>
			<div
				className="w-full h-full rounded-xl border bg-surface/30 dark:bg-white/[0.03] transition-[border-color,box-shadow] duration-150"
				style={groupBorderStyle}
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
});

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

// In-memory LRU cache for rendered Markdown HTML strings to avoid expensive re-parsing
const MAX_MARKDOWN_CACHE_SIZE = 150;
const markdownCache = new Map<string, string>();

function getRenderedMarkdownHtml(raw: string): string {
	if (!raw) return "";
	const cached = markdownCache.get(raw);
	if (cached !== undefined) return cached;

	// Strip YAML frontmatter
	const body = raw.replace(/^---\n[\s\S]*?\n---\n?/, "").trim();
	const html = markdownToHtml(body);

	if (markdownCache.size >= MAX_MARKDOWN_CACHE_SIZE) {
		const firstKey = markdownCache.keys().next().value;
		if (firstKey !== undefined) markdownCache.delete(firstKey);
	}
	markdownCache.set(raw, html);
	return html;
}

function MarkdownCardBody({
	file,
	borderStyle,
}: {
	file: string;
	borderStyle: React.CSSProperties;
}) {
	const [content, setContent] = useState<string>(() => {
		const cached = getCachedVaultNote(file);
		return cached?.content ?? "";
	});
	const [loading, setLoading] = useState(!content);

	useEffect(() => {
		let active = true;
		void fetchVaultNote(file).then(({ note }) => {
			if (!active) return;
			if (note?.content !== undefined) {
				setContent(note.content);
			}
			setLoading(false);
		});
		return () => {
			active = false;
		};
	}, [file]);

	const html = useMemo(() => getRenderedMarkdownHtml(content), [content]);
	const displayName = file.split("/").pop()?.replace(/\.md$/i, "") ?? file;

	return (
		<div className="relative w-full h-full flex flex-col">
			{/* Top note title bar / badge */}
			<div
				className="absolute -top-5 left-1 text-[11px] text-muted truncate max-w-[95%] select-none pointer-events-none font-medium"
				title={displayName}
			>
				{displayName}
			</div>
			<div
				className={`${cardClass} nowheel p-4 overflow-y-auto text-xs text-foreground/90 leading-relaxed cursor-default`}
				style={borderStyle}
			>
				{loading && !html ? (
					<div className="flex items-center justify-center h-full text-xs text-muted">
						加载笔记中...
					</div>
				) : html ? (
					<div
						className="canvas-markdown-preview prose prose-sm dark:prose-invert max-w-none break-words"
						// biome-ignore lint/security/noDangerouslySetInnerHtml: rendered markdown HTML
						dangerouslySetInnerHTML={{ __html: html }}
					/>
				) : (
					<div className="text-muted italic text-center py-4">（空笔记）</div>
				)}
			</div>
		</div>
	);
}

function ImageCardBody({
	file,
	borderStyle,
}: {
	file: string;
	borderStyle: React.CSSProperties;
}) {
	const name = file.split("/").pop() ?? file;
	const src = vaultAssetUrl(file);

	return (
		<div className="relative w-full h-full flex flex-col">
			{/* Top image title bar */}
			<div
				className="absolute -top-5 left-1 text-[11px] text-muted truncate max-w-[95%] select-none pointer-events-none font-medium"
				title={name}
			>
				{name}
			</div>
			<div
				className={`${cardClass} p-1.5 flex items-center justify-center bg-surface select-none overflow-hidden`}
				style={borderStyle}
			>
				<img
					src={src}
					alt={name}
					loading="lazy"
					decoding="async"
					className="max-w-full max-h-full w-auto h-auto object-contain pointer-events-none select-none"
					draggable={false}
				/>
			</div>
		</div>
	);
}

/** Memoized CanvasCardNode component */
export const CanvasCardNode = memo(function CanvasCardNode({
	id,
	data,
	selected,
}: NodeProps<CanvasCardFlowNode>) {
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
			body = <ImageCardBody file={file} borderStyle={borderStyle} />;
		} else if (category === "markdown") {
			body = <MarkdownCardBody file={file} borderStyle={borderStyle} />;
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
						data.onStartEdit?.(id);
					} else if (node.type === "file" && node.file) {
						onNavigateNote?.(node.file);
					}
				}}
			/>
			{body}
		</>
	);
});
