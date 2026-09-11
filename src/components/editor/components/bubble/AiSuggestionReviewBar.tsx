import { Check, Sparkles, Square, X } from "lucide-react";
import type React from "react";
import { createPortal } from "react-dom";

export interface AiSuggestionReviewBarProps {
	visible: boolean;
	position: { top: number; left: number };
	isStreaming?: boolean;
	onAccept: () => void;
	onReject: () => void;
	onStopStreaming?: () => void;
	onClose?: () => void;
}

/**
 * Floating review bar for AI inline suggestion diffs (Accept / Reject / Streaming)
 */
export const AiSuggestionReviewBar: React.FC<AiSuggestionReviewBarProps> = ({
	visible,
	position,
	isStreaming = false,
	onAccept,
	onReject,
	onStopStreaming,
	onClose,
}) => {
	if (!visible) return null;

	return createPortal(
		<div
			style={{
				top: `${position.top}px`,
				left: `${position.left}px`,
			}}
			className="fixed z-50 transform -translate-x-1/2 flex items-center gap-1.5 p-1 px-1.5 bg-white/98 dark:bg-zinc-900/98 backdrop-blur-md border border-zinc-200/90 dark:border-zinc-800 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.15)] animate-in fade-in zoom-in-95 duration-150 select-none"
		>
			{isStreaming ? (
				<>
					<div className="flex items-center gap-2 px-3 py-1.5 text-xs text-muted">
						<Sparkles className="w-3.5 h-3.5 animate-pulse text-indigo-500 shrink-0" />
						<span className="font-medium text-foreground">
							AI 正在生成精细对比建议…
						</span>
					</div>
					{onStopStreaming && (
						<button
							type="button"
							onClick={(e) => {
								e.stopPropagation();
								onStopStreaming();
							}}
							className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-danger hover:bg-danger/10 rounded-xl transition-colors cursor-pointer"
							title="停止生成"
						>
							<Square className="w-3 h-3 fill-current" />
							<span>停止</span>
						</button>
					)}
				</>
			) : (
				<>
					<button
						type="button"
						onClick={(e) => {
							e.stopPropagation();
							onReject();
						}}
						className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:text-danger hover:bg-danger/10 rounded-xl transition-colors cursor-pointer"
						title="丢弃建议，恢复原内容"
					>
						<X className="w-3.5 h-3.5" />
						<span>Reject</span>
					</button>

					<button
						type="button"
						onClick={(e) => {
							e.stopPropagation();
							onAccept();
						}}
						className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 active:scale-95 dark:bg-indigo-500 dark:hover:bg-indigo-600 rounded-xl shadow-xs transition-all cursor-pointer"
						title="采纳建议并更新文档"
					>
						<Check className="w-3.5 h-3.5 stroke-[2.5]" />
						<span>Accept</span>
					</button>

					{onClose && (
						<button
							type="button"
							onClick={(e) => {
								e.stopPropagation();
								onClose();
							}}
							className="p-1 text-muted hover:text-foreground rounded-lg hover:bg-muted/20 transition-colors ml-0.5 cursor-pointer"
							title="关闭工具栏"
						>
							<X className="w-3 h-3" />
						</button>
					)}
				</>
			)}
		</div>,
		document.body,
	);
};
