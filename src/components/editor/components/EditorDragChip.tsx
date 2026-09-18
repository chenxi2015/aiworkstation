import { useDragDropMonitor } from "@dnd-kit/react";
import { FileText, Folder as FolderIcon } from "lucide-react";
import { useState } from "react";
import type { EditorDragData } from "../utils/editorDnd";

/**
 * 拖拽跟随芯片：纯图标，紧贴指针左侧（Notes 风格）。
 * 不走 DragOverlay —— 它会把源元素尺寸复制到 overlay 外壳，
 * 长卡片会遮住文件夹栏；这里用 useDragDropMonitor 自行跟踪指针，
 * 独立订阅 dragmove，只有芯片自身重渲染。
 */
export function EditorDragChip() {
	const [chip, setChip] = useState<{
		kind: "doc" | "folder";
		x: number;
		y: number;
	} | null>(null);

	useDragDropMonitor({
		onDragStart(event) {
			const data = event.operation.source?.data as EditorDragData | undefined;
			if (!data) return;
			const pos = event.operation.position.current;
			setChip({
				kind: data.kind === "editor-doc" ? "doc" : "folder",
				x: pos.x,
				y: pos.y,
			});
		},
		onDragMove(event) {
			const pos = event.operation.position.current;
			setChip((prev) => (prev ? { ...prev, x: pos.x, y: pos.y } : prev));
		},
		onDragEnd() {
			setChip(null);
		},
	});

	if (!chip) return null;

	return (
		<div
			className="fixed z-50 pointer-events-none"
			style={{ left: chip.x, top: chip.y }}
		>
			{/* 紧贴指针右侧（6px 间隙），并相对指针垂直居中 */}
			<div className="translate-x-[6px] -translate-y-1/2 p-1.5 rounded-md bg-surface border border-border shadow-lg select-none">
				{chip.kind === "doc" ? (
					<FileText className="w-3.5 h-3.5 text-accent" />
				) : (
					<FolderIcon className="w-3.5 h-3.5 text-accent" />
				)}
			</div>
		</div>
	);
}
