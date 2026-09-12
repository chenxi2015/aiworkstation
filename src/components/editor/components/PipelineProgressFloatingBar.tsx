import { Check, Sparkles, Square, X } from "lucide-react";
import type React from "react";
import { createPortal } from "react-dom";

export interface PipelineProgressFloatingBarProps {
	isStreaming: boolean;
	currentStep: number;
	totalSteps: number;
	hasActiveSuggestions: boolean;
	onStop: () => void;
	onAcceptAll: () => void;
	onRejectAll: () => void;
}

/**
 * Floating bottom banner showing real-time paragraph streaming pipeline progress
 * and bulk accept/reject actions.
 */
export const PipelineProgressFloatingBar: React.FC<
	PipelineProgressFloatingBarProps
> = ({
	isStreaming,
	currentStep,
	totalSteps,
	hasActiveSuggestions,
	onStop,
	onAcceptAll,
	onRejectAll,
}) => {
	// Only render if pipeline is active or there are pending suggestions to review
	if (!isStreaming && !hasActiveSuggestions) return null;

	const percent =
		totalSteps > 0 ? Math.min(100, Math.round((currentStep / totalSteps) * 100)) : 0;

	return createPortal(
		<div
			role="status"
			aria-label="段落改写进度条"
			className="fixed bottom-14 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 px-4 py-2.5 bg-surface/95 dark:bg-zinc-900/95 backdrop-blur-md border border-border shadow-lg rounded-2xl animate-in fade-in slide-in-from-bottom-3 duration-200 select-none max-w-md w-auto"
		>
			{isStreaming ? (
				<>
					<div className="flex items-center gap-2">
						<Sparkles className="w-4 h-4 text-accent animate-pulse shrink-0" />
						<div className="flex flex-col">
							<span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
								<span>AI 逐段润色改写中</span>
								<span className="text-muted font-normal text-[11px]">
									({currentStep} / {totalSteps} 段)
								</span>
							</span>
							<div className="w-36 h-1.5 bg-muted/20 rounded-full overflow-hidden mt-1">
								<div
									className="h-full bg-accent transition-all duration-300 rounded-full"
									style={{ width: `${percent}%` }}
								/>
							</div>
						</div>
					</div>

					<button
						type="button"
						onClick={onStop}
						className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-danger hover:bg-danger/10 rounded-lg transition-colors cursor-pointer shrink-0 ml-2"
						title="停止后续段落改写"
					>
						<Square className="w-3 h-3 fill-current" />
						<span>停止</span>
					</button>
				</>
			) : (
				<>
					<div className="flex items-center gap-2">
						<div className="w-2 h-2 rounded-full bg-success shrink-0" />
						<span className="text-xs font-medium text-foreground">
							逐段优化完成，请审阅正文建议
						</span>
					</div>

					<div className="flex items-center gap-1.5 ml-2">
						<button
							type="button"
							onClick={onRejectAll}
							className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-muted hover:text-danger hover:bg-danger/10 rounded-lg transition-colors cursor-pointer"
							title="恢复原文"
						>
							<X className="w-3.5 h-3.5" />
							<span>全部放弃</span>
						</button>

						<button
							type="button"
							onClick={onAcceptAll}
							className="flex items-center gap-1 px-3 py-1 text-xs font-semibold text-accent-foreground bg-accent hover:opacity-90 active:scale-95 rounded-lg shadow-xs transition-all cursor-pointer"
							title="全部采纳改写"
						>
							<Check className="w-3.5 h-3.5 stroke-[2.5]" />
							<span>全部采纳</span>
						</button>
					</div>
				</>
			)}
		</div>,
		document.body,
	);
};
