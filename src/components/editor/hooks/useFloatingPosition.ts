import type { Editor } from "@tiptap/core";
import { useCallback, useEffect, useRef, useState } from "react";
import type { FloatPos } from "../components/bubble/types";

// ──────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────

/** Walk up the DOM to find the first scrollable ancestor */
function findScrollableAncestor(el: HTMLElement | null): HTMLElement | null {
	let node = el;
	while (node) {
		const { overflowY } = getComputedStyle(node);
		if (overflowY === "auto" || overflowY === "scroll") return node;
		node = node.parentElement;
	}
	return null;
}

/** Check whether a rect-range (selection top/bottom) overlaps the viewport */
function isRangeVisible(top: number, bottom: number): boolean {
	return bottom > 0 && top < window.innerHeight;
}

// ──────────────────────────────────────────────────────────────────
// Hook
// ──────────────────────────────────────────────────────────────────

export interface UseFloatingPositionOptions {
	editor: Editor;
	/** Whether the floating element is currently active */
	enabled: boolean;
	/** Measured width of the floating panel (default 380) */
	panelWidth?: number;
	/** Measured height of the floating panel (default 40) */
	panelHeight?: number;
	/** Ref to the floating panel element for live size measurement */
	panelRef?: React.RefObject<HTMLDivElement | null>;
	/** Optional explicit document range to anchor to (useful when selection is lost) */
	anchorRange?: { from: number; to: number } | null;
	/** Distance/margin from the bottom of viewport or scroll container (default 16) */
	bottom?: number;
	/** Safe distance from the top boundary (default 8) */
	topOffset?: number;
}

export interface FloatingPositionResult {
	pos: FloatPos;
	/** Whether the anchor selection is within the visible viewport */
	anchorVisible: boolean;
	/** Manually trigger a position recalculation */
	refresh: () => void;
}

/**
 * Computes a `position: fixed` coordinate for a panel floating near the
 * editor selection. Caches the scrollable ancestor, throttles updates
 * with rAF, and reports anchor visibility.
 */
export function useFloatingPosition({
	editor,
	enabled,
	panelWidth: defaultPanelW = 396,
	panelHeight: defaultPanelH = 260,
	panelRef,
	anchorRange,
	bottom = 16,
	topOffset = 8,
}: UseFloatingPositionOptions): FloatingPositionResult {
	const [pos, setPos] = useState<FloatPos>({ top: 0, left: 0 });
	const [anchorVisible, setAnchorVisible] = useState(true);
	const posRef = useRef<FloatPos>({ top: 0, left: 0 });

	// Cache the scrollable ancestor once per editor mount
	const scrollElRef = useRef<HTMLElement | null>(null);
	useEffect(() => {
		scrollElRef.current = findScrollableAncestor(editor.view.dom.parentElement);
	}, [editor]);

	const calculateCoords = useCallback(() => {
		const range =
			anchorRange ||
			(!editor.state.selection.empty
				? { from: editor.state.selection.from, to: editor.state.selection.to }
				: null);
		if (!range) return null;

		const { view } = editor;
		const maxDocPos = editor.state.doc.content.size;
		const from = Math.min(Math.max(0, range.from), maxDocPos);
		const to = Math.min(Math.max(0, range.to), maxDocPos);

		const start = view.coordsAtPos(from);
		const end = view.coordsAtPos(to);

		// Anchor visibility check
		const visible = isRangeVisible(start.top, end.bottom);
		if (!visible) {
			return { visible: false, top: 0, left: 0 };
		}

		const panelH = panelRef?.current?.offsetHeight || defaultPanelH;
		const panelW = panelRef?.current?.offsetWidth || defaultPanelW;

		// Calculate vertical boundaries considering scroll container and viewport
		const containerBottom = scrollElRef.current
			? scrollElRef.current.getBoundingClientRect().bottom
			: window.innerHeight;
		const boundaryBottom =
			Math.min(window.innerHeight, containerBottom) - bottom;
		const boundaryTop = Math.max(
			topOffset,
			scrollElRef.current
				? Math.max(0, scrollElRef.current.getBoundingClientRect().top) +
						topOffset
				: topOffset,
		);

		const contentLeft = view.dom.getBoundingClientRect().left;
		const areaLeft = scrollElRef.current?.getBoundingClientRect().left ?? 8;
		const gutterWidth = contentLeft - areaLeft;

		let top = 0;
		let left = 0;

		// The content column has ~32px horizontal padding that is empty space,
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
		editor,
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

	// Immediate calculation when enabled or anchorRange changes
	useEffect(() => {
		if (enabled) {
			computePosition(true);
		}
	}, [enabled, computePosition]);

	// Sync position on editor selection change
	useEffect(() => {
		if (!enabled) return;

		const handleSelection = () => {
			computePosition(true);
		};

		editor.on("selectionUpdate", handleSelection);
		return () => {
			editor.off("selectionUpdate", handleSelection);
		};
	}, [editor, enabled, computePosition]);

	// Instant scroll and resize tracking
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

	// Auto-recalculate when panel content size changes (e.g. prompt input grows, result panel renders)
	useEffect(() => {
		if (!enabled || !panelRef?.current || typeof ResizeObserver === "undefined")
			return;

		const observer = new ResizeObserver(() => {
			computePosition(true);
		});

		observer.observe(panelRef.current);
		return () => {
			observer.disconnect();
		};
	}, [enabled, panelRef, computePosition]);

	return { pos, anchorVisible, refresh: () => computePosition(true) };
}
