import { Panel, useReactFlow } from "@xyflow/react";
import {
	AlertTriangle,
	BoxSelect,
	File,
	FileText,
	Hand,
	Image as ImageIcon,
	Maximize2,
	Minus,
	Plus,
	Redo2,
	RotateCw,
	Type,
	Undo2,
} from "lucide-react";
import type { PendingConnection } from "./useCanvasConnections";

export interface PendingConnectionMenuProps {
	pendingConn: PendingConnection;
	onAddText: () => void;
	onOpenNoteSearch: () => void;
}

/**
 * Dropdown menu displayed when a connection line is dropped onto the empty canvas
 */
export function PendingConnectionMenu({
	pendingConn,
	onAddText,
	onOpenNoteSearch,
}: PendingConnectionMenuProps) {
	return (
		<div
			className="absolute z-20 flex flex-col rounded-lg border border-border bg-surface p-1 shadow-md"
			style={{ left: pendingConn.screenX, top: pendingConn.screenY }}
		>
			<button
				type="button"
				onClick={onAddText}
				className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs text-foreground/90 hover:bg-surface-secondary/60 transition-colors cursor-pointer"
			>
				<Type className="w-3.5 h-3.5 text-muted" />
				添加文本
			</button>
			<button
				type="button"
				onClick={onOpenNoteSearch}
				className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs text-foreground/90 hover:bg-surface-secondary/60 transition-colors cursor-pointer"
			>
				<FileText className="w-3.5 h-3.5 text-muted" />
				添加笔记
			</button>
		</div>
	);
}

export interface CanvasTopToolbarProps {
	readOnly?: boolean;
	onAddCard: (clientX: number, clientY: number) => void;
}

/**
 * Top-right hint and fast-add button panel
 */
export function CanvasTopToolbar({
	readOnly,
	onAddCard,
}: CanvasTopToolbarProps) {
	if (readOnly) return null;

	return (
		<Panel position="top-right" className="flex items-center gap-2">
			<span className="text-[10px] text-muted select-none">
				双击空白新建卡片，悬停卡片边缘拖拽连线
			</span>
			<button
				type="button"
				aria-label="添加卡片"
				title="添加卡片"
				onClick={(e) => {
					const rect = e.currentTarget.getBoundingClientRect();
					onAddCard(rect.left - 200, rect.top + 120);
				}}
				className="p-1.5 rounded-md border border-border bg-surface text-muted hover:text-foreground hover:bg-surface-secondary/60 transition-colors cursor-pointer"
			>
				<Plus className="w-3.5 h-3.5" />
			</button>
		</Panel>
	);
}

export interface CanvasEmptyHintProps {
	count: number;
	readOnly?: boolean;
}

/**
 * Centered placeholder hint when canvas contains no nodes
 */
export function CanvasEmptyHint({ count, readOnly }: CanvasEmptyHintProps) {
	if (count > 0) return null;

	return (
		<div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
			<p className="text-xs text-muted">
				{readOnly ? "空画布" : "空画布，双击空白处创建卡片"}
			</p>
		</div>
	);
}

export interface CanvasParseErrorProps {
	error: string;
}

/**
 * Error display for invalid Canvas JSON
 */
export function CanvasParseError({ error }: CanvasParseErrorProps) {
	return (
		<div className="h-full flex flex-col items-center justify-center text-center px-8">
			<AlertTriangle className="w-6 h-6 text-warning mb-3" />
			<p className="text-xs text-muted leading-relaxed">
				Canvas JSON 解析失败：{error}
				<br />
				可切换到源码模式修复
			</p>
		</div>
	);
}

export interface CanvasViewControlsProps {
	undo: () => void;
	redo: () => void;
	canUndo: boolean;
	canRedo: boolean;
	readOnly?: boolean;
}

const controlBtnClass =
	"w-7 h-7 flex items-center justify-center text-muted hover:text-foreground hover:bg-surface-secondary/70 transition-colors cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-muted";

/**
 * Bottom-right controls matching Obsidian canvas (Figure 1):
 * - Top block: Zoom In (+), Reset 100% (↻), Fit View (⛶), Zoom Out (-)
 * - Bottom block: Undo (↶), Redo (↷)
 */
export function CanvasViewControls({
	undo,
	redo,
	canUndo,
	canRedo,
	readOnly,
}: CanvasViewControlsProps) {
	const { zoomIn, zoomOut, zoomTo, fitView } = useReactFlow();

	return (
		<Panel
			position="bottom-right"
			className="!mr-3 !mb-3 flex flex-col gap-2 select-none z-10"
		>
			{/* 1. Zoom and View controls group */}
			<div className="flex flex-col rounded-md border border-border/80 bg-surface/95 backdrop-blur-xs shadow-sm divide-y divide-border/60 overflow-hidden">
				<button
					type="button"
					aria-label="放大"
					title="放大"
					onClick={() => zoomIn({ duration: 200 })}
					className={controlBtnClass}
				>
					<Plus className="w-3.5 h-3.5" strokeWidth={1.75} />
				</button>
				<button
					type="button"
					aria-label="重置缩放到 100%"
					title="重置缩放 (100%)"
					onClick={() => zoomTo(1, { duration: 200 })}
					className={controlBtnClass}
				>
					<RotateCw className="w-3.5 h-3.5" strokeWidth={1.75} />
				</button>
				<button
					type="button"
					aria-label="自适应视图"
					title="自适应视图"
					onClick={() => fitView({ padding: 0.15, duration: 200 })}
					className={controlBtnClass}
				>
					<Maximize2 className="w-3.5 h-3.5" strokeWidth={1.75} />
				</button>
				<button
					type="button"
					aria-label="缩小"
					title="缩小"
					onClick={() => zoomOut({ duration: 200 })}
					className={controlBtnClass}
				>
					<Minus className="w-3.5 h-3.5" strokeWidth={1.75} />
				</button>
			</div>

			{/* 2. Undo/Redo history controls group */}
			{!readOnly && (
				<div className="flex flex-col rounded-md border border-border/80 bg-surface/95 backdrop-blur-xs shadow-sm divide-y divide-border/60 overflow-hidden">
					<button
						type="button"
						aria-label="撤销"
						title="撤销 (Cmd/Ctrl + Z)"
						disabled={!canUndo}
						onClick={undo}
						className={controlBtnClass}
					>
						<Undo2 className="w-3.5 h-3.5" strokeWidth={1.75} />
					</button>
					<button
						type="button"
						aria-label="重做"
						title="重做 (Cmd/Ctrl + Shift + Z)"
						disabled={!canRedo}
						onClick={redo}
						className={controlBtnClass}
					>
						<Redo2 className="w-3.5 h-3.5" strokeWidth={1.75} />
					</button>
				</div>
			)}
		</Panel>
	);
}

export interface CanvasBottomBarProps {
	readOnly?: boolean;
	interactionMode?: "select" | "pan";
	onToggleInteractionMode?: () => void;
	onAddCard: () => void;
	onAddNote: () => void;
	onAddMedia: () => void;
}

const bottomBarBtnClass =
	"p-2 rounded-lg text-muted hover:text-foreground hover:bg-surface-secondary/70 transition-colors cursor-pointer";

/**
 * Bottom-center floating action bar matching Obsidian canvas (Figure 2):
 * - Interaction mode toggle (Box Selection 'V' vs Canvas Pan 'H')
 * - Add card (blank text card)
 * - Add note (markdown note from vault)
 * - Add media (image or media file from vault)
 */
export function CanvasBottomBar({
	readOnly,
	interactionMode = "select",
	onToggleInteractionMode,
	onAddCard,
	onAddNote,
	onAddMedia,
}: CanvasBottomBarProps) {
	if (readOnly) return null;

	return (
		<Panel position="bottom-center" className="!mb-3 select-none z-10">
			<div className="flex items-center gap-1 px-1.5 py-1 rounded-xl border border-border/80 bg-surface/95 backdrop-blur-xs shadow-md">
				{/* 0. 模式切换：框选 vs 抓手平移 */}
				{onToggleInteractionMode && (
					<>
						<button
							type="button"
							aria-label={
								interactionMode === "select"
									? "当前为框选模式 (快捷键 V / 空格临时平移)"
									: "当前为抓手平移模式 (快捷键 H)"
							}
							title={
								interactionMode === "select"
									? "框选模式 (V) - 空白处拖拽框选"
									: "抓手模式 (H) - 拖动画布"
							}
							onClick={onToggleInteractionMode}
							className={`${bottomBarBtnClass} ${
								interactionMode === "select"
									? "text-accent bg-surface-secondary/80 font-medium"
									: ""
							}`}
						>
							{interactionMode === "select" ? (
								<BoxSelect className="w-4 h-4 text-accent" strokeWidth={1.8} />
							) : (
								<Hand
									className="w-4 h-4 text-foreground/80"
									strokeWidth={1.8}
								/>
							)}
						</button>
						<div className="h-4 w-px bg-border/60 mx-0.5" />
					</>
				)}

				{/* 1. 添加卡片 */}
				<button
					type="button"
					aria-label="添加卡片"
					title="添加卡片"
					onClick={onAddCard}
					className={bottomBarBtnClass}
				>
					<File className="w-4 h-4" strokeWidth={1.75} />
				</button>

				{/* 2. 添加笔记 */}
				<button
					type="button"
					aria-label="添加笔记"
					title="添加笔记"
					onClick={onAddNote}
					className={bottomBarBtnClass}
				>
					<FileText className="w-4 h-4" strokeWidth={1.75} />
				</button>

				{/* 3. 添加媒体文件 */}
				<button
					type="button"
					aria-label="添加媒体文件"
					title="添加媒体文件"
					onClick={onAddMedia}
					className={bottomBarBtnClass}
				>
					<ImageIcon className="w-4 h-4" strokeWidth={1.75} />
				</button>
			</div>
		</Panel>
	);
}
