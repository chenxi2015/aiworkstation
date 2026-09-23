import { useCallback, useRef, useState } from "react";

const MIN_PANEL_WIDTH = 340;
const MAX_PANEL_WIDTH = 900;
const DEFAULT_PANEL_WIDTH = 420;
const STORAGE_KEY = "workbench_ai_panel_width";

/**
 * Resolve initial responsive width based on screen width
 */
function getDefaultWidth(): number {
	if (typeof window === "undefined") return DEFAULT_PANEL_WIDTH;
	if (window.innerWidth >= 1536) return 480;
	if (window.innerWidth >= 1280) return 440;
	return 380;
}

/**
 * Custom hook to manage right-side AI panel width, drag resizing, and persistence.
 */
export function useAiPanelResize() {
	const [panelWidth, setPanelWidth] = useState<number>(() => {
		if (typeof window === "undefined") return DEFAULT_PANEL_WIDTH;
		try {
			const saved = Number(localStorage.getItem(STORAGE_KEY));
			if (saved >= MIN_PANEL_WIDTH && saved <= MAX_PANEL_WIDTH) {
				return saved;
			}
		} catch {
			// Ignore localStorage read errors
		}
		return getDefaultWidth();
	});

	const [isResizing, setIsResizing] = useState(false);
	const panelWidthRef = useRef(panelWidth);
	panelWidthRef.current = panelWidth;

	const handleResizeStart = useCallback((e: React.MouseEvent) => {
		e.preventDefault();
		const startX = e.clientX;
		const startWidth = panelWidthRef.current;
		setIsResizing(true);

		// Temporarily disable text selection and enforce resizing cursor
		document.body.style.cursor = "col-resize";
		document.body.style.userSelect = "none";

		const onMouseMove = (ev: MouseEvent) => {
			// Right panel: dragging left decreases clientX, which increases panel width
			const delta = startX - ev.clientX;
			const maxAllowed =
				typeof window !== "undefined"
					? Math.min(MAX_PANEL_WIDTH, window.innerWidth - 320)
					: MAX_PANEL_WIDTH;

			const next = Math.max(
				MIN_PANEL_WIDTH,
				Math.min(maxAllowed, startWidth + delta),
			);
			setPanelWidth(next);
		};

		const onMouseUp = () => {
			setIsResizing(false);
			document.body.style.cursor = "";
			document.body.style.userSelect = "";

			window.removeEventListener("mousemove", onMouseMove);
			window.removeEventListener("mouseup", onMouseUp);

			try {
				localStorage.setItem(STORAGE_KEY, String(panelWidthRef.current));
			} catch {
				// Ignore localStorage write errors
			}
		};

		window.addEventListener("mousemove", onMouseMove);
		window.addEventListener("mouseup", onMouseUp);
	}, []);

	return {
		panelWidth,
		isResizing,
		handleResizeStart,
	};
}
