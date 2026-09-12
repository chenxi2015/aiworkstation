import { Check, Pencil, RotateCcw } from "lucide-react";
import { useEffect, useRef } from "react";
import type { DocBlock } from "./types";

interface SplitBlockEditorProps {
	block: DocBlock;
	onUpdate: (id: string, text: string) => void;
	onReset?: (id: string) => void;
	onExit: () => void;
	isHeading?: boolean;
}

/**
 * Inline block text editor for direct manual modification in the split compare view.
 */
export function SplitBlockEditor({
	block,
	onUpdate,
	onReset,
	onExit,
	isHeading,
}: SplitBlockEditorProps) {
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	// Auto-resize textarea height to match text content seamlessly
	const adjustHeight = () => {
		const el = textareaRef.current;
		if (el) {
			el.style.height = "auto";
			el.style.height = `${Math.max(el.scrollHeight, 40)}px`;
		}
	};

	useEffect(() => {
		adjustHeight();
		// Focus and position cursor at end
		if (textareaRef.current) {
			textareaRef.current.focus();
			const len = textareaRef.current.value.length;
			textareaRef.current.setSelectionRange(len, len);
		}
	}, []);

	const isModifiedFromAi =
		Boolean(block.aiRevisedText) && block.revisedText !== block.aiRevisedText;

	return (
		<div
			data-block-id={block.id}
			className="relative my-2 p-3 rounded-xl border border-accent/40 bg-accent/[0.03] dark:bg-accent/[0.06] shadow-xs ring-2 ring-accent/15 transition-all"
		>
			{/* Top Tooltip & Action Bar */}
			<div className="flex items-center justify-between text-[11px] font-medium text-accent mb-2 pb-1.5 border-b border-accent/15 select-none">
				<span className="flex items-center gap-1.5 text-accent">
					<Pencil className="w-3.5 h-3.5" />
					<span>直接编辑中 (第 {block.textIndex} 段)</span>
				</span>
				<div className="flex items-center gap-2">
					{isModifiedFromAi && onReset && (
						<button
							type="button"
							onMouseDown={(e) => e.preventDefault()}
							onClick={() => {
								onReset(block.id);
								setTimeout(adjustHeight, 0);
							}}
							className="text-[10px] text-muted hover:text-accent hover:underline flex items-center gap-1 cursor-pointer transition-colors px-1.5 py-0.5 rounded hover:bg-accent/10"
							title="撤销手动编辑，还原为 AI 最初改写的版本"
						>
							<RotateCcw className="w-2.5 h-2.5" />
							恢复 AI 改写
						</button>
					)}
					<button
						type="button"
						onMouseDown={(e) => e.preventDefault()}
						onClick={onExit}
						className="text-[10px] bg-accent/15 hover:bg-accent/25 text-accent px-2 py-0.5 rounded-md flex items-center gap-1 cursor-pointer transition-colors"
						title="完成该段编辑 (Esc)"
					>
						<Check className="w-3 h-3" />
						完成
					</button>
				</div>
			</div>

			{/* Auto-growing Textarea matching paragraph typography */}
			<textarea
				ref={textareaRef}
				value={block.revisedText}
				onChange={(e) => {
					onUpdate(block.id, e.target.value);
					adjustHeight();
				}}
				onBlur={onExit}
				onKeyDown={(e) => {
					if (e.key === "Escape") {
						e.preventDefault();
						onExit();
					}
				}}
				rows={1}
				className={`w-full bg-transparent resize-none border-none p-0 outline-none focus:outline-none focus:ring-0 text-foreground leading-relaxed ${
					isHeading ? "font-bold text-lg" : "text-sm"
				}`}
				placeholder="请输入或修改段落内容…"
			/>
		</div>
	);
}
