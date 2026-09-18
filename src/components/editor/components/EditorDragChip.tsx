import { useDragDropMonitor } from "@dnd-kit/react";
import { FileText, Folder as FolderIcon } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import type { EditorDragData } from "../utils/editorDnd";

/**
 * 拖拽跟随芯片：纯图标，紧贴指针右侧（Notes 风格）。
 * 不走 DragOverlay —— 它会把源元素尺寸复制到 overlay 外壳，
 * 长卡片会遮住文件夹栏。
 *
 * 性能优化：指针跟随通过 ref + DOM style 直接写入，
 * 仅 dragstart/dragend 触发 React 渲染（控制显示/隐藏和图标切换）。
 * onDragMove 里零 setState，消除拖拽过程中的 React re-render。
 */
export function EditorDragChip() {
	const chipRef = useRef<HTMLDivElement | null>(null);
	const rafRef = useRef(0);
	// Only kind triggers re-render (show/hide + icon switch)
	const [kind, setKind] = useState<"doc" | "folder" | null>(null);

	const updatePosition = useCallback((x: number, y: number) => {
		if (rafRef.current) return;
		rafRef.current = requestAnimationFrame(() => {
			rafRef.current = 0;
			const el = chipRef.current;
			if (el) {
				el.style.transform = `translate(${x}px, ${y}px)`;
			}
		});
	}, []);

	useDragDropMonitor({
		onDragStart(event) {
			const data = event.operation.source?.data as
				| EditorDragData
				| undefined;
			if (!data) return;
			const pos = event.operation.position.current;
			setKind(data.kind === "editor-doc" ? "doc" : "folder");
			// Set initial position synchronously to avoid flash at (0,0)
			requestAnimationFrame(() => {
				const el = chipRef.current;
				if (el) {
					el.style.transform = `translate(${pos.x}px, ${pos.y}px)`;
				}
			});
		},
		onDragMove(event) {
			// Pure DOM update — no React setState
			const pos = event.operation.position.current;
			updatePosition(pos.x, pos.y);
		},
		onDragEnd() {
			if (rafRef.current) {
				cancelAnimationFrame(rafRef.current);
				rafRef.current = 0;
			}
			setKind(null);
		},
	});

	if (!kind) return null;

	return (
		<div
			ref={chipRef}
			className="fixed top-0 left-0 z-50 pointer-events-none will-change-transform"
		>
			{/* 紧贴指针右侧（6px 间隙），并相对指针垂直居中 */}
			<div className="translate-x-[6px] -translate-y-1/2 p-1.5 rounded-md bg-surface border border-border shadow-lg select-none">
				{kind === "doc" ? (
					<FileText className="w-3.5 h-3.5 text-accent" />
				) : (
					<FolderIcon className="w-3.5 h-3.5 text-accent" />
				)}
			</div>
		</div>
	);
}
