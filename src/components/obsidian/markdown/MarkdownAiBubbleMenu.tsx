import type { EditorView } from "@codemirror/view";
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

export interface MarkdownAiBubbleMenuProps {
	/** CodeMirror 实例（编辑态挂载后传入） */
	view: EditorView | null;
	/** AI 文本生成（复用创作模块的 generateAiBarText 服务端能力） */
	onGenerate: (prompt: string) => Promise<string>;
	/** 扩展/覆盖动作列表 */
	extraActions?: AiBarAction[];
}

interface TargetRange {
	from: number;
	to: number;
	text: string;
}

/**
 * Markdown 划词 AI 浮层（CodeMirror 版）：
 * 交互与创作模块 AiBubbleMenu 一致 —— 选中文本弹出浮层，
 * 预设动作 / 自定义指令 → AI 生成 → 替换 / 插入后方 / 复制。
 * 直接对 markdown 原文做区间替换，不经过 AST 序列化，零失真。
 */
export function MarkdownAiBubbleMenu({
	view,
	onGenerate,
	extraActions = [],
}: MarkdownAiBubbleMenuProps) {
	const [visible, setVisible] = useState(false);
	const [pos, setPos] = useState<{ top: number; left: number }>({
		top: 0,
		left: 0,
	});
	const [state, setState] = useState<ActionState>("idle");
	const [result, setResult] = useState("");
	const [activeAction, setActiveAction] = useState<AiBarAction | null>(null);
	const panelRef = useRef<HTMLDivElement>(null);
	const targetRef = useRef<TargetRange | null>(null);

	const actions = (() => {
		const merged = [...DEFAULT_ACTIONS];
		for (const extra of extraActions) {
			const idx = merged.findIndex((a) => a.id === extra.id);
			if (idx >= 0) merged[idx] = extra;
			else merged.push(extra);
		}
		return merged;
	})();

	const computePos = useCallback((v: EditorView, from: number, to: number) => {
		const start = v.coordsAtPos(from);
		const end = v.coordsAtPos(to);
		if (!start || !end) return null;
		const panelWidth = 390;
		const panelHeight = 260;
		const left = Math.max(
			8,
			Math.min(start.left, window.innerWidth - panelWidth - 8),
		);
		// 默认放在选区下方；下方空间不足时翻到上方
		let top = end.bottom + 8;
		if (top + panelHeight > window.innerHeight - 8 && start.top > panelHeight) {
			top = start.top - 8;
			return { top, left, above: true };
		}
		return { top, left, above: false };
	}, []);

	const reset = useCallback(() => {
		setState("idle");
		setResult("");
		setActiveAction(null);
		targetRef.current = null;
		setVisible(false);
	}, []);

	// 监听选区变化 → 显示/隐藏浮层
	useEffect(() => {
		if (!view) return;

		const handleSelection = () => {
			// AI 生成中/出结果时不打断
			if (state !== "idle") return;
			const sel = view.state.selection.main;
			if (sel.empty || sel.to - sel.from < 2) {
				setVisible(false);
				return;
			}
			const p = computePos(view, sel.from, sel.to);
			if (!p) {
				setVisible(false);
				return;
			}
			setPos({ top: p.top, left: p.left });
			setVisible(true);
		};

		const handleBlur = () => {
			if (state !== "idle") return;
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
	}, [view, state, computePos]);

	const runAction = useCallback(
		async (action: AiBarAction) => {
			if (!view || state === "loading") return;
			const sel = view.state.selection.main;
			const text = view.state.sliceDoc(sel.from, sel.to);
			if (!text.trim()) return;
			targetRef.current = { from: sel.from, to: sel.to, text };
			setActiveAction(action);
			setState("loading");
			setVisible(false);
			try {
				const prompt = action.prompt.replace("{selection}", text);
				const output = await onGenerate(prompt);
				if (!targetRef.current) return; // 已被取消
				setResult(output);
				setState("result");
			} catch {
				if (!targetRef.current) return;
				setResult("");
				setState("error");
			}
		},
		[view, state, onGenerate],
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
			// 剪贴板不可用时静默
		}
	}, [result]);

	// AI 状态激活时，把面板锚定在目标区间附近
	useEffect(() => {
		if (state === "idle" || !view || !targetRef.current) return;
		const p = computePos(view, targetRef.current.from, targetRef.current.to);
		if (p) setPos({ top: p.top, left: p.left });
	}, [state, view, computePos]);

	const shouldShow = view && (visible || state !== "idle");
	if (!shouldShow) return null;

	const panelStyle: React.CSSProperties = {
		position: "fixed",
		top: pos.top,
		left: pos.left,
		zIndex: 40,
	};

	return createPortal(
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
					onReplace={() => applyReplace("replace")}
					onInsertAfter={() => applyReplace("insertAfter")}
					onCopy={() => void handleCopy()}
					onClose={reset}
				/>
			)}
		</section>,
		document.body,
	);
}
