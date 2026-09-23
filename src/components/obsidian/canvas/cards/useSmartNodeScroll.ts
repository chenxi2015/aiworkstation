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
 * When the node is selected or actively editing:
 * 1. Attaches ReactFlow's 'nowheel' class dynamically so ReactFlow does not intercept
 *    wheel events or trigger canvas panning.
 * 2. Stops event propagation for wheel events inside the card so scrolling remains
 *    isolated to the node content without dragging the canvas viewport.
 * When unselected, 'nowheel' is removed so canvas panOnScroll functions normally
 * when cruising over cards.
 */
export function useSmartNodeScroll<T extends HTMLElement = HTMLDivElement>(
	options?: SmartScrollOptions,
) {
	const ref = useRef<T>(null);
	const selected = Boolean(options?.selected);
	const editing = Boolean(options?.editing);
	const isActive = selected || editing;

	useEffect(() => {
		const el = ref.current;
		if (!el) return;

		// Dynamically toggle 'nowheel' class based on selection / editing state
		if (isActive) {
			el.classList.add("nowheel");
		} else {
			el.classList.remove("nowheel");
		}

		const handleWheel = (e: WheelEvent) => {
			// When unselected and not editing, let canvas handle wheel gestures
			if (!isActive) {
				return;
			}

			// If pinch-zooming with ctrlKey on trackpad, let canvas handle zooming
			if (e.ctrlKey) {
				return;
			}

			// Stop wheel event from propagating to outer ReactFlow container or page
			e.stopPropagation();
		};

		el.addEventListener("wheel", handleWheel, { passive: true });
		return () => {
			el.removeEventListener("wheel", handleWheel);
			el.classList.remove("nowheel");
		};
	}, [isActive]);

	return ref;
}
