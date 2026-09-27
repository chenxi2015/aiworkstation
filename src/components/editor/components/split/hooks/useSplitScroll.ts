import type React from "react";
import { useCallback, useRef, useState } from "react";

export interface UseSplitScrollOptions {
	isStreaming?: boolean;
	defaultSyncScroll?: boolean;
}

/**
 * Hook for dual-column scrolling:
 * - Independent scrolling while AI is streaming or when user disables sync scroll.
 * - Customizable synchronized scrolling toggle with persistent preference.
 */
export function useSplitScroll(options?: UseSplitScrollOptions) {
	const leftScrollRef = useRef<HTMLDivElement>(null);
	const rightScrollRef = useRef<HTMLDivElement>(null);

	// User-customizable sync scroll toggle, stored in localStorage
	const [isSyncScroll, setIsSyncScroll] = useState<boolean>(() => {
		if (typeof window !== "undefined") {
			const saved = localStorage.getItem("ai_split_sync_scroll");
			if (saved !== null) {
				return saved === "true";
			}
		}
		return options?.defaultSyncScroll ?? false;
	});

	const isStreamingRef = useRef(options?.isStreaming ?? false);
	const isScrollingRef = useRef<"left" | "right" | null>(null);
	const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const isRightAtBottomRef = useRef(true);
	const isRightSmoothScrollingRef = useRef(false);
	const [isRightAtTop, setIsRightAtTop] = useState(true);
	const [isRightAtBottom, setIsRightAtBottom] = useState(false);

	const toggleSyncScroll = useCallback(() => {
		setIsSyncScroll((prev) => {
			const next = !prev;
			if (typeof window !== "undefined") {
				localStorage.setItem("ai_split_sync_scroll", String(next));
			}
			return next;
		});
	}, []);

	const trackRightScrollPosition = useCallback(() => {
		const right = rightScrollRef.current;
		if (!right || isRightSmoothScrollingRef.current) return;
		const distanceToBottom =
			right.scrollHeight - right.scrollTop - right.clientHeight;
		const atBottom = distanceToBottom <= 40;
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

	// Synchronize scroll from left to right (only active when enabled and AI generation is idle)
	const handleLeftScroll = useCallback(() => {
		if (!isSyncScroll || isStreamingRef.current) return;
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
	}, [isSyncScroll]);

	// Synchronize scroll from right to left (only active when enabled and AI generation is idle)
	const handleRightScroll = useCallback(() => {
		trackRightScrollPosition();

		if (!isSyncScroll || isStreamingRef.current) return;
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
	}, [trackRightScrollPosition, isSyncScroll]);

	// Disconnect auto-bottom pinning immediately if user scrolls up via mouse wheel / trackpad
	const handleRightWheel = useCallback(
		(e: React.WheelEvent<HTMLDivElement>) => {
			if (e.deltaY < 0) {
				isRightAtBottomRef.current = false;
			}
		},
		[],
	);

	const setIsStreaming = useCallback((streaming: boolean) => {
		isStreamingRef.current = streaming;
	}, []);

	return {
		leftScrollRef,
		rightScrollRef,
		isRightAtBottomRef,
		isRightAtTop,
		isRightAtBottom,
		isSyncScroll,
		toggleSyncScroll,
		setIsSyncScroll,
		handleLeftScroll,
		handleRightScroll,
		handleRightWheel,
		scrollRightToTop,
		scrollRightToBottom,
		trackRightScrollPosition,
		setIsStreaming,
	};
}


