import { CheckCircle2, Loader2, Square, X } from "lucide-react";
import { useEffect, useState } from "react";

export interface SplitStreamingFloatingBarProps {
	isStreaming: boolean;
	currentStep: number;
	totalSteps: number;
	diffCount?: number;
	onStop: () => void;
}

/**
 * Floating status bar at the bottom of the split compare view.
 * Displays real-time streaming progress, completion feedback, and a stop action
 * without cluttering the top navigation header.
 */
export function SplitStreamingFloatingBar({
	isStreaming,
	currentStep,
	totalSteps,
	diffCount,
	onStop,
}: SplitStreamingFloatingBarProps) {
	// Keep track of completion state to briefly show completion feedback
	const [showCompletion, setShowCompletion] = useState(false);
	const [hasEverStreamed, setHasEverStreamed] = useState(false);

	useEffect(() => {
		if (isStreaming) {
			setHasEverStreamed(true);
			setShowCompletion(false);
		} else if (hasEverStreamed) {
			// Streaming just completed; show brief completion notification
			setShowCompletion(true);
			const timer = setTimeout(() => {
				setShowCompletion(false);
			}, 3500);
			return () => clearTimeout(timer);
		}
	}, [isStreaming, hasEverStreamed]);

	// Do not render anything if not streaming and not showing completion toast
	if (!isStreaming && !showCompletion) {
		return null;
	}

	const percent =
		totalSteps > 0
			? Math.min(100, Math.round((currentStep / totalSteps) * 100))
			: 0;

	return (
		<div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 pointer-events-auto select-none transition-all duration-300 animate-in fade-in slide-in-from-bottom-3">
			<div className="flex items-center gap-3 px-4 py-2 rounded-full bg-surface/95 dark:bg-zinc-900/95 backdrop-blur-md border border-border/80 shadow-lg shadow-black/10 dark:shadow-black/30 text-xs text-foreground">
				{isStreaming ? (
					<>
						{/* Pulsing loading icon */}
						<div className="flex items-center gap-2">
							<Loader2 className="w-3.5 h-3.5 text-accent animate-spin shrink-0" />
							<span className="font-medium text-accent">AI 实时流式写入中</span>
							<span className="text-muted text-[11px] tabular-nums">
								({currentStep}/{totalSteps} 段)
							</span>
						</div>

						{/* Mini progress bar */}
						<div className="hidden sm:flex items-center gap-1.5 pl-1 border-l border-border/60">
							<div className="w-20 h-1.5 rounded-full bg-muted/20 overflow-hidden">
								<div
									className="h-full bg-accent rounded-full transition-all duration-300 ease-out"
									style={{ width: `${percent}%` }}
								/>
							</div>
							<span className="text-[10px] text-muted font-mono tabular-nums">
								{percent}%
							</span>
						</div>

						{/* Stop generation button */}
						<button
							type="button"
							onClick={onStop}
							className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium text-rose-500 hover:text-rose-600 dark:text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 transition-colors cursor-pointer ml-1"
							title="停止后续改写"
						>
							<Square className="w-2.5 h-2.5 fill-current" />
							<span>停止</span>
						</button>
					</>
				) : (
					<>
						{/* Completed toast */}
						<div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium">
							<CheckCircle2 className="w-4 h-4 shrink-0" />
							<span>改写完成 (共 {totalSteps} 段)</span>
							{diffCount !== undefined && diffCount !== 0 && (
								<span className="text-[11px] opacity-80 font-normal">
									({diffCount > 0 ? `+${diffCount}` : diffCount} 字)
								</span>
							)}
						</div>
						<button
							type="button"
							onClick={() => setShowCompletion(false)}
							className="p-0.5 text-muted hover:text-foreground rounded-full transition-colors ml-1 cursor-pointer"
							title="关闭提示"
						>
							<X className="w-3 h-3" />
						</button>
					</>
				)}
			</div>
		</div>
	);
}
