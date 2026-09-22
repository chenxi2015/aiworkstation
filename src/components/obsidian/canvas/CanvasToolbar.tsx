import { Panel } from "@xyflow/react";
import { AlertTriangle, FileText, Plus, Type } from "lucide-react";
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
