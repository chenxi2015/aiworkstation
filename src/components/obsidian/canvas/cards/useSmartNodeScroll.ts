import { useEffect, useRef } from "react";

let lastCanvasMoveTime = 0;

/**
 * Mark that the canvas viewport is currently moving or panned.
 */
export function markCanvasMoving() {
	lastCanvasMoveTime = Date.now();
}

/**
 * Checks if the canvas has moved recently (within threshold ms).
 */
export function isCanvasRecentlyMoving(thresholdMs = 250): boolean {
	return Date.now() - lastCanvasMoveTime < thresholdMs;
}

export interface SmartScrollOptions {
	selected?: boolean;
	editing?: boolean;
}

/**
 * Hook to manage wheel events inside a canvas node card.
 * Instead of statically applying the 'nowheel' class (which unconditionally interrupts
 * canvas viewport panning whenever the pointer touches a card), this hook delegates wheel
 * events natively:
 * - When the card is selected/editing, not currently mid-gesture canvas panning, and has
 *   scrollable overflow in the scroll direction, it stops event propagation natively so the card
 *   scrolls smoothly.
 * - Otherwise (not selected, no overflow, horizontal pan, or reached boundary), it allows
 *   the event to bubble up to ReactFlow so canvas panning remains uninterrupted.
 */
export function useSmartNodeScroll<T extends HTMLElement = HTMLDivElement>(
	options?: SmartScrollOptions,
) {
	const ref = useRef<T>(null);
	const selected = Boolean(options?.selected);
	const editing = Boolean(options?.editing);

	useEffect(() => {
		const el = ref.current;
		if (!el) return;

		const handleWheel = (e: WheelEvent) => {
			// If canvas was recently moving (continuous gesture), let canvas pan continue
			if (isCanvasRecentlyMoving()) {
				return;
			}

			// Only allow card to consume wheel events if it is selected or actively editing
			if (!selected && !editing) {
				return;
			}

			// If pinch-zooming with ctrlKey on trackpad, let canvas handle zooming
			if (e.ctrlKey) {
				return;
			}

			const hasScrollableOverflow = el.scrollHeight > el.clientHeight;
			if (!hasScrollableOverflow) {
				return;
			}

			// If the gesture is predominantly horizontal, allow canvas to pan horizontally
			if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
				return;
			}

			const isScrollingDown = e.deltaY > 0;
			const isScrollingUp = e.deltaY < 0;

			const canScrollDown =
				isScrollingDown && el.scrollTop + el.clientHeight < el.scrollHeight - 1;
			const canScrollUp = isScrollingUp && el.scrollTop > 1;

			// If the node card can consume this vertical scroll, stop bubbling to ReactFlow
			if (canScrollDown || canScrollUp) {
				e.stopPropagation();
			}
		};

		el.addEventListener("wheel", handleWheel, { passive: true });
		return () => {
			el.removeEventListener("wheel", handleWheel);
		};
	}, [selected, editing]);

	return ref;
}
