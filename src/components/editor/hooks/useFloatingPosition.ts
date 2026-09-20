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
	panelWidth: defaultPanelW = 380,
	panelHeight: defaultPanelH = 40,
	panelRef,
	anchorRange,
	bottom = 16,
	topOffset = 8,
}: UseFloatingPositionOptions): FloatingPositionResult {
	const [pos, setPos] = useState<FloatPos>({ top: 0, left: 0 });
	const [anchorVisible, setAnchorVisible] = useState(true);

	// Cache the scrollable ancestor once per editor mount
	const scrollElRef = useRef<HTMLElement | null>(null);
	useEffect(() => {
		scrollElRef.current = findScrollableAncestor(editor.view.dom.parentElement);
	}, [editor]);

	const computePosition = useCallback(() => {
		const range =
			anchorRange ||
			(!editor.state.selection.empty
				? { from: editor.state.selection.from, to: editor.state.selection.to }
				: null);
		if (!range) return;

		const { view } = editor;
		const maxDocPos = editor.state.doc.content.size;
		const from = Math.min(Math.max(0, range.from), maxDocPos);
		const to = Math.min(Math.max(0, range.to), maxDocPos);

		const start = view.coordsAtPos(from);
		const end = view.coordsAtPos(to);

		// Anchor visibility check
		const visible = isRangeVisible(start.top, end.bottom);
		setAnchorVisible(visible);
		if (!visible) return; // Skip heavy layout math when off-screen

		const panelH = panelRef?.current?.offsetHeight ?? defaultPanelH;
		const panelW = panelRef?.current?.offsetWidth ?? defaultPanelW;

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

		// The content column has ~32px horizontal padding that is empty space,
		// so the panel may borrow up to 24px of it before it would cover text
		if (gutterWidth >= panelW - 24) {
			// Wide screen: park in the left gutter, flush with selection start
			const maxTop = boundaryBottom - panelH;
			let top = Math.max(boundaryTop, start.top);
			if (top > maxTop) {
				top = Math.max(boundaryTop, maxTop);
			}
			setPos({ top, left: Math.max(areaLeft + 4, contentLeft - panelW - 8) });
		} else {
			// Narrow screen: below the selection
			const left = Math.max(
				8,
				Math.min(start.left, window.innerWidth - panelW - 8),
			);
			let top = end.bottom + 8;
			if (top + panelH > boundaryBottom) {
				const above = start.top - panelH - 8;
				top =
					above >= boundaryTop
						? above
						: Math.max(boundaryTop, boundaryBottom - panelH);
			}
			setPos({ top, left });
		}
	}, [
		editor,
		defaultPanelH,
		defaultPanelW,
		panelRef,
		anchorRange,
		bottom,
		topOffset,
	]);

	// Immediate calculation when enabled or anchorRange changes
	useEffect(() => {
		if (enabled) {
			computePosition();
		}
	}, [enabled, computePosition]);

	// Sync position on editor selection change
	useEffect(() => {
		if (!enabled) return;

		const handleSelection = () => {
			computePosition();
		};

		editor.on("selectionUpdate", handleSelection);
		return () => {
			editor.off("selectionUpdate", handleSelection);
		};
	}, [editor, enabled, computePosition]);

	// rAF-throttled scroll / resize handler
	useEffect(() => {
		if (!enabled) return;

		let rafId = 0;
		const handleViewportChange = () => {
			if (rafId) return; // Already scheduled
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

	// Auto-recalculate when panel content size changes (e.g. prompt input grows, result panel renders)
	useEffect(() => {
		if (!enabled || !panelRef?.current || typeof ResizeObserver === "undefined")
			return;

		const observer = new ResizeObserver(() => {
			computePosition();
		});

		observer.observe(panelRef.current);
		return () => {
			observer.disconnect();
		};
	}, [enabled, panelRef, computePosition]);

	return { pos, anchorVisible, refresh: computePosition };
}
