import type { Editor } from "@tiptap/core";
import { Sparkles } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAddToAiChat } from "../workbench/ai/chat/utils/chatContextHelpers";
import { AiCustomPromptInput } from "./components/bubble/AiCustomPromptInput";
import { AiPresetActionList } from "./components/bubble/AiPresetActionList";
import { AiResultPanel } from "./components/bubble/AiResultPanel";
import { AiSuggestionReviewBar } from "./components/bubble/AiSuggestionReviewBar";
import { InlineFormatGroup } from "./components/bubble/InlineFormatGroup";
import { type AiBarAction, DEFAULT_ACTIONS } from "./components/bubble/types";
import { useAiStreamAction } from "./hooks/useAiStreamAction";
import { useFloatingPosition } from "./hooks/useFloatingPosition";
import { SuggestionController } from "./utils/suggestionController";

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
	/** Distance/margin from the bottom of viewport or scroll container (default 56 to clear EditorActionBar) */
	bottom?: number;
}

/**
 * Floating selection action bar:
 * Top: inline formatting tools. Middle: free-form AI instruction input.
 * Bottom: preset AI rewrite capabilities.
 */
export function AiBubbleMenu({
	editor,
	onBeforeApply,
	extraActions = [],
	onGenerate,
	isPipelineRunning = false,
	bottom = 56,
}: AiBubbleMenuProps) {
	const [visible, setVisible] = useState(false);
	const panelRef = useRef<HTMLDivElement>(null);
	const reviewBarRef = useRef<HTMLDivElement>(null);

	// ── Merged action registry ──────────────────────────────────
	const actions = [...DEFAULT_ACTIONS];
	for (const extra of extraActions) {
		const idx = actions.findIndex((a) => a.id === extra.id);
		if (idx >= 0) actions[idx] = extra;
		else actions.push(extra);
	}

	// ── AI action state & handlers ──────────────────────────────
	const ai = useAiStreamAction({
		editor,
		onBeforeApply,
		onGenerate,
		suggestionBarRef: reviewBarRef,
	});

	// ── Floating position (rAF-throttled, cached scrollEl) ──────
	const {
		pos,
		anchorVisible,
		refresh: refreshPos,
	} = useFloatingPosition({
		editor,
		enabled: visible || ai.state !== "idle",
		panelRef,
		anchorRange: ai.state !== "idle" ? ai.targetRange : null,
		bottom,
		panelWidth: 396,
		panelHeight: 260,
	});

	// ── Listen for mouseup / keyup on editor to show/hide floating menu ───
	// Aligns 1:1 with MarkdownAiBubbleMenu in notes: displays on release, not during drag selection
	const isMouseDownInsideRef = useRef(false);

	useEffect(() => {
		const editorDom = editor.view?.dom;
		if (!editorDom) return;

		let rafId: number | null = null;

		const handleSelection = () => {
			if (rafId) cancelAnimationFrame(rafId);
			rafId = requestAnimationFrame(() => {
				if (editor.isDestroyed || ai.isStreaming) return;

				const { selection } = editor.state;
				if (
					selection.empty ||
					selection.to - selection.from < 2 ||
					editor.isActive("codeBlock") ||
					SuggestionController.detectActiveSuggestion(editor)
				) {
					if (ai.state === "idle") {
						setVisible(false);
					}
					return;
				}

				// If previous AI generation completed and user selected a new text region, reset to idle
				if (ai.state !== "idle") {
					ai.resetVisibility();
				}

				refreshPos();
				setVisible(true);
			});
		};

		const handleMouseDown = () => {
			isMouseDownInsideRef.current = true;
		};

		const handleWindowMouseUp = () => {
			if (isMouseDownInsideRef.current) {
				isMouseDownInsideRef.current = false;
				handleSelection();
			}
		};

		const handleBlur = () => {
			if (ai.state !== "idle" || ai.activeSuggestion != null) return;
			setTimeout(() => {
				if (!panelRef.current?.matches(":hover")) {
					setVisible(false);
				}
			}, 150);
		};

		const handleDragStart = () => {
			setVisible(false);
		};

		editorDom.addEventListener("mousedown", handleMouseDown);
		editorDom.addEventListener("mouseup", handleSelection);
		editorDom.addEventListener("keyup", handleSelection);
		editorDom.addEventListener("focusout", handleBlur);
		editorDom.addEventListener("dragstart", handleDragStart);
		window.addEventListener("mouseup", handleWindowMouseUp);

		return () => {
			if (rafId) cancelAnimationFrame(rafId);
			editorDom.removeEventListener("mousedown", handleMouseDown);
			editorDom.removeEventListener("mouseup", handleSelection);
			editorDom.removeEventListener("keyup", handleSelection);
			editorDom.removeEventListener("focusout", handleBlur);
			editorDom.removeEventListener("dragstart", handleDragStart);
			window.removeEventListener("mouseup", handleWindowMouseUp);
		};
	}, [
		editor,
		refreshPos,
		ai.state,
		ai.isStreaming,
		ai.activeSuggestion,
		ai.resetVisibility,
	]);

	// ── Close floating bubble or reset when clicking outside or pressing Escape ──
	useEffect(() => {
		if (!visible && ai.state === "idle" && !ai.activeSuggestion) return;

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
			if (ai.state === "idle" && !ai.activeSuggestion) {
				setVisible(false);
			}
		};

		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				if (ai.activeSuggestion) {
					ai.handleRejectSuggestion();
				} else if (ai.state !== "idle") {
					ai.handleClose();
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
	}, [
		visible,
		ai.state,
		ai.activeSuggestion,
		ai.handleRejectSuggestion,
		ai.handleClose,
	]);

	// ── Wrap handleAction to hide bubble when streaming starts ──
	const onAction = useCallback(
		async (action: AiBarAction) => {
			const didStream = await ai.handleAction(action);
			if (didStream) setVisible(false);
		},
		[ai.handleAction],
	);

	const handleReviewDiffAndHide = useCallback(async () => {
		await ai.handleReviewDiff();
		setVisible(false);
	}, [ai.handleReviewDiff]);

	const handleReplaceAndHide = useCallback(async () => {
		await ai.handleReplace();
		setVisible(false);
	}, [ai.handleReplace]);

	const handleInsertAfterAndHide = useCallback(async () => {
		await ai.handleInsertAfter();
		setVisible(false);
	}, [ai.handleInsertAfter]);

	const handleCopy = useCallback(async () => {
		await ai.handleCopy();
	}, [ai.handleCopy]);

	const { addSelectionToAi } = useAddToAiChat();

	const handleSendSelectionToChat = useCallback(() => {
		const { from, to } = editor.state.selection;
		const selectedText = editor.state.doc.textBetween(from, to, "\n");
		if (!selectedText.trim()) return;
		addSelectionToAi(selectedText);
		setVisible(false);
	}, [editor, addSelectionToAi]);

	const handleCloseAndHide = useCallback(() => {
		ai.handleClose();
		setVisible(false);
	}, [ai.handleClose]);

	// ── Render ───────────────────────────────────────────────────
	const isDropdownDropUp = pos.top > window.innerHeight - 280;

	// Hide when selection scrolls out of viewport
	const shouldShow = (visible || ai.state !== "idle") && anchorVisible;

	const panel = shouldShow ? (
		<section
			ref={panelRef}
			aria-label="选中文本浮动菜单"
			style={{
				position: "fixed",
				top: pos.top,
				left: pos.left,
				// Below the document header / toolbar / bottom action bar (z-50)
				// so the panel slides under them instead of covering them
				zIndex: 40,
			}}
			className="flex flex-col bg-surface/98 dark:bg-surface/95 backdrop-blur-xl border border-border/80 rounded-2xl shadow-[0_16px_40px_-8px_rgba(0,0,0,0.16),0_4px_16px_-2px_rgba(0,0,0,0.06)] ring-1 ring-black/[0.04] dark:ring-white/[0.08] text-xs select-none overflow-hidden transition-[opacity,box-shadow] duration-150"
			// Prevent editor from losing focus when clicking toolbar buttons
			onMouseDown={(e) => e.preventDefault()}
		>
			{/* Top: format tools / Middle: custom AI instruction / Bottom: preset tags */}
			{ai.state === "idle" && (
				<div className="flex flex-col w-[396px]">
					<div className="flex items-center justify-between gap-1 px-2 py-1 border-b border-border/50 bg-surface/40">
						<InlineFormatGroup editor={editor} isDropUp={isDropdownDropUp} />
						<button
							type="button"
							title="将选中文本添加到 AI 对话"
							aria-label="添加到AI对话"
							onClick={handleSendSelectionToChat}
							className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium text-accent hover:bg-accent/10 active:scale-95 transition-all cursor-pointer shrink-0"
						>
							<Sparkles className="w-3.5 h-3.5" />
							<span>到AI对话</span>
						</button>
					</div>
					<AiCustomPromptInput onSubmit={ai.handleCustomInstruction} />
					<AiPresetActionList
						actions={actions}
						onSelectAction={(action) => void onAction(action)}
					/>
				</div>
			)}

			{/* Loading & Result state panel */}
			{ai.state !== "idle" && (
				<AiResultPanel
					state={ai.state}
					result={ai.result}
					activeAction={ai.activeAction}
					onReplace={() => void handleReplaceAndHide()}
					onReviewDiff={() => void handleReviewDiffAndHide()}
					onInsertAfter={() => void handleInsertAfterAndHide()}
					onCopy={() => void handleCopy()}
					onClose={handleCloseAndHide}
				/>
			)}
		</section>
	) : null;

	return (
		<>
			{panel && createPortal(panel, document.body)}
			<AiSuggestionReviewBar
				barRef={reviewBarRef}
				visible={Boolean(ai.activeSuggestion) && !isPipelineRunning}
				position={ai.suggestionPos}
				onAccept={ai.handleAcceptSuggestion}
				onReject={ai.handleRejectSuggestion}
				onStopStreaming={ai.handleStopStreaming}
				onClose={() => ai.handleRejectSuggestion()}
			/>
		</>
	);
}
