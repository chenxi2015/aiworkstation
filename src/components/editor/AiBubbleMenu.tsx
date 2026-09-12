import { toast } from "@heroui/react";
import type { Editor } from "@tiptap/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { streamRewriteText } from "../../services/api/editorClient";
import { AiResultPanel } from "./components/bubble/AiResultPanel";
import { AiRewriteDropdown } from "./components/bubble/AiRewriteDropdown";
import { AiSuggestionReviewBar } from "./components/bubble/AiSuggestionReviewBar";
import { InlineFormatGroup } from "./components/bubble/InlineFormatGroup";
import {
	type ActionState,
	type AiBarAction,
	DEFAULT_ACTIONS,
	type FloatPos,
} from "./components/bubble/types";
import {
	type ActiveSuggestionInfo,
	SuggestionController,
} from "./utils/suggestionController";

// Re-export types & constants for external consumers
export type { AiBarAction };
export { DEFAULT_ACTIONS };

export interface AiBubbleMenuProps {
	editor: Editor;
	/** Called before AI writes back to editor (caller should take a version snapshot) */
	onBeforeApply?: () => Promise<void>;
	/** Override or extend action list */
	extraActions?: AiBarAction[];
	/** Server function for AI text generation */
	onGenerate?: (prompt: string) => Promise<string>;
	/** Whether full-document paragraph pipeline is actively streaming */
	isPipelineRunning?: boolean;
}

/**
 * Floating selection action bar:
 * Combines essential inline formatting tools with an expandable AI rewrite dropdown.
 */
export function AiBubbleMenu({
	editor,
	onBeforeApply,
	extraActions = [],
	onGenerate,
	isPipelineRunning = false,
}: AiBubbleMenuProps) {
	const [visible, setVisible] = useState(false);
	const [pos, setPos] = useState<FloatPos>({ top: 0, left: 0 });
	const [state, setState] = useState<ActionState>("idle");
	const [result, setResult] = useState("");
	const [activeAction, setActiveAction] = useState<AiBarAction | null>(null);
	const [activeSuggestion, setActiveSuggestion] =
		useState<ActiveSuggestionInfo | null>(null);
	const [suggestionPos, setSuggestionPos] = useState<{
		top: number;
		left: number;
	}>({ top: 0, left: 0 });
	const [isStreaming, setIsStreaming] = useState(false);
	const abortControllerRef = useRef<AbortController | null>(null);
	const panelRef = useRef<HTMLDivElement>(null);

	// Merge action registry
	const actions = [...DEFAULT_ACTIONS];
	for (const extra of extraActions) {
		const idx = actions.findIndex((a) => a.id === extra.id);
		if (idx >= 0) actions[idx] = extra;
		else actions.push(extra);
	}

	// Track selection changes and compute float position
	useEffect(() => {
		const handleSelectionUpdate = () => {
			const { selection } = editor.state;
			if (
				selection.empty ||
				selection.to - selection.from < 2 ||
				editor.isActive("codeBlock") ||
				SuggestionController.detectActiveSuggestion(editor)
			) {
				setVisible(false);
				return;
			}
			const { view } = editor;
			const start = view.coordsAtPos(selection.from);
			const end = view.coordsAtPos(selection.to);
			const panelH = panelRef.current?.offsetHeight ?? 40;
			const panelW = panelRef.current?.offsetWidth ?? 340;

			// Position above selection; if space above is too tight, place below selection
			const fitsAbove = start.top - panelH - 8 >= 8;
			const top = fitsAbove
				? Math.max(8, start.top - panelH - 8)
				: Math.min(window.innerHeight - panelH - 8, end.bottom + 8);

			const left = Math.max(
				8,
				Math.min(start.left, window.innerWidth - panelW - 8),
			);
			setPos({ top, left });
			setVisible(true);
		};

		const handleBlur = () => {
			// Small delay so clicks on the panel itself aren't swallowed
			setTimeout(() => {
				if (!panelRef.current?.matches(":hover")) {
					setVisible(false);
				}
			}, 150);
		};

		editor.on("selectionUpdate", handleSelectionUpdate);
		editor.on("blur", handleBlur);

		return () => {
			editor.off("selectionUpdate", handleSelectionUpdate);
			editor.off("blur", handleBlur);
		};
	}, [editor]);

	// AI action handlers: Stream directly into editor with fine-grained diff
	const handleAction = useCallback(
		async (action: AiBarAction) => {
			const { from, to } = editor.state.selection;
			const selection = editor.state.doc.textBetween(from, to, " ");
			if (!selection.trim()) return;

			// Fallback if custom onGenerate is provided
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
				return;
			}

			// Stream directly into editor
			setVisible(false);
			setState("idle");

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
				const coords = SuggestionController.getFloatingCoordinates(
					editor,
					suggestionId,
				);
				if (coords) setSuggestionPos(coords);
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
							const coords = SuggestionController.getFloatingCoordinates(
								editor,
								suggestionId,
							);
							if (coords) setSuggestionPos(coords);
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
								const coords = SuggestionController.getFloatingCoordinates(
									editor,
									suggestionId,
								);
								if (coords) setSuggestionPos(coords);
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
					console.warn("[AiBubbleMenu] Streaming error:", err);
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
		},
		[editor, onGenerate, onBeforeApply],
	);

	const handleStopStreaming = useCallback(() => {
		if (abortControllerRef.current) {
			abortControllerRef.current.abort();
			abortControllerRef.current = null;
		}
		setIsStreaming(false);
	}, []);

	const handleReviewDiff = useCallback(async () => {
		if (!result) return;
		await onBeforeApply?.();
		const { from, to } = editor.state.selection;
		const selection = editor.state.doc.textBetween(from, to, " ");
		const suggestion = SuggestionController.applyFineDiff(
			editor,
			{ from, to },
			selection,
			result,
		);
		if (suggestion) {
			setActiveSuggestion(suggestion);
			const coords = SuggestionController.getFloatingCoordinates(
				editor,
				suggestion.id,
			);
			if (coords) setSuggestionPos(coords);
		}
		setVisible(false);
		setState("idle");
		setResult("");
	}, [editor, result, onBeforeApply]);

	const handleAcceptSuggestion = useCallback(() => {
		if (!activeSuggestion) return;
		try {
			SuggestionController.accept(editor, activeSuggestion.id);
		} catch (err) {
			console.error("[AiBubbleMenu] Failed to accept suggestion:", err);
			toast.danger("采纳建议失败");
		} finally {
			setActiveSuggestion(null);
		}
	}, [editor, activeSuggestion]);

	const handleRejectSuggestion = useCallback(() => {
		if (!activeSuggestion) return;
		try {
			SuggestionController.reject(editor, activeSuggestion.id);
		} catch (err) {
			console.error("[AiBubbleMenu] Failed to reject suggestion:", err);
			toast.danger("丢弃建议失败");
		} finally {
			setActiveSuggestion(null);
		}
	}, [editor, activeSuggestion]);

	// Automatically synchronize active suggestion state with document content (handles Undo/Redo!)
	useEffect(() => {
		const syncSuggestionState = () => {
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
				const coords = SuggestionController.getFloatingCoordinates(
					editor,
					detected.id,
				);
				if (coords) setSuggestionPos(coords);
			}
		};

		syncSuggestionState();

		editor.on("transaction", syncSuggestionState);
		return () => {
			editor.off("transaction", syncSuggestionState);
		};
	}, [editor]);

	// Update floating review bar coordinates on scroll or resize
	useEffect(() => {
		if (!activeSuggestion) return;
		const updateCoord = () => {
			const coords = SuggestionController.getFloatingCoordinates(
				editor,
				activeSuggestion.id,
			);
			if (coords) {
				setSuggestionPos(coords);
			}
		};
		window.addEventListener("scroll", updateCoord, true);
		window.addEventListener("resize", updateCoord);
		return () => {
			window.removeEventListener("scroll", updateCoord, true);
			window.removeEventListener("resize", updateCoord);
		};
	}, [activeSuggestion, editor]);

	const handleReplace = useCallback(async () => {
		if (!result) return;
		await onBeforeApply?.();
		const { from, to } = editor.state.selection;
		editor.chain().focus().insertContentAt({ from, to }, result).run();
		setVisible(false);
		setState("idle");
		setResult("");
	}, [editor, result, onBeforeApply]);

	const handleInsertAfter = useCallback(async () => {
		if (!result) return;
		await onBeforeApply?.();
		const to = editor.state.selection.to;
		editor.chain().focus().insertContentAt(to, `\n${result}`).run();
		setVisible(false);
		setState("idle");
		setResult("");
	}, [editor, result, onBeforeApply]);

	const handleCopy = useCallback(async () => {
		if (!result) return;
		await navigator.clipboard.writeText(result);
		setVisible(false);
		setState("idle");
		setResult("");
	}, [result]);

	const handleClose = useCallback(() => {
		setVisible(false);
		setState("idle");
		setResult("");
		setActiveAction(null);
	}, []);

	const isDropdownDropUp = pos.top > window.innerHeight - 280;

	const panel = visible ? (
		<section
			ref={panelRef}
			aria-label="选中文本浮动菜单"
			style={{
				position: "fixed",
				top: pos.top,
				left: pos.left,
				zIndex: 9999,
			}}
			className="flex flex-col bg-surface/98 backdrop-blur-md border border-border/80 rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] ring-1 ring-black/5 dark:ring-white/10 text-xs select-none"
			// Prevent editor from losing focus when clicking toolbar buttons
			onMouseDown={(e) => e.preventDefault()}
		>
			{/* Format tools + AI Quick Rewrite entrance */}
			{state === "idle" && (
				<div className="flex items-center gap-0.5 px-1.5 py-1">
					<InlineFormatGroup editor={editor} />
					<div className="w-px h-4 bg-border mx-1 shrink-0" />
					<AiRewriteDropdown
						actions={actions}
						onSelectAction={(action) => void handleAction(action)}
						isDropUp={isDropdownDropUp}
					/>
				</div>
			)}

			{/* Loading & Result state panel */}
			{state !== "idle" && (
				<AiResultPanel
					state={state}
					result={result}
					activeAction={activeAction}
					onReplace={() => void handleReplace()}
					onReviewDiff={() => void handleReviewDiff()}
					onInsertAfter={() => void handleInsertAfter()}
					onCopy={() => void handleCopy()}
					onClose={handleClose}
				/>
			)}
		</section>
	) : null;

	return (
		<>
			{panel && createPortal(panel, document.body)}
			<AiSuggestionReviewBar
				visible={Boolean(activeSuggestion) && !isPipelineRunning}
				position={suggestionPos}
				isStreaming={isStreaming}
				onAccept={handleAcceptSuggestion}
				onReject={handleRejectSuggestion}
				onStopStreaming={handleStopStreaming}
				onClose={() => setActiveSuggestion(null)}
			/>
		</>
	);
}
