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
		panelWidth: 396,
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
	const diffBarRef = useRef<HTMLDivElement>(null);
	const diffPosRef = useRef({ top: 0, left: 0 });

	const calculateDiffCoords = useCallback(() => {
		if (!view || !activeDiff) return null;
		const maxPos = view.state.doc.length;
		const from = Math.min(Math.max(0, activeDiff.from), maxPos);
		const to = Math.min(Math.max(0, activeDiff.to), maxPos);

		// 检查 diff 区域是否完全滑出 CodeMirror 可视视口
		if (to < view.viewport.from || from > view.viewport.to) {
			return { visible: false, top: 0, left: 0 };
		}

		// 获取可视范围内最底部的安全坐标（防止末尾在视口外导致 coordsAtPos 返回 null）
		const clampedTo = Math.min(to, view.viewport.to);
		const end = view.coordsAtPos(clampedTo);
		if (!end) return null;

		const containerRect = view.scrollDOM.getBoundingClientRect();
		const boundaryBottom =
			Math.min(window.innerHeight, containerRect.bottom) - 56;
		const boundaryTop = Math.max(8, containerRect.top + 8);

		// 如果建议的最底部已经滚出可视区域顶部上方，则隐藏
		if (end.bottom < boundaryTop) {
			return { visible: false, top: 0, left: 0 };
		}

		// 水平居中：严格居中于正文内容列（.cm-content）的几何中轴线上
		const contentEl = view.contentDOM ?? view.dom;
		const contentRect = contentEl.getBoundingClientRect();
		const centerX = (contentRect.left + contentRect.right) / 2;
		const left = Math.max(120, Math.min(centerX, window.innerWidth - 120));

		// 垂直位置：紧贴 diff 内容末尾正下方，每像素 1:1 同步跟随滚动
		let top = end.bottom + 12;
		// 若长建议末尾尚未滚入视口，则平稳停留在可视底部安全区，方便随时操作
		if (top > boundaryBottom) {
			top = boundaryBottom;
		}

		return { visible: true, top, left };
	}, [view, activeDiff]);

	const applyDiffCoords = useCallback(
		(coords: { visible: boolean; top: number; left: number }, syncState = true) => {
			if (diffBarRef.current) {
				if (!coords.visible) {
					diffBarRef.current.style.display = "none";
					return;
				}
				diffBarRef.current.style.display = "";
				diffBarRef.current.style.top = `${coords.top}px`;
				diffBarRef.current.style.left = `${coords.left}px`;
			}

			if (syncState && coords.visible) {
				if (
					diffPosRef.current.top !== coords.top ||
					diffPosRef.current.left !== coords.left
				) {
					diffPosRef.current = { top: coords.top, left: coords.left };
					setDiffPos({ top: coords.top, left: coords.left });
				}
			}
		},
		[],
	);

	const updateDiffPosition = useCallback(
		(syncState = true) => {
			const coords = calculateDiffCoords();
			if (coords) {
				applyDiffCoords(coords, syncState);
			}
		},
		[calculateDiffCoords, applyDiffCoords],
	);

	useEffect(() => {
		if (!view || !activeDiff) return;

		// 激活时立即同步计算位置
		updateDiffPosition(true);

		let rafId = 0;
		const handleScroll = () => {
			// 1. 同步直接修改 DOM style，0 帧延迟即时跟随滑动
			const coords = calculateDiffCoords();
			if (coords) {
				applyDiffCoords(coords, false);
			}

			// 2. rAF 节流同步 React state，避免高频滚动产生大量 re-render
			if (!rafId) {
				rafId = requestAnimationFrame(() => {
					rafId = 0;
					if (coords && coords.visible) {
						if (
							diffPosRef.current.top !== coords.top ||
							diffPosRef.current.left !== coords.left
						) {
							diffPosRef.current = { top: coords.top, left: coords.left };
							setDiffPos({ top: coords.top, left: coords.left });
						}
					}
				});
			}
		};

		// 核心：直接监听 CodeMirror 实际滚动容器 view.scrollDOM，毫秒级响应每次滚动位移
		const scrollDom = view.scrollDOM;
		scrollDom?.addEventListener("scroll", handleScroll, { passive: true });
		window.addEventListener("scroll", handleScroll, true);
		window.addEventListener("resize", handleScroll);
		return () => {
			scrollDom?.removeEventListener("scroll", handleScroll);
			window.removeEventListener("scroll", handleScroll, true);
			window.removeEventListener("resize", handleScroll);
			if (rafId) cancelAnimationFrame(rafId);
		};
	}, [view, activeDiff, calculateDiffCoords, applyDiffCoords, updateDiffPosition]);

	// ── Listen for selection changes to show/hide floating menu ───
	useEffect(() => {
		if (!view) return;

		const handleSelection = () => {
			if (!view || state !== "idle" || activeDiffRef.current != null) return;
			const sel = view.state.selection.main;
			if (sel.empty || sel.to - sel.from < 2) {
				setVisible(false);
				return;
			}
			setVisible(true);
			refresh();
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

	const handleRejectDiffRef = useRef<() => void>(() => {});

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
					handleRejectDiffRef.current();
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
	handleRejectDiffRef.current = handleRejectDiff;

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
						className="flex flex-col bg-surface/98 dark:bg-surface/95 backdrop-blur-xl border border-border/80 rounded-2xl shadow-[0_16px_40px_-8px_rgba(0,0,0,0.16),0_4px_16px_-2px_rgba(0,0,0,0.06)] ring-1 ring-black/[0.04] dark:ring-white/[0.08] text-xs select-none overflow-hidden transition-[opacity,box-shadow] duration-150"
						onMouseDown={(e) => e.preventDefault()}
					>
						{state === "idle" && visible && (
							<div className="flex flex-col w-[396px]">
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
				barRef={diffBarRef}
				visible={activeDiff != null}
				position={diffPos}
				onAccept={handleAcceptDiff}
				onReject={handleRejectDiff}
				onClose={handleRejectDiff}
			/>
		</>
	);
}
