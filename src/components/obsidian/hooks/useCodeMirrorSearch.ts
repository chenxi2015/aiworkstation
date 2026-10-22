import { SearchQuery } from "@codemirror/search";
import type { EditorView } from "@codemirror/view";
import { toast } from "@heroui/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { computeReplacementText } from "../../common/documentSearchUtils";
import { setCmSearchMatchesEffect } from "../markdown/cmSearchHighlightExtension";

export interface UseCodeMirrorSearchOptions {
	view: EditorView | null;
}

interface MatchRange {
	from: number;
	to: number;
}

/**
 * Hook to manage CodeMirror 6 in-document search & replace, highlight decorations, and navigation.
 */
export function useCodeMirrorSearch({ view }: UseCodeMirrorSearchOptions) {
	const [isOpen, setIsOpen] = useState(false);
	const [isReplaceOpen, setIsReplaceOpen] = useState(false);
	const [query, setQuery] = useState("");
	const [replaceText, setReplaceText] = useState("");
	const [caseSensitive, setCaseSensitive] = useState(false);
	const [wholeWord, setWholeWord] = useState(false);
	const [isRegex, setIsRegex] = useState(false);
	const [preserveCase, setPreserveCase] = useState(false);
	const [currentIndex, setCurrentIndex] = useState(-1);
	const [matches, setMatches] = useState<MatchRange[]>([]);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);

	const matchesRef = useRef<MatchRange[]>([]);
	matchesRef.current = matches;
	const currentIndexRef = useRef(currentIndex);
	currentIndexRef.current = currentIndex;

	// Execute search query against CodeMirror EditorView and trigger decorations
	const executeSearch = useCallback(
		(
			searchQuery: string,
			opts: {
				caseSensitive: boolean;
				wholeWord: boolean;
				isRegex: boolean;
			},
			preferredIndex?: number,
		) => {
			if (!view) {
				setMatches([]);
				setCurrentIndex(-1);
				setErrorMessage(null);
				return;
			}

			if (!searchQuery) {
				try {
					view.dispatch({
						effects: setCmSearchMatchesEffect.of(null),
					});
				} catch {
					// Ignore dispatch errors if view is disposed
				}
				setMatches([]);
				setCurrentIndex(-1);
				setErrorMessage(null);
				return;
			}

			try {
				const queryObj = new SearchQuery({
					search: searchQuery,
					caseSensitive: opts.caseSensitive,
					regexp: opts.isRegex,
					wholeWord: opts.wholeWord,
				});

				// Collect all match ranges using CodeMirror cursor iterator
				const cursor = queryObj.getCursor(view.state.doc);
				const foundMatches: MatchRange[] = [];
				let item = cursor.next();
				while (!item.done) {
					foundMatches.push({ from: item.value.from, to: item.value.to });
					item = cursor.next();
				}

				setErrorMessage(null);
				setMatches(foundMatches);

				if (foundMatches.length === 0) {
					setCurrentIndex(-1);
					view.dispatch({
						effects: setCmSearchMatchesEffect.of(null),
					});
					return;
				}

				let nextIndex = 0;
				if (typeof preferredIndex === "number" && preferredIndex >= 0) {
					nextIndex = Math.min(preferredIndex, foundMatches.length - 1);
				} else {
					// Find match at or immediately after current cursor position
					const currentPos = view.state.selection.main.from;
					const idx = foundMatches.findIndex((m) => m.from >= currentPos);
					nextIndex = idx !== -1 ? idx : 0;
				}

				setCurrentIndex(nextIndex);

				// Highlight matches and scroll to active match
				view.dispatch({
					effects: setCmSearchMatchesEffect.of({
						matches: foundMatches,
						currentIndex: nextIndex,
					}),
				});

				const activeMatch = foundMatches[nextIndex];
				if (activeMatch) {
					view.dispatch({
						selection: { anchor: activeMatch.from, head: activeMatch.to },
						scrollIntoView: true,
					});
				}
			} catch {
				setErrorMessage("无效正则");
				setMatches([]);
				setCurrentIndex(-1);
				view.dispatch({
					effects: setCmSearchMatchesEffect.of(null),
				});
			}
		},
		[view],
	);

	// Re-run search whenever query or modifier toggles change
	useEffect(() => {
		if (isOpen) {
			executeSearch(query, { caseSensitive, wholeWord, isRegex });
		}
	}, [isOpen, query, caseSensitive, wholeWord, isRegex, executeSearch]);

	// Move selection and viewport to match at index
	const scrollToMatch = useCallback(
		(index: number) => {
			const currentMatches = matchesRef.current;
			if (!view || currentMatches.length === 0) return;

			const targetIndex =
				(index + currentMatches.length) % currentMatches.length;
			const targetMatch = currentMatches[targetIndex];
			if (!targetMatch) return;

			setCurrentIndex(targetIndex);

			try {
				view.dispatch({
					effects: setCmSearchMatchesEffect.of({
						matches: currentMatches,
						currentIndex: targetIndex,
					}),
					selection: { anchor: targetMatch.from, head: targetMatch.to },
				});
			} catch {
				// Handle potential stale range gracefully
			}

			// Smooth scroll exclusively inside CodeMirror's scrollDOM (prevent window/toolbar disturbance)
			requestAnimationFrame(() => {
				const el = view.dom.querySelector(".cm-searchMatch-selected");
				if (el instanceof HTMLElement && view.scrollDOM) {
					const parentRect = view.scrollDOM.getBoundingClientRect();
					const targetRect = el.getBoundingClientRect();
					const relativeTop =
						targetRect.top - parentRect.top + view.scrollDOM.scrollTop;
					const centeredTop = Math.max(
						0,
						relativeTop -
							view.scrollDOM.clientHeight / 2 +
							targetRect.height / 2,
					);
					view.scrollDOM.scrollTo({
						top: centeredTop,
						behavior: "smooth",
					});
				}
			});
		},
		[view],
	);

	const handleFindNext = useCallback(() => {
		scrollToMatch(currentIndexRef.current + 1);
	}, [scrollToMatch]);

	const handleFindPrev = useCallback(() => {
		scrollToMatch(currentIndexRef.current - 1);
	}, [scrollToMatch]);

	// Replace currently focused match and proceed to next match
	const handleReplaceNext = useCallback(() => {
		const currentMatches = matchesRef.current;
		const activeIdx = currentIndexRef.current;
		if (!view || currentMatches.length === 0 || activeIdx < 0) return;

		const targetMatch = currentMatches[activeIdx];
		if (!targetMatch) return;

		const originalText = view.state.sliceDoc(targetMatch.from, targetMatch.to);
		const replacement = computeReplacementText(originalText, replaceText, {
			isRegex,
			preserveCase,
			searchPattern: isRegex ? query : undefined,
			caseSensitive,
		});

		view.dispatch({
			changes: {
				from: targetMatch.from,
				to: targetMatch.to,
				insert: replacement,
			},
		});

		// Refresh search results keeping current index position
		executeSearch(query, { caseSensitive, wholeWord, isRegex }, activeIdx);
	}, [
		view,
		replaceText,
		isRegex,
		preserveCase,
		query,
		caseSensitive,
		executeSearch,
		wholeWord,
	]);

	// Replace all occurrences in single transaction (Batch replace)
	const handleReplaceAll = useCallback(() => {
		const currentMatches = matchesRef.current;
		if (!view || currentMatches.length === 0) return;

		const changes = currentMatches.map((m) => {
			const originalText = view.state.sliceDoc(m.from, m.to);
			const insert = computeReplacementText(originalText, replaceText, {
				isRegex,
				preserveCase,
				searchPattern: isRegex ? query : undefined,
				caseSensitive,
			});
			return { from: m.from, to: m.to, insert };
		});

		view.dispatch({ changes });
		toast.success(`已替换 ${changes.length} 处匹配项`);

		// Re-run search query
		executeSearch(query, { caseSensitive, wholeWord, isRegex });
	}, [
		view,
		replaceText,
		isRegex,
		preserveCase,
		query,
		caseSensitive,
		executeSearch,
		wholeWord,
	]);

	const openSearch = useCallback(
		(expandReplace = false) => {
			setIsOpen(true);
			if (expandReplace) {
				setIsReplaceOpen(true);
			}
			// Pre-populate search query if user has selected clean single-line text
			if (view) {
				const { from, to, empty } = view.state.selection.main;
				if (!empty && to - from <= 100) {
					const selectedText = view.state.sliceDoc(from, to).trim();
					if (selectedText && !selectedText.includes("\n")) {
						setQuery(selectedText);
					}
				}
			}
		},
		[view],
	);

	const closeSearch = useCallback(() => {
		setIsOpen(false);
		if (view) {
			try {
				view.dispatch({
					effects: setCmSearchMatchesEffect.of(null),
				});
				view.focus();
			} catch {
				// Ignore errors on view blur
			}
		}
	}, [view]);

	// Register global shortcut (Ctrl/Cmd+F for find, Ctrl/Cmd+Alt+F for replace)
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			const isFKey =
				e.key?.toLowerCase() === "f" || e.code === "KeyF" || e.keyCode === 70;

			if ((e.metaKey || e.ctrlKey) && isFKey) {
				e.preventDefault();
				e.stopPropagation();
				if (e.altKey) {
					openSearch(true);
				} else {
					openSearch(false);
				}
			} else if (e.key === "Escape" && isOpen) {
				e.preventDefault();
				closeSearch();
			}
		};

		window.addEventListener("keydown", handleKeyDown, true);
		return () => window.removeEventListener("keydown", handleKeyDown, true);
	}, [isOpen, openSearch, closeSearch]);

	return {
		isOpen,
		isReplaceOpen,
		toggleReplaceOpen: () => setIsReplaceOpen((prev) => !prev),
		query,
		setQuery,
		replaceText,
		setReplaceText,
		caseSensitive,
		toggleCaseSensitive: () => setCaseSensitive((prev) => !prev),
		wholeWord,
		toggleWholeWord: () => setWholeWord((prev) => !prev),
		isRegex,
		toggleRegex: () => setIsRegex((prev) => !prev),
		preserveCase,
		togglePreserveCase: () => setPreserveCase((prev) => !prev),
		currentIndex,
		totalMatches: matches.length,
		errorMessage,
		findNext: handleFindNext,
		findPrev: handleFindPrev,
		replaceNext: handleReplaceNext,
		replaceAll: handleReplaceAll,
		open: openSearch,
		close: closeSearch,
	};
}
