import type { Editor } from "@tiptap/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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

	// ── Selection change → show / hide bubble ───────────────────
	useEffect(() => {
		const handleSelectionUpdate = () => {
			// Do not interrupt active streaming
			if (ai.isStreaming) {
				return;
			}

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
		};

		const handleBlur = () => {
			// Do not hide if currently executing or displaying AI result
			if (ai.state !== "idle") {
				return;
			}

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
	}, [editor, refreshPos, ai.state, ai.isStreaming, ai.resetVisibility]);

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
					<div className="flex items-center gap-0.5 px-2 py-1 border-b border-border/50 bg-surface/40">
						<InlineFormatGroup editor={editor} isDropUp={isDropdownDropUp} />
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
