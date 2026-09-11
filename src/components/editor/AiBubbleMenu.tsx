import type { Editor } from "@tiptap/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AiResultPanel } from "./components/bubble/AiResultPanel";
import { AiRewriteDropdown } from "./components/bubble/AiRewriteDropdown";
import { InlineFormatGroup } from "./components/bubble/InlineFormatGroup";
import {
	type ActionState,
	type AiBarAction,
	DEFAULT_ACTIONS,
	type FloatPos,
} from "./components/bubble/types";

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
}: AiBubbleMenuProps) {
	const [visible, setVisible] = useState(false);
	const [pos, setPos] = useState<FloatPos>({ top: 0, left: 0 });
	const [state, setState] = useState<ActionState>("idle");
	const [result, setResult] = useState("");
	const [activeAction, setActiveAction] = useState<AiBarAction | null>(null);
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
			if (selection.empty || selection.to - selection.from < 2) {
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

	// AI action handlers
	const handleAction = useCallback(
		async (action: AiBarAction) => {
			const selection = editor.state.doc.textBetween(
				editor.state.selection.from,
				editor.state.selection.to,
				" ",
			);
			if (!selection.trim()) return;

			setState("loading");
			setActiveAction(action);
			setResult("");

			try {
				const prompt = action.prompt.replace("{selection}", selection);
				const generated = await (onGenerate
					? onGenerate(prompt)
					: Promise.resolve(
							"（请先在设置中填入 LLM API Key 才能使用 AI bar）",
						));
				setResult(generated);
				setState("result");
			} catch (err) {
				setResult(err instanceof Error ? err.message : String(err));
				setState("error");
			}
		},
		[editor, onGenerate],
	);

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

	if (!visible) return null;

	const isDropdownDropUp = pos.top > window.innerHeight - 280;

	const panel = (
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
					onInsertAfter={() => void handleInsertAfter()}
					onCopy={() => void handleCopy()}
					onClose={handleClose}
				/>
			)}
		</section>
	);

	return createPortal(panel, document.body);
}
