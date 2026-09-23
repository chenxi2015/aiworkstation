import { toast } from "@heroui/react";
import type { Editor } from "@tiptap/core";
import { Wand2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { streamRewriteText } from "../../../services/api/editorClient";
import type {
	ActionState,
	AiBarAction,
	FloatPos,
} from "../components/bubble/types";
import { aiHighlightPluginKey } from "../extensions/aiSelectionHighlight";
import {
	type ActiveSuggestionInfo,
	SuggestionController,
} from "../utils/suggestionController";

// ──────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────

export interface UseAiStreamActionOptions {
	editor: Editor;
	onBeforeApply?: () => Promise<void>;
	onGenerate?: (prompt: string) => Promise<string>;
	suggestionBarRef?: React.RefObject<HTMLDivElement | null>;
}

export interface AiStreamActionState {
	state: ActionState;
	result: string;
	activeAction: AiBarAction | null;
	isStreaming: boolean;
	activeSuggestion: ActiveSuggestionInfo | null;
	suggestionPos: FloatPos;
	targetRange: { from: number; to: number } | null;
}

export interface AiStreamActionHandlers {
	handleAction: (action: AiBarAction) => Promise<boolean>;
	handleCustomInstruction: (instruction: string) => void;
	handleStopStreaming: () => void;
	handleAcceptSuggestion: () => void;
	handleRejectSuggestion: () => void;
	handleReviewDiff: () => Promise<void>;
	handleReplace: () => Promise<void>;
	handleInsertAfter: () => Promise<void>;
	handleCopy: () => Promise<void>;
	handleClose: () => void;
	/** Reset visibility (called by selection change handler) */
	resetVisibility: () => void;
}

interface LastGenerationSnapshot {
	targetRange: { from: number; to: number };
	originalText: string;
	result: string;
	action: AiBarAction | null;
}

function escapeHtml(str: string): string {
	return str
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#039;");
}

// ──────────────────────────────────────────────────────────────────
// Hook
// ──────────────────────────────────────────────────────────────────

/**
 * Encapsulates all AI action execution logic: streaming rewrite, fallback
 * generation, persistent visual selection highlight, Undo restoration,
 * suggestion lifecycle (accept/reject), and result operations.
 */
export function useAiStreamAction({
	editor,
	onBeforeApply,
	onGenerate,
	suggestionBarRef,
}: UseAiStreamActionOptions): AiStreamActionState & AiStreamActionHandlers {
	const [state, setState] = useState<ActionState>("idle");
	const [result, setResult] = useState("");
	const [activeAction, setActiveAction] = useState<AiBarAction | null>(null);
	const [isStreaming, setIsStreaming] = useState(false);
	const [activeSuggestion, setActiveSuggestion] =
		useState<ActiveSuggestionInfo | null>(null);
	const [suggestionPos, setSuggestionPos] = useState<FloatPos>({
		top: 0,
		left: 0,
	});
	const [targetRange, setTargetRange] = useState<{
		from: number;
		to: number;
	} | null>(null);

	const abortControllerRef = useRef<AbortController | null>(null);
	const lastGenerationRef = useRef<LastGenerationSnapshot | null>(null);

	// ── Text extraction helper with hardBreak (<br>) to \n mapping ──
	const getDocText = useCallback(
		(from: number, to: number) => {
			return editor.state.doc.textBetween(from, to, "\n", (leafNode) =>
				leafNode.type.name === "hardBreak" ? "\n" : "",
			);
		},
		[editor],
	);

	// ── Visual selection decoration helper ──────────────────────
	const setVisualHighlight = useCallback(
		(range: { from: number; to: number } | null) => {
			if (!editor.isDestroyed) {
				editor.view.dispatch(
					editor.state.tr.setMeta(aiHighlightPluginKey, range),
				);
			}
		},
		[editor],
	);

	// ── Suggestion position helper ──────────────────────────────
	const updateSuggestionPos = useCallback(
		(suggestionId: string) => {
			const coords = SuggestionController.getFloatingCoordinates(
				editor,
				suggestionId,
			);
			if (coords) setSuggestionPos(coords);
		},
		[editor],
	);

	// ── AI action handler (streaming / fallback) ────────────────
	const handleAction = useCallback(
		async (action: AiBarAction) => {
			const { from, to } = editor.state.selection;
			const selection = getDocText(from, to);
			if (!selection.trim()) return false;

			// New generation invalidates any previous undo-recovery snapshot
			lastGenerationRef.current = null;

			setTargetRange({ from, to });
			setVisualHighlight({ from, to });

			// Fallback: custom onGenerate (non-streaming)
			if (onGenerate) {
				setState("loading");
				setActiveAction(action);
				setResult("");
				try {
					const prompt = action.prompt.replace("{selection}", selection);
					const generated = await onGenerate(prompt);
					setResult(generated);
					setState("result");
				} catch (err) {
					setResult(err instanceof Error ? err.message : String(err));
					setState("error");
				}
				return false;
			}

			// Streaming: write directly into editor via SuggestionController
			setState("idle");
			setVisualHighlight(null);

			await onBeforeApply?.();

			const suggestionId = `sug_${Date.now()}`;
			const initialSug = SuggestionController.startStreaming(
				editor,
				{ from, to },
				selection,
				suggestionId,
			);

			if (initialSug) {
				setActiveSuggestion(initialSug);
				setIsStreaming(true);
				updateSuggestionPos(suggestionId);
			}

			const prompt = action.prompt.replace("{selection}", selection);
			const ac = new AbortController();
			abortControllerRef.current = ac;

			let accumulated = "";

			try {
				await streamRewriteText(
					{ prompt },
					{
						onChunk: (_delta, fullText) => {
							accumulated = fullText;
							SuggestionController.updateStreaming(
								editor,
								suggestionId,
								fullText,
							);
							updateSuggestionPos(suggestionId);
						},
						onDone: (fullText) => {
							accumulated = fullText;
							setIsStreaming(false);
							const finalized = SuggestionController.finalizeStreaming(
								editor,
								suggestionId,
								{ from, to },
								selection,
								fullText,
							);
							if (finalized) {
								// Snapshot generation so Undo can restore the AI result panel
								lastGenerationRef.current = {
									targetRange: { from, to },
									originalText: selection,
									result: fullText,
									action,
								};
								setActiveSuggestion(finalized);
								updateSuggestionPos(suggestionId);
							}
						},
						onError: (err) => {
							setIsStreaming(false);
							toast.danger(err || "AI 生成建议失败");
							SuggestionController.reject(editor, suggestionId);
							setActiveSuggestion(null);
						},
					},
					ac.signal,
				);
			} catch (err: unknown) {
				setIsStreaming(false);
				if (!ac.signal.aborted) {
					console.warn("[useAiStreamAction] Streaming error:", err);
					if (accumulated) {
						const finalized = SuggestionController.finalizeStreaming(
							editor,
							suggestionId,
							{ from, to },
							selection,
							accumulated,
						);
						if (finalized) {
							lastGenerationRef.current = {
								targetRange: { from, to },
								originalText: selection,
								result: accumulated,
								action,
							};
							setActiveSuggestion(finalized);
							updateSuggestionPos(suggestionId);
						}
					} else {
						SuggestionController.reject(editor, suggestionId);
						setActiveSuggestion(null);
					}
				}
			} finally {
				abortControllerRef.current = null;
			}

			// Return whether we entered streaming mode (caller uses to hide bubble)
			return initialSug != null;
		},
		[
			editor,
			onGenerate,
			onBeforeApply,
			updateSuggestionPos,
			setVisualHighlight,
			getDocText,
		],
	);

	// ── Custom free-form instruction ────────────────────────────
	const handleCustomInstruction = useCallback(
		(instruction: string) => {
			const customAction: AiBarAction = {
				id: "custom",
				label:
					instruction.length > 12
						? `${instruction.slice(0, 12)}…`
						: instruction,
				icon: Wand2,
				prompt: `请按照以下指令处理选中文本：\n${instruction}\n\n要求：直接输出处理后的文本内容，不要包含任何解释、前缀或客套话。\n\n需要处理的文本：\n{selection}`,
			};
			void handleAction(customAction);
		},
		[handleAction],
	);

	// ── Stop streaming ──────────────────────────────────────────
	const handleStopStreaming = useCallback(() => {
		if (abortControllerRef.current) {
			abortControllerRef.current.abort();
			abortControllerRef.current = null;
		}
		setIsStreaming(false);
	}, []);

	const reviewBackupRef = useRef<{
		result: string;
		action: AiBarAction | null;
		targetRange: { from: number; to: number };
	} | null>(null);

	// ── Review diff in-editor ───────────────────────────────────
	const handleReviewDiff = useCallback(async () => {
		if (!result) return;
		await onBeforeApply?.();
		const range = targetRange || editor.state.selection;
		const { from, to } = range;
		const selection = getDocText(from, to);

		// Backup generation details so user can safely return to the result panel on Reject
		reviewBackupRef.current = {
			result,
			action: activeAction,
			targetRange: { from, to },
		};

		// Snapshot generation so Undo can restore the AI result panel
		lastGenerationRef.current = {
			targetRange: { from, to },
			originalText: selection,
			result,
			action: activeAction,
		};

		const suggestion = SuggestionController.applyFineDiff(
			editor,
			{ from, to },
			selection,
			result,
		);
		if (suggestion) {
			setActiveSuggestion(suggestion);
			updateSuggestionPos(suggestion.id);
		}
		// Temporarily hide the result panel so the user can inspect in-editor diff
		setState("idle");
		setVisualHighlight(null);
	}, [
		editor,
		result,
		targetRange,
		activeAction,
		onBeforeApply,
		updateSuggestionPos,
		setVisualHighlight,
		getDocText,
	]);

	// ── Accept / Reject suggestion ──────────────────────────────
	const handleAcceptSuggestion = useCallback(() => {
		if (!activeSuggestion) return;
		try {
			SuggestionController.accept(editor, activeSuggestion.id);
		} catch (err) {
			console.error("[useAiStreamAction] Failed to accept suggestion:", err);
			toast.danger("采纳建议失败");
		} finally {
			setActiveSuggestion(null);
			reviewBackupRef.current = null;
			setTargetRange(null);
			setResult("");
			setActiveAction(null);
		}
	}, [editor, activeSuggestion]);

	const handleRejectSuggestion = useCallback(() => {
		if (!activeSuggestion) return;
		// Explicit discard: undo-recovery must not resurrect the AI result
		lastGenerationRef.current = null;
		try {
			SuggestionController.reject(editor, activeSuggestion.id);
		} catch (err) {
			console.error("[useAiStreamAction] Failed to reject suggestion:", err);
			toast.danger("丢弃建议失败");
		} finally {
			setActiveSuggestion(null);
			// Seamlessly return to AI result panel so generated content is NOT lost
			if (reviewBackupRef.current) {
				const backup = reviewBackupRef.current;
				setState("result");
				setResult(backup.result);
				setActiveAction(backup.action);
				setTargetRange(backup.targetRange);
				setVisualHighlight(backup.targetRange);
				editor.commands.setTextSelection(backup.targetRange);
				reviewBackupRef.current = null;
			}
		}
	}, [editor, activeSuggestion, setVisualHighlight]);

	// ── Result operations (replace / insert / copy) ─────────────
	const handleReplace = useCallback(async () => {
		if (!result) return;
		await onBeforeApply?.();
		const range = targetRange || editor.state.selection;
		const { from, to } = range;
		const originalText = getDocText(from, to);

		// Snapshot generation result for Undo restoration
		lastGenerationRef.current = {
			targetRange: { from, to },
			originalText,
			result,
			action: activeAction,
		};

		const hasNewlines = result.includes("\n");
		if (hasNewlines) {
			// Multi-paragraph format: strictly split by newline and wrap into <p> tags
			// This completely prevents TipTap from converting \n into intra-paragraph <br> tags
			const paragraphs = result
				.split(/\r?\n+/)
				.map((p) => p.trim())
				.filter(Boolean);
			const html = paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join("");
			editor.chain().focus().insertContentAt({ from, to }, html).run();
		} else {
			// Single-line / inline replacement: preserve existing block structure
			editor.chain().focus().insertContentAt({ from, to }, result).run();
		}

		setState("idle");
		setResult("");
		setTargetRange(null);
		setVisualHighlight(null);
	}, [
		editor,
		result,
		targetRange,
		activeAction,
		onBeforeApply,
		setVisualHighlight,
		getDocText,
	]);

	const handleInsertAfter = useCallback(async () => {
		if (!result) return;
		await onBeforeApply?.();
		const range = targetRange || editor.state.selection;
		const { from, to } = range;
		const originalText = getDocText(from, to);

		// Snapshot generation result for Undo restoration
		lastGenerationRef.current = {
			targetRange: { from, to },
			originalText,
			result,
			action: activeAction,
		};

		// In insert-after mode, always insert as clean, separate paragraphs
		const paragraphs = result
			.split(/\r?\n+/)
			.map((p) => p.trim())
			.filter(Boolean);
		const html = paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join("");

		const $to = editor.state.doc.resolve(to);
		// Position after current enclosing block if inside one, else at 'to'
		const insertPos = $to.depth > 0 ? $to.after() : to;
		editor.chain().focus().insertContentAt(insertPos, html).run();

		setState("idle");
		setResult("");
		setTargetRange(null);
		setVisualHighlight(null);
	}, [
		editor,
		result,
		targetRange,
		activeAction,
		onBeforeApply,
		setVisualHighlight,
		getDocText,
	]);

	const handleCopy = useCallback(async () => {
		if (!result) return;
		await navigator.clipboard.writeText(result);
	}, [result]);

	const handleClose = useCallback(() => {
		setState("idle");
		setResult("");
		setActiveAction(null);
		setTargetRange(null);
		setVisualHighlight(null);
		lastGenerationRef.current = null;
		reviewBackupRef.current = null;
	}, [setVisualHighlight]);

	const resetVisibility = useCallback(() => {
		setState("idle");
		setResult("");
		setActiveAction(null);
		setTargetRange(null);
		setVisualHighlight(null);
		lastGenerationRef.current = null;
		reviewBackupRef.current = null;
	}, [setVisualHighlight]);

	const stateRef = useRef(state);
	stateRef.current = state;

	// ── Reopen the AI result panel from a generation snapshot ──
	// NOTE: clears the snapshot BEFORE dispatching editor transactions so the
	// transaction listener below cannot re-enter this recovery recursively.
	const reopenResultPanel = useCallback(
		(snapshot: LastGenerationSnapshot) => {
			lastGenerationRef.current = null;
			setState("result");
			setResult(snapshot.result);
			setActiveAction(snapshot.action);
			setTargetRange(snapshot.targetRange);
			setVisualHighlight(snapshot.targetRange);
			editor.commands.setTextSelection(snapshot.targetRange);
		},
		[editor, setVisualHighlight],
	);

	// ── Sync suggestion & undo recovery state with document (handles Undo/Redo) ─
	useEffect(() => {
		const handleTransaction = () => {
			// 1. Sync suggestion diff state
			const detected = SuggestionController.detectActiveSuggestion(editor);
			setActiveSuggestion((prev) => {
				if (!prev && !detected) return null;
				if (
					prev &&
					detected &&
					prev.id === detected.id &&
					prev.from === detected.from &&
					prev.to === detected.to
				) {
					return prev;
				}
				return detected;
			});
			if (detected) {
				updateSuggestionPos(detected.id);
			}

			// 2. Undo recovery: if user pressed Undo and the original text is restored
			//    (and no suggestion diff / streaming leftovers remain), reopen the
			//    AI result panel so the generated content is never lost on Undo.
			const lastGen = lastGenerationRef.current;
			if (
				lastGen &&
				stateRef.current === "idle" &&
				!detected &&
				!SuggestionController.hasSuggestionMarks(editor)
			) {
				const { from, to } = lastGen.targetRange;
				const docSize = editor.state.doc.content.size;
				if (from >= 0 && to <= docSize) {
					const currentText = getDocText(from, to);
					const normalize = (s: string) => s.replace(/\s+/g, " ").trim();
					const cleanCurrent = normalize(currentText);
					const cleanOriginal = normalize(lastGen.originalText);
					if (cleanCurrent === cleanOriginal && cleanOriginal.length > 0) {
						// Restored to pre-replace content -> reopen AI result panel
						reopenResultPanel(lastGen);
					}
				}
			}
		};

		handleTransaction();

		editor.on("transaction", handleTransaction);
		return () => {
			editor.off("transaction", handleTransaction);
		};
	}, [editor, updateSuggestionPos, getDocText, reopenResultPanel]);

	// ── Intercept Cmd+Z / Ctrl+Z while an AI suggestion is pending review ──
	// Runs in capture phase on document, i.e. BEFORE ProseMirror's keymap:
	// instead of letting Undo silently destroy the AI suggestion, reject the
	// suggestion (restoring the original text) and reopen the result panel
	// so the generated content survives the undo.
	useEffect(() => {
		const handleUndoCapture = (e: KeyboardEvent) => {
			const isUndo =
				(e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z" && !e.shiftKey;
			if (!isUndo || editor.isDestroyed) return;
			const target = e.target;
			if (!(target instanceof Node) || !editor.view.dom.contains(target))
				return;
			if (stateRef.current !== "idle") return;
			const lastGen = lastGenerationRef.current;
			if (!lastGen) return;
			const active = SuggestionController.detectActiveSuggestion(editor);
			if (!active) return;
			e.preventDefault();
			e.stopPropagation();
			SuggestionController.reject(editor, active.id);
			reopenResultPanel(lastGen);
		};

		document.addEventListener("keydown", handleUndoCapture, true);
		return () => {
			document.removeEventListener("keydown", handleUndoCapture, true);
		};
	}, [editor, reopenResultPanel]);

	// ── Follow suggestion on scroll / resize ────────────────────
	useEffect(() => {
		if (!activeSuggestion) return;

		let rafId = 0;
		const updateCoord = () => {
			const coords = SuggestionController.getFloatingCoordinates(
				editor,
				activeSuggestion.id,
			);
			if (coords && suggestionBarRef?.current) {
				suggestionBarRef.current.style.top = `${coords.top}px`;
				suggestionBarRef.current.style.left = `${coords.left}px`;
			}

			if (!rafId) {
				rafId = requestAnimationFrame(() => {
					rafId = 0;
					if (coords) setSuggestionPos(coords);
				});
			}
		};

		window.addEventListener("scroll", updateCoord, true);
		window.addEventListener("resize", updateCoord);
		return () => {
			window.removeEventListener("scroll", updateCoord, true);
			window.removeEventListener("resize", updateCoord);
			if (rafId) cancelAnimationFrame(rafId);
		};
	}, [editor, activeSuggestion, suggestionBarRef]);

	return {
		// State
		state,
		result,
		activeAction,
		isStreaming,
		activeSuggestion,
		suggestionPos,
		targetRange,
		// Handlers
		handleAction,
		handleCustomInstruction,
		handleStopStreaming,
		handleAcceptSuggestion,
		handleRejectSuggestion,
		handleReviewDiff,
		handleReplace,
		handleInsertAfter,
		handleCopy,
		handleClose,
		resetVisibility,
	};
}
