import { useCallback, useEffect, useRef, useState } from "react";

export interface UseCanvasHistoryOptions {
	readOnly?: boolean;
	onRestore: (json: string) => void;
	onChange?: (json: string) => void;
}

const MAX_HISTORY = 30;

/**
 * Hook to manage Undo/Redo history stacks and Cmd/Ctrl + Z / Y keyboard shortcuts
 */
export function useCanvasHistory({
	readOnly = false,
	onRestore,
	onChange,
}: UseCanvasHistoryOptions) {
	const undoStackRef = useRef<string[]>([]);
	const redoStackRef = useRef<string[]>([]);
	const lastEmittedRef = useRef<string>("");
	const isHistoryActionRef = useRef(false);
	const [, setHistoryVersion] = useState(0);

	const initHistory = useCallback((initialJson: string) => {
		lastEmittedRef.current = initialJson;
		undoStackRef.current = [];
		redoStackRef.current = [];
		setHistoryVersion((v) => v + 1);
	}, []);

	const pushSnapshot = useCallback(
		(currentJson: string) => {
			if (readOnly) return;
			if (currentJson === lastEmittedRef.current) return;

			if (!isHistoryActionRef.current) {
				undoStackRef.current.push(lastEmittedRef.current);
				if (undoStackRef.current.length > MAX_HISTORY) {
					undoStackRef.current.shift();
				}
				redoStackRef.current = [];
				setHistoryVersion((v) => v + 1);
			} else {
				isHistoryActionRef.current = false;
			}

			lastEmittedRef.current = currentJson;
			onChange?.(currentJson);
		},
		[readOnly, onChange],
	);

	const undo = useCallback(() => {
		if (readOnly || undoStackRef.current.length === 0) return;
		const prevJson = undoStackRef.current.pop();
		if (!prevJson) return;

		redoStackRef.current.push(lastEmittedRef.current);
		isHistoryActionRef.current = true;
		lastEmittedRef.current = prevJson;

		onRestore(prevJson);
		onChange?.(prevJson);
		setHistoryVersion((v) => v + 1);
	}, [readOnly, onRestore, onChange]);

	const redo = useCallback(() => {
		if (readOnly || redoStackRef.current.length === 0) return;
		const nextJson = redoStackRef.current.pop();
		if (!nextJson) return;

		undoStackRef.current.push(lastEmittedRef.current);
		isHistoryActionRef.current = true;
		lastEmittedRef.current = nextJson;

		onRestore(nextJson);
		onChange?.(nextJson);
		setHistoryVersion((v) => v + 1);
	}, [readOnly, onRestore, onChange]);

	// Keyboard shortcuts: Cmd/Ctrl + Z (Undo), Cmd/Ctrl + Shift + Z / Cmd/Ctrl + Y (Redo)
	useEffect(() => {
		if (readOnly) return;
		const handleKeyDown = (e: KeyboardEvent) => {
			const target = e.target as HTMLElement | null;
			if (
				target &&
				(target.tagName === "INPUT" ||
					target.tagName === "TEXTAREA" ||
					target.isContentEditable)
			) {
				return;
			}
			if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
				e.preventDefault();
				if (e.shiftKey) {
					redo();
				} else {
					undo();
				}
			} else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "y") {
				e.preventDefault();
				redo();
			}
		};
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [readOnly, undo, redo]);

	return {
		lastEmittedRef,
		initHistory,
		pushSnapshot,
		undo,
		redo,
		canUndo: !readOnly && undoStackRef.current.length > 0,
		canRedo: !readOnly && redoStackRef.current.length > 0,
	};
}
