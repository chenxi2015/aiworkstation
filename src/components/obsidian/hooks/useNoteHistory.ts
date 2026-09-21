import { useCallback, useEffect, useRef, useState } from "react";

const LAST_NOTE_STORAGE_KEY = "obsidian_last_selected_note";

export interface UseNoteHistoryOptions {
	initialNotePath?: string;
	onNoteChange?: (path: string | null) => void;
}

/**
 * Manages note navigation history stack (back/forward), hotkeys, and path remapping.
 */
export function useNoteHistory(options: UseNoteHistoryOptions = {}) {
	const { initialNotePath, onNoteChange } = options;

	const [noteHistory, setNoteHistory] = useState<{
		stack: string[];
		index: number;
	}>(() => {
		if (initialNotePath) {
			return { stack: [initialNotePath], index: 0 };
		}
		if (typeof window !== "undefined") {
			try {
				const saved = window.localStorage.getItem(LAST_NOTE_STORAGE_KEY);
				if (saved) {
					return { stack: [saved], index: 0 };
				}
			} catch {
				// Ignore localStorage error
			}
		}
		return { stack: [], index: -1 };
	});

	const selectedNotePath =
		noteHistory.index >= 0
			? (noteHistory.stack[noteHistory.index] ?? null)
			: null;

	// Persist current note and notify router of changes
	useEffect(() => {
		if (typeof window === "undefined") return;
		try {
			if (selectedNotePath) {
				window.localStorage.setItem(LAST_NOTE_STORAGE_KEY, selectedNotePath);
			} else {
				window.localStorage.removeItem(LAST_NOTE_STORAGE_KEY);
			}
		} catch {
			// Ignore localStorage error
		}
		onNoteChange?.(selectedNotePath);
	}, [selectedNotePath, onNoteChange]);

	const openNote = useCallback((path: string) => {
		setNoteHistory((prev) => {
			if (prev.stack[prev.index] === path) return prev;
			const stack = [...prev.stack.slice(0, prev.index + 1), path];
			return { stack, index: stack.length - 1 };
		});
	}, []);

	const clearNoteHistory = useCallback(() => {
		setNoteHistory({ stack: [], index: -1 });
	}, []);

	const goBack = useCallback(() => {
		setNoteHistory((prev) =>
			prev.index > 0 ? { ...prev, index: prev.index - 1 } : prev,
		);
	}, []);

	const goForward = useCallback(() => {
		setNoteHistory((prev) =>
			prev.index < prev.stack.length - 1
				? { ...prev, index: prev.index + 1 }
				: prev,
		);
	}, []);

	/** In-place remap history entries when entries are renamed or moved */
	const remapNoteHistory = useCallback((remap: (p: string) => string) => {
		setNoteHistory((prev) => ({
			stack: prev.stack.map(remap),
			index: prev.index,
		}));
	}, []);

	/** Current note deleted: remove from history and navigate to adjacent item */
	const removeCurrentNote = useCallback(() => {
		setNoteHistory((prev) => {
			if (prev.index < 0) return prev;
			const stack = prev.stack.filter((_, i) => i !== prev.index);
			return { stack, index: Math.min(prev.index, stack.length - 1) };
		});
	}, []);

	/** In-note rename: replace current history item in-place */
	const handleNoteRenamed = useCallback((newPath: string) => {
		setNoteHistory((prev) => {
			if (prev.index < 0) return prev;
			const stack = [...prev.stack];
			stack[prev.index] = newPath;
			return { stack, index: prev.index };
		});
	}, []);

	/** Remove all deleted entries matching filter and reposition index */
	const removeAffectedHistory = useCallback(
		(isAffected: (p: string) => boolean) => {
			setNoteHistory((prev) => {
				if (!prev.stack.some(isAffected)) return prev;
				const current = prev.index >= 0 ? prev.stack[prev.index] : null;
				const stack = prev.stack.filter((p) => !isAffected(p));
				const index =
					current && !isAffected(current)
						? stack.lastIndexOf(current)
						: Math.min(prev.index, stack.length) - 1;
				return { stack, index };
			});
		},
		[],
	);

	const canGoBack = noteHistory.index > 0;
	const canGoForward = noteHistory.index < noteHistory.stack.length - 1;

	// Hotkeys for Obsidian-compatible back/forward navigation (Cmd/Ctrl + Alt + Left/Right)
	useEffect(() => {
		const onKeyDown = (e: KeyboardEvent) => {
			if (!(e.altKey && (e.metaKey || e.ctrlKey))) return;
			if (e.key === "ArrowLeft") {
				e.preventDefault();
				goBack();
			} else if (e.key === "ArrowRight") {
				e.preventDefault();
				goForward();
			}
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [goBack, goForward]);

	// Deep link: open initial note when provided
	const initialNoteHandledRef = useRef(false);
	useEffect(() => {
		if (initialNoteHandledRef.current || !initialNotePath) return;
		initialNoteHandledRef.current = true;
		openNote(initialNotePath);
	}, [initialNotePath, openNote]);

	return {
		noteHistory,
		selectedNotePath,
		openNote,
		goBack,
		goForward,
		canGoBack,
		canGoForward,
		clearNoteHistory,
		remapNoteHistory,
		removeCurrentNote,
		handleNoteRenamed,
		removeAffectedHistory,
	};
}
