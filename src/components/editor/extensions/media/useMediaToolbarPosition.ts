import { type RefObject, useCallback, useEffect, useState } from "react";

interface UseMediaToolbarPositionOptions {
	containerRef: RefObject<HTMLElement | null>;
	toolbarRef: RefObject<HTMLElement | null>;
}

export interface MediaToolbarPositionResult {
	verticalPos: "top" | "bottom";
	horizontalShift: number;
	updateToolbarPosition: () => void;
}

/**
 * Hook to manage floating toolbar positioning and boundary clamping
 */
export function useMediaToolbarPosition({
	containerRef,
	toolbarRef,
}: UseMediaToolbarPositionOptions): MediaToolbarPositionResult {
	const [verticalPos, setVerticalPos] = useState<"top" | "bottom">("top");
	const [horizontalShift, setHorizontalShift] = useState(0);

	const updateToolbarPosition = useCallback(() => {
		if (!toolbarRef.current || !containerRef.current) return;
		const containerRect = containerRef.current.getBoundingClientRect();
		const toolbarRect = toolbarRef.current.getBoundingClientRect();

		// Avoid calculating when hidden or zero-dimensioned
		if (toolbarRect.width === 0 || toolbarRect.height === 0) return;

		// 1. Vertical space detection: if not enough space above, flip to bottom
		const spaceAbove = containerRect.top;
		const nextVertical = spaceAbove < 52 ? "bottom" : "top";

		// 2. Horizontal boundary clamping:
		// Since toolbar is right-aligned by default (right-0), we only clamp:
		// - Left edge: if media is small/narrow and toolbar sticks out beyond container/viewport left
		// - Right edge: only if toolbar overflows past the browser window viewport
		const editorEl =
			containerRef.current.closest(".tiptap-editor") ||
			containerRef.current.closest(".doc-content-body") ||
			document.body;
		const editorRect = editorEl.getBoundingClientRect();

		const safeLeft = Math.max(8, editorRect.left + 8);
		const viewportRight = window.innerWidth - 8;

		// Current unshifted position
		const currentLeft = toolbarRect.left - horizontalShift;
		const currentRight = toolbarRect.right - horizontalShift;

		let shift = 0;
		if (currentLeft < safeLeft) {
			shift = safeLeft - currentLeft;
		} else if (currentRight > viewportRight) {
			shift = viewportRight - currentRight;
		}

		setVerticalPos(nextVertical);
		setHorizontalShift(shift);
	}, [horizontalShift, containerRef, toolbarRef]);

	useEffect(() => {
		updateToolbarPosition();

		const handleScrollOrResize = () => {
			updateToolbarPosition();
		};

		window.addEventListener("resize", handleScrollOrResize, { passive: true });
		window.addEventListener("scroll", handleScrollOrResize, {
			passive: true,
			capture: true,
		});

		return () => {
			window.removeEventListener("resize", handleScrollOrResize);
			window.removeEventListener("scroll", handleScrollOrResize, {
				capture: true,
			});
		};
	}, [updateToolbarPosition]);

	return {
		verticalPos,
		horizontalShift,
		updateToolbarPosition,
	};
}
