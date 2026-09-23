import type { EditorView } from "@codemirror/view";
import { toast } from "@heroui/react";
import { Sparkles } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
	type ActionState,
	type AiBarAction,
	buildCustomInstructionPrompt,
	DEFAULT_ACTIONS,
} from "../../ai/selectionActions";
import { AiCustomPromptInput } from "../../editor/components/bubble/AiCustomPromptInput";
import { AiPresetActionList } from "../../editor/components/bubble/AiPresetActionList";
import { AiResultPanel } from "../../editor/components/bubble/AiResultPanel";
import { AiSuggestionReviewBar } from "../../editor/components/bubble/AiSuggestionReviewBar";
import {
	type AiDiffSuggestionPayload,
	setAiDiffSuggestion,
	setAiSelectionHighlight,
} from "./cmAiHighlightExtension";
import { useCmFloatingPosition } from "./useCmFloatingPosition";

export interface MarkdownAiBubbleMenuProps {
	/** CodeMirror instance from markdown editor */
	view: EditorView | null;
	/** AI text generation function */
	onGenerate: (prompt: string) => Promise<string>;
	/** Optional extra/override actions */
	extraActions?: AiBarAction[];
}

interface TargetRange {
	from: number;
	to: number;
	text: string;
}

interface ActiveDiffState {
	from: number;
	to: number;
	oldText: string;
	newText: string;
}

/**
 * Markdown selection AI floating bar (CodeMirror version):
 * Aligns 1:1 with creation module (AiBubbleMenu):
 * 1. Persistent selection highlight with underline when action is running or results are displayed
 * 2. Result panel with Diff review, direct replace, insert after, and copy
 * 3. In-editor fine-grained diff preview with Accept/Reject toolbar
 */
export function MarkdownAiBubbleMenu({
	view,
	onGenerate,
	extraActions = [],
}: MarkdownAiBubbleMenuProps) {
	const [visible, setVisible] = useState(false);
	const [state, setState] = useState<ActionState>("idle");
	const [result, setResult] = useState("");
	const [activeAction, setActiveAction] = useState<AiBarAction | null>(null);
	const [activeDiff, setActiveDiff] = useState<ActiveDiffState | null>(null);
	const [diffPos, setDiffPos] = useState({ top: 0, left: 0 });

	const panelRef = useRef<HTMLElement>(null);
	const targetRef = useRef<TargetRange | null>(null);
	const activeDiffRef = useRef<ActiveDiffState | null>(null);
	activeDiffRef.current = activeDiff;

	const actions = (() => {
		const merged = [...DEFAULT_ACTIONS];
		for (const extra of extraActions) {
			const idx = merged.findIndex((a) => a.id === extra.id);
			if (idx >= 0) merged[idx] = extra;
			else merged.push(extra);
		}
		return merged;
	})();

	// ── Visual decoration helpers ────────────────────────────────
	const setVisualHighlight = useCallback(
		(range: { from: number; to: number } | null) => {
			if (!view) return;
			view.dispatch({
				effects: setAiSelectionHighlight.of(range),
			});
		},
		[view],
	);

	const setDiffDecoration = useCallback(
		(payload: AiDiffSuggestionPayload | null) => {
			if (!view) return;
			view.dispatch({
				effects: setAiDiffSuggestion.of(payload),
			});
		},
		[view],
	);

	// ── Floating position for Bubble Panel ───────────────────────
	const shouldShow = !!view && !activeDiff && (visible || state !== "idle");
	const { pos, anchorVisible, refresh } = useCmFloatingPosition({
		view,
		enabled: shouldShow,
		panelRef,
		anchorRange: state !== "idle" ? targetRef.current : null,
		panelWidth: 390,
		panelHeight: 260,
	});

	// Reset all states and clear visual decorations
	const reset = useCallback(() => {
		setVisualHighlight(null);
		setDiffDecoration(null);
		setActiveDiff(null);
		setState("idle");
		setResult("");
		setActiveAction(null);
		targetRef.current = null;
		setVisible(false);
	}, [setVisualHighlight, setDiffDecoration]);

	// Clean up decorations on unmount or view change
	useEffect(() => {
		return () => {
			if (view) {
				view.dispatch({
					effects: [
						setAiSelectionHighlight.of(null),
						setAiDiffSuggestion.of(null),
					],
				});
			}
		};
	}, [view]);

	// ── Diff review toolbar positioning ──────────────────────────
	const updateDiffPosition = useCallback(() => {
		if (!view || !activeDiff) return;
		const maxPos = view.state.doc.length;
		const from = Math.min(Math.max(0, activeDiff.from), maxPos);
		const to = Math.min(Math.max(0, activeDiff.to), maxPos);
		const start = view.coordsAtPos(from);
		const end = view.coordsAtPos(to);
		if (!start || !end) return;

		const centerX = (start.left + end.right) / 2;
		let topY = end.bottom + 12;
		if (topY > window.innerHeight - 80) {
			topY = Math.max(12, start.top - 48);
		}
		setDiffPos({
			top: topY,
			left: Math.max(120, Math.min(centerX, window.innerWidth - 120)),
		});
	}, [view, activeDiff]);

	useEffect(() => {
		if (!activeDiff) return;
		updateDiffPosition();
		const handleScrollOrResize = () => updateDiffPosition();
		window.addEventListener("resize", handleScrollOrResize, { passive: true });
		window.addEventListener("scroll", handleScrollOrResize, {
			passive: true,
			capture: true,
		});
		return () => {
			window.removeEventListener("resize", handleScrollOrResize);
			window.removeEventListener("scroll", handleScrollOrResize, true);
		};
	}, [activeDiff, updateDiffPosition]);

	// ── Listen for selection changes to show/hide floating menu ───
	useEffect(() => {
		if (!view) return;

		const handleSelection = () => {
			if (state !== "idle" || activeDiffRef.current != null) return;
			requestAnimationFrame(() => {
				if (!view || activeDiffRef.current != null) return;
				const sel = view.state.selection.main;
				if (sel.empty || sel.to - sel.from < 2) {
					setVisible(false);
					return;
				}
				setVisible(true);
				refresh();
			});
		};

		const handleBlur = () => {
			if (state !== "idle" || activeDiff != null) return;
			setTimeout(() => {
				if (!panelRef.current?.matches(":hover")) {
					setVisible(false);
				}
			}, 150);
		};

		view.dom.addEventListener("mouseup", handleSelection);
		view.dom.addEventListener("keyup", handleSelection);
		view.dom.addEventListener("focusout", handleBlur);
		return () => {
			view.dom.removeEventListener("mouseup", handleSelection);
			view.dom.removeEventListener("keyup", handleSelection);
			view.dom.removeEventListener("focusout", handleBlur);
		};
	}, [view, state, activeDiff, refresh]);

	// ── Close floating bubble or diff when clicking outside or pressing Escape ──
	useEffect(() => {
		if (!visible && state === "idle" && activeDiff == null) return;

		const handlePointerDown = (e: PointerEvent) => {
			const target = e.target as Node | null;
			if (!target) return;
			if (panelRef.current?.contains(target)) return;
			// Ignore if interacting with review toolbar
			if (
				target instanceof HTMLElement &&
				target.closest('[aria-label="AI建议审阅工具栏"]')
			) {
				return;
			}
			if (state === "idle" && !activeDiff) {
				setVisible(false);
			}
		};

		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				if (activeDiff) {
					handleRejectDiff();
				} else if (state !== "idle") {
					reset();
				} else {
					setVisible(false);
				}
			}
		};

		document.addEventListener("pointerdown", handlePointerDown, true);
		window.addEventListener("keydown", handleKeyDown);
		return () => {
			document.removeEventListener("pointerdown", handlePointerDown, true);
			window.removeEventListener("keydown", handleKeyDown);
		};
	}, [visible, state, activeDiff, reset]);

	// ── Action trigger: sets persistent selection highlight ──────
	const runAction = useCallback(
		async (action: AiBarAction) => {
			if (!view || state === "loading") return;
			const sel = view.state.selection.main;
			const text = view.state.sliceDoc(sel.from, sel.to);
			if (!text.trim()) return;

			targetRef.current = { from: sel.from, to: sel.to, text };
			setActiveAction(action);
			setState("loading");
			// Persistent visual highlight with blue underline (matching creation module)
			setVisualHighlight({ from: sel.from, to: sel.to });

			try {
				const prompt = action.prompt.replace("{selection}", text);
				const output = await onGenerate(prompt);
				if (!targetRef.current) return;
				setResult(output);
				setState("result");
			} catch {
				if (!targetRef.current) return;
				setResult("");
				setState("error");
			}
		},
		[view, state, onGenerate, setVisualHighlight],
	);

	const handleCustomInstruction = useCallback(
		(instruction: string) => {
			void runAction({
				id: "custom",
				label: "自定义指令",
				icon: Sparkles,
				prompt: buildCustomInstructionPrompt(instruction),
			});
		},
		[runAction],
	);

	// ── Review Diff action: switches to inline diff review ────────
	const handleReviewDiff = useCallback(() => {
		const target = targetRef.current;
		if (!view || !target || state !== "result" || !result) return;

		const diffData = {
			from: target.from,
			to: target.to,
			oldText: target.text,
			newText: result,
		};
		activeDiffRef.current = diffData;
		setActiveDiff(diffData);

		// Switch from selection highlight to inline diff decoration
		setVisualHighlight(null);
		setDiffDecoration(diffData);

		// Completely hide bubble panel while reviewing diff in document
		setVisible(false);
		setState("idle");
	}, [view, state, result, setVisualHighlight, setDiffDecoration]);

	// ── Accept Diff suggestion ────────────────────────────────────
	const handleAcceptDiff = useCallback(() => {
		if (!view || !activeDiff) return;
		const { from, to, newText } = activeDiff;
		setDiffDecoration(null);
		setActiveDiff(null);

		view.dispatch({
			changes: { from, to, insert: newText },
			selection: { anchor: from + newText.length },
		});
		view.focus();
		toast.success("已采纳建议并更新内容");
		reset();
	}, [view, activeDiff, setDiffDecoration, reset]);

	// ── Reject Diff suggestion: returns to result panel ───────────
	const handleRejectDiff = useCallback(() => {
		if (!view || !activeDiff) return;
		const target = targetRef.current;
		setDiffDecoration(null);
		activeDiffRef.current = null;
		setActiveDiff(null);

		// Losslessly restore the result panel and selection highlight
		if (target && result) {
			setState("result");
			setVisible(true);
			setVisualHighlight({ from: target.from, to: target.to });
		} else {
			reset();
		}
	}, [view, activeDiff, result, setDiffDecoration, setVisualHighlight, reset]);

	// ── Direct replacement & insertion ────────────────────────────
	const applyReplace = useCallback(
		(mode: "replace" | "insertAfter") => {
			const target = targetRef.current;
			if (!view || !target || state !== "result") return;
			if (mode === "replace") {
				view.dispatch({
					changes: { from: target.from, to: target.to, insert: result },
					selection: { anchor: target.from + result.length },
				});
			} else {
				const insert = `\n\n${result}`;
				view.dispatch({
					changes: { from: target.to, insert },
					selection: { anchor: target.to + insert.length },
				});
			}
			view.focus();
			reset();
		},
		[view, state, result, reset],
	);

	const handleCopy = useCallback(async () => {
		try {
			await navigator.clipboard.writeText(result);
		} catch {
			// Clipboard fallback
		}
	}, [result]);

	if ((!shouldShow || !anchorVisible) && !activeDiff) return null;

	const panelStyle: React.CSSProperties = {
		position: "fixed",
		top: pos.top,
		left: pos.left,
		zIndex: 40,
	};

	return (
		<>
			{shouldShow &&
				!activeDiff &&
				anchorVisible &&
				createPortal(
					<section
						ref={panelRef}
						aria-label="选中文本浮动菜单"
						style={panelStyle}
						className="flex flex-col bg-surface/98 backdrop-blur-md border border-border/80 rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] ring-1 ring-black/5 dark:ring-white/10 text-xs select-none"
						onMouseDown={(e) => e.preventDefault()}
					>
						{state === "idle" && visible && (
							<div className="flex flex-col w-[380px]">
								<AiCustomPromptInput onSubmit={handleCustomInstruction} />
								<AiPresetActionList
									actions={actions}
									onSelectAction={(action) => void runAction(action)}
								/>
							</div>
						)}
						{state !== "idle" && (
							<AiResultPanel
								state={state}
								result={result}
								activeAction={activeAction}
								onReviewDiff={handleReviewDiff}
								onReplace={() => applyReplace("replace")}
								onInsertAfter={() => applyReplace("insertAfter")}
								onCopy={() => void handleCopy()}
								onClose={reset}
							/>
						)}
					</section>,
					document.body,
				)}

			{/* Floating review toolbar for inline diff comparison */}
			<AiSuggestionReviewBar
				visible={activeDiff != null}
				position={diffPos}
				onAccept={handleAcceptDiff}
				onReject={handleRejectDiff}
				onClose={handleRejectDiff}
			/>
		</>
	);
}
