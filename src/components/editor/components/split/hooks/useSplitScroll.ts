import { useCallback, useRef, useState } from "react";

/**
 * Hook for synchronized dual-column scrolling and right column edge tracking.
 */
export function useSplitScroll() {
	const leftScrollRef = useRef<HTMLDivElement>(null);
	const rightScrollRef = useRef<HTMLDivElement>(null);
	const isScrollingRef = useRef<"left" | "right" | null>(null);
	const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const isRightAtBottomRef = useRef(true);
	const isRightSmoothScrollingRef = useRef(false);
	const [isRightAtTop, setIsRightAtTop] = useState(true);
	const [isRightAtBottom, setIsRightAtBottom] = useState(false);

	const trackRightScrollPosition = useCallback(() => {
		const right = rightScrollRef.current;
		if (!right || isRightSmoothScrollingRef.current) return;
		const distanceToBottom =
			right.scrollHeight - right.scrollTop - right.clientHeight;
		const atBottom = distanceToBottom <= 80;
		isRightAtBottomRef.current = atBottom;
		setIsRightAtTop(right.scrollTop <= 2);
		setIsRightAtBottom(atBottom);
	}, []);

	const scrollRightToTop = useCallback(() => {
		const right = rightScrollRef.current;
		if (!right) return;
		isRightAtBottomRef.current = false;
		setIsRightAtTop(true);
		setIsRightAtBottom(false);
		isRightSmoothScrollingRef.current = true;
		right.scrollTo({ top: 0, behavior: "smooth" });
		setTimeout(() => {
			isRightSmoothScrollingRef.current = false;
		}, 500);
	}, []);

	const scrollRightToBottom = useCallback(() => {
		const right = rightScrollRef.current;
		if (!right) return;
		isRightAtBottomRef.current = true;
		setIsRightAtTop(false);
		setIsRightAtBottom(true);
		isRightSmoothScrollingRef.current = true;
		right.scrollTo({ top: right.scrollHeight, behavior: "smooth" });
		setTimeout(() => {
			isRightSmoothScrollingRef.current = false;
		}, 500);
	}, []);

	// Synchronized smooth scrolling between columns
	const handleLeftScroll = useCallback(() => {
		if (isScrollingRef.current === "right") return;
		isScrollingRef.current = "left";
		if (leftScrollRef.current && rightScrollRef.current) {
			const left = leftScrollRef.current;
			const right = rightScrollRef.current;
			const maxScrollLeft = left.scrollHeight - left.clientHeight;
			const maxScrollRight = right.scrollHeight - right.clientHeight;
			if (maxScrollLeft > 0 && maxScrollRight > 0) {
				if (Math.abs(maxScrollLeft - maxScrollRight) <= 32) {
					right.scrollTop = Math.min(left.scrollTop, maxScrollRight);
				} else {
					const ratio = left.scrollTop / maxScrollLeft;
					right.scrollTop = ratio * maxScrollRight;
				}
			}
		}
		if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
		scrollTimeoutRef.current = setTimeout(() => {
			isScrollingRef.current = null;
		}, 60);
	}, []);

	const handleRightScroll = useCallback(() => {
		trackRightScrollPosition();
		if (isScrollingRef.current === "left") return;
		isScrollingRef.current = "right";
		if (leftScrollRef.current && rightScrollRef.current) {
			const left = leftScrollRef.current;
			const right = rightScrollRef.current;
			const maxScrollLeft = left.scrollHeight - left.clientHeight;
			const maxScrollRight = right.scrollHeight - right.clientHeight;
			if (maxScrollLeft > 0 && maxScrollRight > 0) {
				if (Math.abs(maxScrollLeft - maxScrollRight) <= 32) {
					left.scrollTop = Math.min(right.scrollTop, maxScrollLeft);
				} else {
					const ratio = right.scrollTop / maxScrollRight;
					left.scrollTop = ratio * maxScrollLeft;
				}
			}
		}
		if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
		scrollTimeoutRef.current = setTimeout(() => {
			isScrollingRef.current = null;
		}, 60);
	}, [trackRightScrollPosition]);

	return {
		leftScrollRef,
		rightScrollRef,
		isRightAtBottomRef,
		isRightAtTop,
		isRightAtBottom,
		handleLeftScroll,
		handleRightScroll,
		scrollRightToTop,
		scrollRightToBottom,
		trackRightScrollPosition,
	};
}
