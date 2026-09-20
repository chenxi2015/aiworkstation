import type { EditorView } from "@codemirror/view";
import { useCallback, useEffect, useRef, useState } from "react";

/** 向上查找第一个可滚动祖先元素 */
function findScrollableAncestor(el: HTMLElement | null): HTMLElement | null {
	let node = el;
	while (node) {
		const { overflowY } = getComputedStyle(node);
		if (overflowY === "auto" || overflowY === "scroll") return node;
		node = node.parentElement;
	}
	return null;
}

export interface UseCmFloatingPositionOptions {
	view: EditorView | null;
	/** 浮层是否处于激活状态 */
	enabled: boolean;
	/** 浮层面板默认宽度（未挂载时的估值） */
	panelWidth?: number;
	/** 浮层面板默认高度（未挂载时的估值） */
	panelHeight?: number;
	/** 面板元素 ref（实测尺寸 + ResizeObserver 跟踪） */
	panelRef?: React.RefObject<HTMLElement | null>;
	/** 显式锚定区间（AI 生成中选区丢失时使用） */
	anchorRange?: { from: number; to: number } | null;
	/** 距视口 / 滚动容器底部的安全边距 */
	bottom?: number;
	/** 距顶部的安全边距 */
	topOffset?: number;
}

export interface CmFloatingPositionResult {
	pos: { top: number; left: number };
	/** 锚定选区是否在可视区域内 */
	anchorVisible: boolean;
	/** 手动触发位置重算 */
	refresh: () => void;
}

/**
 * CodeMirror 版浮层定位（与创作模块 useFloatingPosition 同一套逻辑）：
 * 默认放在选区下方，下方空间不足翻到上方，再不够则夹在边界内；
 * 缓存滚动祖先，rAF 节流跟随滚动 / resize，ResizeObserver 跟踪面板尺寸变化。
 */
export function useCmFloatingPosition({
	view,
	enabled,
	panelWidth: defaultPanelW = 380,
	panelHeight: defaultPanelH = 260,
	panelRef,
	anchorRange,
	bottom = 16,
	topOffset = 8,
}: UseCmFloatingPositionOptions): CmFloatingPositionResult {
	const [pos, setPos] = useState({ top: 0, left: 0 });
	const [anchorVisible, setAnchorVisible] = useState(true);

	// 每个编辑器实例只查找一次滚动祖先
	const scrollElRef = useRef<HTMLElement | null>(null);
	useEffect(() => {
		scrollElRef.current = view
			? findScrollableAncestor(view.dom.parentElement)
			: null;
	}, [view]);

	const computePosition = useCallback(() => {
		if (!view) return;
		const sel = view.state.selection.main;
		const range =
			anchorRange || (!sel.empty ? { from: sel.from, to: sel.to } : null);
		if (!range) return;

		const maxPos = view.state.doc.length;
		const from = Math.min(Math.max(0, range.from), maxPos);
		const to = Math.min(Math.max(0, range.to), maxPos);
		const start = view.coordsAtPos(from);
		const end = view.coordsAtPos(to);
		if (!start || !end) return;

		// 锚点可见性：滚出屏幕则跳过重计算（由调用方决定隐藏）
		const visible = end.bottom > 0 && start.top < window.innerHeight;
		setAnchorVisible(visible);
		if (!visible) return;

		const panelH = panelRef?.current?.offsetHeight ?? defaultPanelH;
		const panelW = panelRef?.current?.offsetWidth ?? defaultPanelW;

		// 垂直边界：视口与滚动容器取交集
		const containerRect = scrollElRef.current?.getBoundingClientRect();
		const boundaryBottom =
			Math.min(
				window.innerHeight,
				containerRect?.bottom ?? window.innerHeight,
			) - bottom;
		const boundaryTop = Math.max(
			topOffset,
			(containerRect ? Math.max(0, containerRect.top) : 0) + topOffset,
		);

		// 水平：跟随选区起点，夹在视口内
		const left = Math.max(
			8,
			Math.min(start.left, window.innerWidth - panelW - 8),
		);

		// 垂直：默认选区下方；下方放不下翻上方；上方也放不下则夹在边界内
		let top = end.bottom + 8;
		if (top + panelH > boundaryBottom) {
			const above = start.top - panelH - 8;
			top =
				above >= boundaryTop
					? above
					: Math.max(boundaryTop, boundaryBottom - panelH);
		}
		setPos({ top, left });
	}, [
		view,
		anchorRange,
		defaultPanelH,
		defaultPanelW,
		panelRef,
		bottom,
		topOffset,
	]);

	// 激活 / 锚点变化时立即重算
	useEffect(() => {
		if (enabled) computePosition();
	}, [enabled, computePosition]);

	// rAF 节流的滚动 / resize 跟随（scroll 不冒泡，用捕获监听所有滚动容器）
	useEffect(() => {
		if (!enabled) return;
		let rafId = 0;
		const handleViewportChange = () => {
			if (rafId) return;
			rafId = requestAnimationFrame(() => {
				rafId = 0;
				computePosition();
			});
		};
		window.addEventListener("scroll", handleViewportChange, true);
		window.addEventListener("resize", handleViewportChange);
		return () => {
			window.removeEventListener("scroll", handleViewportChange, true);
			window.removeEventListener("resize", handleViewportChange);
			if (rafId) cancelAnimationFrame(rafId);
		};
	}, [enabled, computePosition]);

	// 面板内容尺寸变化（结果面板渲染等）后自动重算
	useEffect(() => {
		if (!enabled || !panelRef?.current || typeof ResizeObserver === "undefined")
			return;
		const observer = new ResizeObserver(() => {
			computePosition();
		});
		observer.observe(panelRef.current);
		return () => observer.disconnect();
	}, [enabled, panelRef, computePosition]);

	return { pos, anchorVisible, refresh: computePosition };
}
