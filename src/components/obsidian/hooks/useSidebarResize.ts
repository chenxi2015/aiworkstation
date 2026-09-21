import { useCallback, useRef, useState } from "react";

const MIN_SIDEBAR_WIDTH = 240;
const MAX_SIDEBAR_WIDTH = 600;
const DEFAULT_SIDEBAR_WIDTH = 300;
const STORAGE_KEY = "obsidian_sidebar_width";

/**
 * Custom hook to manage sidebar width state, drag resizing, and localStorage persistence.
 */
export function useSidebarResize() {
	const [sidebarWidth, setSidebarWidth] = useState(() => {
		if (typeof window === "undefined") return DEFAULT_SIDEBAR_WIDTH;
		try {
			const saved = Number(localStorage.getItem(STORAGE_KEY));
			if (saved >= MIN_SIDEBAR_WIDTH && saved <= MAX_SIDEBAR_WIDTH) {
				return saved;
			}
		} catch {
			// Ignore localStorage access errors
		}
		return DEFAULT_SIDEBAR_WIDTH;
	});

	const sidebarWidthRef = useRef(sidebarWidth);
	sidebarWidthRef.current = sidebarWidth;

	const handleSidebarResizeStart = useCallback((e: React.MouseEvent) => {
		e.preventDefault();
		const startX = e.clientX;
		const startWidth = sidebarWidthRef.current;

		const onMouseMove = (ev: MouseEvent) => {
			const next = Math.max(
				MIN_SIDEBAR_WIDTH,
				Math.min(MAX_SIDEBAR_WIDTH, startWidth + (ev.clientX - startX)),
			);
			setSidebarWidth(next);
		};

		const onMouseUp = () => {
			window.removeEventListener("mousemove", onMouseMove);
			window.removeEventListener("mouseup", onMouseUp);
			try {
				localStorage.setItem(STORAGE_KEY, String(sidebarWidthRef.current));
			} catch {
				// Ignore localStorage write errors
			}
		};

		window.addEventListener("mousemove", onMouseMove);
		window.addEventListener("mouseup", onMouseUp);
	}, []);

	return {
		sidebarWidth,
		handleSidebarResizeStart,
	};
}
