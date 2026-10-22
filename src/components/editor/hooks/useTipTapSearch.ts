import { toast } from "@heroui/react";
import type { Node as PmNode } from "@tiptap/pm/model";
import { TextSelection } from "@tiptap/pm/state";
import type { Editor } from "@tiptap/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { computeReplacementText } from "../../common/documentSearchUtils";
import {
	type SearchMatchRange,
	searchHighlightPluginKey,
} from "../extensions/searchHighlight";

export interface UseTipTapSearchOptions {
	editor: Editor | null;
}

/**
 * Escapes special regex characters for literal matching
 */
function escapeRegExp(str: string): string {
	return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Scans ProseMirror document tree for text matches matching query and options
 */
function findDocMatches(
	doc: PmNode,
	query: string,
	caseSensitive: boolean,
	wholeWord: boolean,
	isRegex: boolean,
): { matches: SearchMatchRange[]; error: string | null } {
	if (!query) {
		return { matches: [], error: null };
	}

	let regex: RegExp;
	try {
		let pattern = isRegex ? query : escapeRegExp(query);
		if (wholeWord) {
			pattern = `\\b${pattern}\\b`;
		}
		regex = new RegExp(pattern, caseSensitive ? "gu" : "gui");
	} catch {
		return { matches: [], error: "无效正则" };
	}

	const matches: SearchMatchRange[] = [];
	doc.descendants((node, pos) => {
		if (!node.isText || !node.text) return;
		regex.lastIndex = 0;
		let match: RegExpExecArray | null = regex.exec(node.text);
		while (match !== null) {
			const from = pos + match.index;
			const to = from + match[0].length;
			if (from < to) {
				matches.push({ from, to });
			}
			if (match[0].length === 0) {
				regex.lastIndex++;
			}
			if (!regex.global) break;
			match = regex.exec(node.text);
		}
	});

	return { matches, error: null };
}

/**
 * Hook to manage TipTap in-article search, batch replace, decoration highlights, and navigation
 */
export function useTipTapSearch({ editor }: UseTipTapSearchOptions) {
	const [isOpen, setIsOpen] = useState(false);
	const [isReplaceOpen, setIsReplaceOpen] = useState(false);
	const [query, setQuery] = useState("");
	const [replaceText, setReplaceText] = useState("");
	const [caseSensitive, setCaseSensitive] = useState(false);
	const [wholeWord, setWholeWord] = useState(false);
	const [isRegex, setIsRegex] = useState(false);
	const [preserveCase, setPreserveCase] = useState(false);
	const [currentIndex, setCurrentIndex] = useState(-1);
	const [matches, setMatches] = useState<SearchMatchRange[]>([]);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);

	const editorRef = useRef<Editor | null>(editor);
	editorRef.current = editor;
	const matchesRef = useRef<SearchMatchRange[]>([]);
	matchesRef.current = matches;
	const currentIndexRef = useRef(currentIndex);
	currentIndexRef.current = currentIndex;

	// Synchronize highlights to ProseMirror decorations
	const updateDecorations = useCallback(
		(currentMatches: SearchMatchRange[], activeIdx: number) => {
			if (!editor || editor.isDestroyed) return;
			const tr = editor.state.tr;
			tr.setMeta(searchHighlightPluginKey, {
				matches: currentMatches,
				currentIndex: activeIdx,
			});
			editor.view.dispatch(tr);
		},
		[editor],
	);

	// Execute search query against editor doc
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
			if (!editor || editor.isDestroyed || !searchQuery) {
				setMatches([]);
				setCurrentIndex(-1);
				setErrorMessage(null);
				updateDecorations([], -1);
				return;
			}

			const { matches: found, error } = findDocMatches(
				editor.state.doc,
				searchQuery,
				opts.caseSensitive,
				opts.wholeWord,
				opts.isRegex,
			);

			setErrorMessage(error);
			setMatches(found);

			if (found.length === 0) {
				setCurrentIndex(-1);
				updateDecorations([], -1);
				return;
			}

			let nextIndex = 0;
			if (typeof preferredIndex === "number" && preferredIndex >= 0) {
				nextIndex = Math.min(preferredIndex, found.length - 1);
			} else {
				// Pick the closest match at or after current selection
				const currentPos = editor.state.selection.from;
				const foundIdx = found.findIndex((m) => m.from >= currentPos);
				nextIndex = foundIdx !== -1 ? foundIdx : 0;
			}

			setCurrentIndex(nextIndex);
			updateDecorations(found, nextIndex);
		},
		[editor, updateDecorations],
	);

	// Re-run search whenever query or modifiers change
	useEffect(() => {
		if (isOpen) {
			executeSearch(query, { caseSensitive, wholeWord, isRegex });
		}
	}, [isOpen, query, caseSensitive, wholeWord, isRegex, executeSearch]);

	// Auto re-scan matches when editor document updates
	useEffect(() => {
		if (!editor || editor.isDestroyed) return;
		const handleUpdate = () => {
			if (isOpen && query) {
				executeSearch(
					query,
					{ caseSensitive, wholeWord, isRegex },
					currentIndexRef.current,
				);
			}
		};
		editor.on("update", handleUpdate);
		return () => {
			editor.off("update", handleUpdate);
		};
	}, [editor, isOpen, query, caseSensitive, wholeWord, isRegex, executeSearch]);

	// Move cursor and smoothly scroll exclusively inside editor's scroll container
	const scrollToMatch = useCallback(
		(index: number) => {
			const currentMatches = matchesRef.current;
			const curEditor = editorRef.current;
			if (!curEditor || curEditor.isDestroyed || currentMatches.length === 0)
				return;

			const targetIndex =
				(index + currentMatches.length) % currentMatches.length;
			const targetMatch = currentMatches[targetIndex];
			if (!targetMatch) return;

			setCurrentIndex(targetIndex);
			updateDecorations(currentMatches, targetIndex);

			// Position text selection in editor without triggering ProseMirror's disruptive global scroll
			try {
				const tr = curEditor.state.tr;
				tr.setSelection(
					TextSelection.create(
						curEditor.state.doc,
						targetMatch.from,
						targetMatch.to,
					),
				);
				curEditor.view.dispatch(tr);
			} catch {
				// Handle potential stale position gracefully
			}

			// Scroll ONLY within the designated scrolling parent container (prevent disturbing toolbar or page layout)
			requestAnimationFrame(() => {
				const currentEl = curEditor.view.dom.querySelector(
					".search-match-current",
				);
				if (!(currentEl instanceof HTMLElement)) return;

				let scrollParent = curEditor.view.dom.parentElement;
				while (scrollParent && scrollParent !== document.body) {
					const overflowY = window.getComputedStyle(scrollParent).overflowY;
					if (overflowY === "auto" || overflowY === "scroll") {
						break;
					}
					scrollParent = scrollParent.parentElement;
				}

				if (scrollParent instanceof HTMLElement) {
					const parentRect = scrollParent.getBoundingClientRect();
					const targetRect = currentEl.getBoundingClientRect();
					const targetRelativeTop =
						targetRect.top - parentRect.top + scrollParent.scrollTop;
					const centeredScrollTop = Math.max(
						0,
						targetRelativeTop -
							scrollParent.clientHeight / 2 +
							targetRect.height / 2,
					);

					scrollParent.scrollTo({
						top: centeredScrollTop,
						behavior: "smooth",
					});
				}
			});
		},
		[updateDecorations],
	);

	const handleFindNext = useCallback(() => {
		scrollToMatch(currentIndexRef.current + 1);
	}, [scrollToMatch]);

	const handleFindPrev = useCallback(() => {
		scrollToMatch(currentIndexRef.current - 1);
	}, [scrollToMatch]);

	// Replace currently focused match in TipTap
	const handleReplaceNext = useCallback(() => {
		const currentMatches = matchesRef.current;
		const activeIdx = currentIndexRef.current;
		if (
			!editor ||
			editor.isDestroyed ||
			currentMatches.length === 0 ||
			activeIdx < 0
		)
			return;

		const targetMatch = currentMatches[activeIdx];
		if (!targetMatch) return;

		const originalText = editor.state.doc.textBetween(
			targetMatch.from,
			targetMatch.to,
		);
		const replacement = computeReplacementText(originalText, replaceText, {
			isRegex,
			preserveCase,
			searchPattern: isRegex ? query : undefined,
			caseSensitive,
		});

		const tr = editor.state.tr.replaceWith(
			targetMatch.from,
			targetMatch.to,
			replacement ? editor.schema.text(replacement) : [],
		);
		editor.view.dispatch(tr);

		// Re-run search keeping active index
		executeSearch(query, { caseSensitive, wholeWord, isRegex }, activeIdx);
	}, [
		editor,
		replaceText,
		isRegex,
		preserveCase,
		query,
		caseSensitive,
		executeSearch,
		wholeWord,
	]);

	// Batch replace all matches in reverse position order
	const handleReplaceAll = useCallback(() => {
		const currentMatches = matchesRef.current;
		if (!editor || editor.isDestroyed || currentMatches.length === 0) return;

		// Reverse sorting ensures replacing at higher positions does not invalidate lower offsets
		const sorted = [...currentMatches].sort((a, b) => b.from - a.from);
		const tr = editor.state.tr;

		for (const m of sorted) {
			const originalText = editor.state.doc.textBetween(m.from, m.to);
			const replacement = computeReplacementText(originalText, replaceText, {
				isRegex,
				preserveCase,
				searchPattern: isRegex ? query : undefined,
				caseSensitive,
			});
			tr.replaceWith(
				m.from,
				m.to,
				replacement ? editor.schema.text(replacement) : [],
			);
		}

		editor.view.dispatch(tr);
		toast.success(`已替换 ${sorted.length} 处匹配项`);

		// Re-run search query
		executeSearch(query, { caseSensitive, wholeWord, isRegex });
	}, [
		editor,
		replaceText,
		isRegex,
		preserveCase,
		query,
		caseSensitive,
		executeSearch,
		wholeWord,
	]);

	const openSearch = useCallback((expandReplace = false) => {
		setIsOpen(true);
		if (expandReplace) {
			setIsReplaceOpen(true);
		}
		const curEditor = editorRef.current;
		// Pre-populate search query if user has a clean non-empty single-line selection
		if (curEditor && !curEditor.isDestroyed) {
			const { from, to, empty } = curEditor.state.selection;
			if (!empty && to - from <= 100) {
				const selectedText = curEditor.state.doc
					.textBetween(from, to, " ")
					.trim();
				if (selectedText && !selectedText.includes("\n")) {
					setQuery(selectedText);
				}
			}
		}
	}, []);

	const closeSearch = useCallback(() => {
		setIsOpen(false);
		updateDecorations([], -1);
		const curEditor = editorRef.current;
		if (curEditor && !curEditor.isDestroyed) {
			curEditor.commands.focus();
		}
	}, [updateDecorations]);

	// Register global and TipTap editor shortcuts (Ctrl/Cmd+F for find, Ctrl/Cmd+Alt+F for replace)
	useEffect(() => {
		const handleCustomOpen = (e: Event) => {
			const detail = (e as CustomEvent<{ replace?: boolean }>).detail;
			openSearch(Boolean(detail?.replace));
		};

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

		window.addEventListener("tiptap:open-search", handleCustomOpen);
		window.addEventListener("keydown", handleKeyDown, true);
		return () => {
			window.removeEventListener("tiptap:open-search", handleCustomOpen);
			window.removeEventListener("keydown", handleKeyDown, true);
		};
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
