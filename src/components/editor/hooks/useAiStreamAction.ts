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
			const selection = editor.state.doc.textBetween(from, to, " ");
			if (!selection.trim()) return false;

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
						SuggestionController.finalizeStreaming(
							editor,
							suggestionId,
							{ from, to },
							selection,
							accumulated,
						);
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
		const selection = editor.state.doc.textBetween(from, to, " ");

		// Backup generation details so user can safely return to the result panel on Reject
		reviewBackupRef.current = {
			result,
			action: activeAction,
			targetRange: { from, to },
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
		const originalText = editor.state.doc.textBetween(from, to, " ");

		// Snapshot generation result for Undo restoration
		lastGenerationRef.current = {
			targetRange: { from, to },
			originalText,
			result,
			action: activeAction,
		};

		editor.chain().focus().insertContentAt({ from, to }, result).run();
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
	]);

	const handleInsertAfter = useCallback(async () => {
		if (!result) return;
		await onBeforeApply?.();
		const range = targetRange || editor.state.selection;
		const { from, to } = range;
		const originalText = editor.state.doc.textBetween(from, to, " ");

		// Snapshot generation result for Undo restoration
		lastGenerationRef.current = {
			targetRange: { from, to },
			originalText,
			result,
			action: activeAction,
		};

		editor.chain().focus().insertContentAt(to, `\n${result}`).run();
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
			if (lastGenerationRef.current && stateRef.current === "idle") {
				const lastGen = lastGenerationRef.current;
				const { from, to } = lastGen.targetRange;
				const docSize = editor.state.doc.content.size;
				if (from >= 0 && to <= docSize) {
					const currentText = editor.state.doc.textBetween(from, to, " ");
					const cleanCurrent = currentText.trim();
					const cleanOriginal = lastGen.originalText.trim();
					if (cleanCurrent === cleanOriginal && cleanOriginal.length > 0) {
						// Restored to pre-replace content -> reopen AI result panel
						setState("result");
						setResult(lastGen.result);
						setActiveAction(lastGen.action);
						setTargetRange(lastGen.targetRange);
						setVisualHighlight(lastGen.targetRange);
						editor.commands.setTextSelection({ from, to });
					}
				}
			}
		};

		handleTransaction();

		editor.on("transaction", handleTransaction);
		return () => {
			editor.off("transaction", handleTransaction);
		};
	}, [editor, updateSuggestionPos, setVisualHighlight]);

	// ── Follow suggestion on scroll / resize ────────────────────
	useEffect(() => {
		if (!activeSuggestion) return;

		let rafId = 0;
		const updateCoord = () => {
			if (rafId) return;
			rafId = requestAnimationFrame(() => {
				rafId = 0;
				updateSuggestionPos(activeSuggestion.id);
			});
		};

		window.addEventListener("scroll", updateCoord, true);
		window.addEventListener("resize", updateCoord);
		return () => {
			window.removeEventListener("scroll", updateCoord, true);
			window.removeEventListener("resize", updateCoord);
			if (rafId) cancelAnimationFrame(rafId);
		};
	}, [activeSuggestion, updateSuggestionPos]);

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
