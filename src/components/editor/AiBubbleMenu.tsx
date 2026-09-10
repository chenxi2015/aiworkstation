import type { Editor } from "@tiptap/core";
import {
	AlignLeft,
	ArrowDownToLine,
	CheckCircle2,
	ChevronDown,
	Copy,
	Languages,
	Loader2,
	RefreshCw,
	Scissors,
	Sparkles,
	Type,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// ---------- Action registry ----------

export interface AiBarAction {
	id: string;
	label: string;
	icon: typeof Sparkles;
	/** Prompt template; {selection} is replaced with selected text */
	prompt: string;
}

const DEFAULT_ACTIONS: AiBarAction[] = [
	{
		id: "polish",
		label: "润色",
		icon: Sparkles,
		prompt: "请润色以下文本，使其更流畅自然，保持原意：\n\n{selection}",
	},
	{
		id: "expand",
		label: "扩写",
		icon: ArrowDownToLine,
		prompt: "请扩写以下文本，充实内容和细节，维持风格一致：\n\n{selection}",
	},
	{
		id: "shorten",
		label: "缩写",
		icon: Scissors,
		prompt:
			"请将以下文本压缩至原长度的 1/3~1/2，保留核心信息，去掉冗余：\n\n{selection}",
	},
	{
		id: "translate",
		label: "翻译",
		icon: Languages,
		prompt:
			"请将以下文本翻译成英文（如原文是英文则翻译成中文）：\n\n{selection}",
	},
	{
		id: "media_style",
		label: "自媒体风格",
		icon: RefreshCw,
		prompt:
			"请将以下文本改写成适合自媒体传播的风格（轻松活泼、有共鸣感）：\n\n{selection}",
	},
	{
		id: "formal_style",
		label: "公文风格",
		icon: Type,
		prompt:
			"请将以下文本改写成正式公文风格（简洁严谨、措辞规范）：\n\n{selection}",
	},
	{
		id: "summarize",
		label: "生成摘要",
		icon: AlignLeft,
		prompt: "请为以下文本生成一段 2~3 句话的精炼摘要：\n\n{selection}",
	},
];

// ---------- Props ----------

export interface AiBubbleMenuProps {
	editor: Editor;
	/** Called before AI writes back to editor (caller should take a version snapshot) */
	onBeforeApply?: () => Promise<void>;
	/** Override or extend action list */
	extraActions?: AiBarAction[];
	/** Server function for AI text generation */
	onGenerate?: (prompt: string) => Promise<string>;
}

type ActionState = "idle" | "loading" | "result" | "error";

interface FloatPos {
	top: number;
	left: number;
}

// ---------- Component ----------

/**
 * AI floating action bar (docs/editor-plan.md Editor-β §6.1).
 * Custom floating panel based on ProseMirror selection coordinates.
 * No external bubble-menu package required.
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
	const [expanded, setExpanded] = useState(false);
	const panelRef = useRef<HTMLDivElement>(null);

	// Merge action registry
	const actions = [...DEFAULT_ACTIONS];
	for (const extra of extraActions) {
		const idx = actions.findIndex((a) => a.id === extra.id);
		if (idx >= 0) actions[idx] = extra;
		else actions.push(extra);
	}
	const visibleActions = expanded ? actions : actions.slice(0, 5);

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
			const panelH = panelRef.current?.offsetHeight ?? 44;
			const panelW = panelRef.current?.offsetWidth ?? 320;

			// Position above selection start; clamp to viewport
			const top = start.top + window.scrollY - panelH - 8;
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
		setExpanded(false);
	}, []);

	if (!visible) return null;

	const panel = (
		<section
			ref={panelRef}
			aria-label="AI 浮层菜单"
			style={{
				position: "fixed",
				top: pos.top,
				left: pos.left,
				zIndex: 9999,
				minWidth: 320,
				maxWidth: 520,
			}}
			className="flex flex-col bg-surface border border-border rounded-xl shadow-xl overflow-hidden text-xs"
			// Prevent editor from losing focus when clicking panel buttons
			onMouseDown={(e) => e.preventDefault()}
		>
			{/* Action buttons row */}
			{state === "idle" && (
				<div className="flex items-center gap-0.5 px-1.5 py-1.5 flex-wrap">
					<Sparkles className="w-3.5 h-3.5 text-accent/70 shrink-0 mr-0.5" />
					{visibleActions.map((action) => (
						<button
							key={action.id}
							type="button"
							onClick={() => void handleAction(action)}
							className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] text-muted hover:text-foreground hover:bg-accent/10 transition-colors cursor-pointer whitespace-nowrap"
						>
							<action.icon className="w-3 h-3" />
							{action.label}
						</button>
					))}
					{actions.length > 5 && (
						<button
							type="button"
							onClick={() => setExpanded((v) => !v)}
							className="flex items-center gap-0.5 px-2 py-1 rounded-lg text-[11px] text-muted hover:text-foreground hover:bg-muted/10 transition-colors cursor-pointer"
						>
							<ChevronDown
								className={`w-3 h-3 transition-transform ${expanded ? "rotate-180" : ""}`}
							/>
							{expanded ? "收起" : `+${actions.length - 5}`}
						</button>
					)}
				</div>
			)}

			{/* Loading state */}
			{state === "loading" && (
				<div className="flex items-center gap-2 px-3 py-2 text-muted">
					<Loader2 className="w-3.5 h-3.5 animate-spin" />
					<span>{activeAction?.label}中…</span>
					<button
						type="button"
						onClick={handleClose}
						className="ml-auto text-muted/70 hover:text-foreground cursor-pointer"
					>
						取消
					</button>
				</div>
			)}

			{/* Result / error state */}
			{(state === "result" || state === "error") && (
				<>
					<div
						className={`px-3 py-2 max-h-40 overflow-y-auto whitespace-pre-wrap leading-relaxed ${state === "error" ? "text-danger" : "text-foreground"}`}
					>
						{result}
					</div>
					<div className="flex items-center gap-1 px-2 py-1.5 border-t border-border bg-surface/60">
						{state === "result" && (
							<>
								<button
									type="button"
									onClick={() => void handleReplace()}
									className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-accent text-accent-foreground text-[11px] font-medium hover:opacity-90 transition-opacity cursor-pointer"
								>
									<CheckCircle2 className="w-3 h-3" />
									替换选区
								</button>
								<button
									type="button"
									onClick={() => void handleInsertAfter()}
									className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] text-muted hover:text-foreground hover:bg-muted/10 transition-colors cursor-pointer"
								>
									<ArrowDownToLine className="w-3 h-3" />
									插入下方
								</button>
								<button
									type="button"
									onClick={() => void handleCopy()}
									className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] text-muted hover:text-foreground hover:bg-muted/10 transition-colors cursor-pointer"
								>
									<Copy className="w-3 h-3" />
									复制
								</button>
							</>
						)}
						<button
							type="button"
							onClick={handleClose}
							className="ml-auto px-2 py-1 text-[11px] text-muted/70 hover:text-foreground cursor-pointer"
						>
							关闭
						</button>
					</div>
				</>
			)}
		</section>
	);

	return createPortal(panel, document.body);
}
