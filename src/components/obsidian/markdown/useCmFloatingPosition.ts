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
	panelWidth: defaultPanelW = 396,
	panelHeight: defaultPanelH = 260,
	panelRef,
	anchorRange,
	bottom = 16,
	topOffset = 8,
}: UseCmFloatingPositionOptions): CmFloatingPositionResult {
	const [pos, setPos] = useState({ top: 0, left: 0 });
	const [anchorVisible, setAnchorVisible] = useState(true);
	const posRef = useRef({ top: 0, left: 0 });

	// 每个编辑器实例只查找一次滚动祖先
	const scrollElRef = useRef<HTMLElement | null>(null);
	useEffect(() => {
		scrollElRef.current = view
			? findScrollableAncestor(view.dom.parentElement)
			: null;
	}, [view]);

	const calculateCoords = useCallback(() => {
		if (!view) return null;
		const sel = view.state.selection.main;
		const range =
			anchorRange || (!sel.empty ? { from: sel.from, to: sel.to } : null);
		if (!range) return null;

		const maxPos = view.state.doc.length;
		const from = Math.min(Math.max(0, range.from), maxPos);
		const to = Math.min(Math.max(0, range.to), maxPos);
		const start = view.coordsAtPos(from);
		const end = view.coordsAtPos(to);
		if (!start || !end) return null;

		// 锚点可见性：滚出屏幕则跳过重计算（由调用方决定隐藏）
		const visible = end.bottom > 0 && start.top < window.innerHeight;
		if (!visible) {
			return { visible: false, top: 0, left: 0 };
		}

		const panelH = panelRef?.current?.offsetHeight || defaultPanelH;
		const panelW = panelRef?.current?.offsetWidth || defaultPanelW;

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

		const contentEl = view.contentDOM ?? view.dom;
		const contentLeft = contentEl.getBoundingClientRect().left;
		const areaLeft = scrollElRef.current?.getBoundingClientRect().left ?? 8;
		const gutterWidth = contentLeft - areaLeft;

		let top = 0;
		let left = 0;

		// The content column has horizontal padding that is empty space,
		// so the panel may borrow up to 24px of it before it would cover text
		if (gutterWidth >= panelW - 24) {
			// Wide screen: park in the left gutter, flush with selection start
			const maxTop = boundaryBottom - panelH;
			top = Math.max(boundaryTop, start.top);
			if (top > maxTop) {
				top = Math.max(boundaryTop, maxTop);
			}
			left = Math.max(areaLeft + 4, contentLeft - panelW - 8);
		} else {
			// Narrow screen: below the selection
			left = Math.max(
				8,
				Math.min(start.left, window.innerWidth - panelW - 8),
			);
			top = end.bottom + 8;
			if (top + panelH > boundaryBottom) {
				const above = start.top - panelH - 8;
				top =
					above >= boundaryTop
						? above
						: Math.max(boundaryTop, boundaryBottom - panelH);
			}
		}

		return { visible: true, top, left };
	}, [
		view,
		anchorRange,
		defaultPanelH,
		defaultPanelW,
		panelRef,
		bottom,
		topOffset,
	]);

	const applyPosition = useCallback(
		(coords: { visible: boolean; top: number; left: number }, syncState = true) => {
			setAnchorVisible((prev) => (prev !== coords.visible ? coords.visible : prev));
			if (!coords.visible) return;

			// Instantly mutate DOM inline styles for zero latency (no React render cycle wait)
			if (panelRef?.current) {
				panelRef.current.style.top = `${coords.top}px`;
				panelRef.current.style.left = `${coords.left}px`;
			}

			if (syncState) {
				if (posRef.current.top !== coords.top || posRef.current.left !== coords.left) {
					posRef.current = { top: coords.top, left: coords.left };
					setPos({ top: coords.top, left: coords.left });
				}
			}
		},
		[panelRef],
	);

	const computePosition = useCallback(
		(syncState = true) => {
			const coords = calculateCoords();
			if (coords) {
				applyPosition(coords, syncState);
			}
		},
		[calculateCoords, applyPosition],
	);

	// 激活 / 锚点变化时立即重算
	useEffect(() => {
		if (enabled) computePosition(true);
	}, [enabled, computePosition]);

	// 实时即时滚动 / resize 跟随（scroll 不冒泡，用捕获监听所有滚动容器）
	useEffect(() => {
		if (!enabled) return;
		let rafId = 0;
		const handleScroll = () => {
			// 1. Instantly update DOM position synchronously on every scroll event (0 frame lag)
			const coords = calculateCoords();
			if (coords) {
				applyPosition(coords, false);
			}

			// 2. Throttle React state synchronization to avoid 60fps re-render overhead
			if (!rafId) {
				rafId = requestAnimationFrame(() => {
					rafId = 0;
					if (coords && coords.visible) {
						if (posRef.current.top !== coords.top || posRef.current.left !== coords.left) {
							posRef.current = { top: coords.top, left: coords.left };
							setPos({ top: coords.top, left: coords.left });
						}
					}
				});
			}
		};

		window.addEventListener("scroll", handleScroll, true);
		window.addEventListener("resize", handleScroll);
		return () => {
			window.removeEventListener("scroll", handleScroll, true);
			window.removeEventListener("resize", handleScroll);
			if (rafId) cancelAnimationFrame(rafId);
		};
	}, [enabled, calculateCoords, applyPosition]);

	// 面板内容尺寸变化（结果面板渲染等）后自动重算
	useEffect(() => {
		if (!enabled || !panelRef?.current || typeof ResizeObserver === "undefined")
			return;
		const observer = new ResizeObserver(() => {
			computePosition(true);
		});
		observer.observe(panelRef.current);
		return () => observer.disconnect();
	}, [enabled, panelRef, computePosition]);

	return { pos, anchorVisible, refresh: () => computePosition(true) };
}
