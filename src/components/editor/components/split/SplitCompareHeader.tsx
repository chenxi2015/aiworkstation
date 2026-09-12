import { Button } from "@heroui/react";
import {
	ArrowLeft,
	Check,
	Columns2,
	Eye,
	GitCompare,
	Sparkles,
	X,
} from "lucide-react";
import type { ViewMode } from "./types";

export interface SplitCompareHeaderProps {
	docTitle?: string;
	modeLabel?: string;
	isStreaming: boolean;
	currentStep: number;
	totalSteps: number;
	diffCount: number;
	viewMode: ViewMode;
	onViewModeChange: (mode: ViewMode) => void;
	onStop: () => void;
	onAccept: () => void;
	onCancel: () => void;
}

/**
 * Top control header for split compare view.
 */
export function SplitCompareHeader({
	docTitle,
	modeLabel,
	isStreaming,
	currentStep: _currentStep,
	totalSteps,
	diffCount,
	viewMode,
	onViewModeChange,
	onStop: _onStop,
	onAccept,
	onCancel,
}: SplitCompareHeaderProps) {
	return (
		<header className="h-12 border-b border-border bg-surface/90 dark:bg-surface-secondary/60 backdrop-blur-md px-4 flex items-center justify-between shrink-0 z-20 shadow-xs">
			{/* Left: Status & Title */}
			<div className="flex items-center gap-3 min-w-0">
				<Button
					variant="ghost"
					size="sm"
					isIconOnly
					className="h-8 w-8 text-muted hover:text-foreground cursor-pointer rounded-lg"
					onPress={onCancel}
					aria-label="返回原文章"
				>
					<ArrowLeft className="w-4 h-4" />
				</Button>
				<div className="flex items-center gap-2 min-w-0">
					<div className="w-5 h-5 rounded bg-accent/15 text-accent flex items-center justify-center shrink-0">
						<Columns2 className="w-3.5 h-3.5" />
					</div>
					<h2 className="font-semibold text-xs text-foreground truncate max-w-[140px] md:max-w-[240px]">
						双栏改写对比{modeLabel ? ` · ${modeLabel}` : ""}
					</h2>
					{docTitle && (
						<span className="hidden sm:inline text-[11px] text-muted truncate max-w-[100px] md:max-w-[180px]">
							· {docTitle}
						</span>
					)}
				</div>

				{/* Completed badge when finished (hidden on smaller screens to avoid crowding) */}
				{!isStreaming && totalSteps > 0 && (
					<div className="hidden lg:flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-[11px] font-medium shrink-0">
						<Sparkles className="w-3 h-3" />
						<span>改写完成 ({totalSteps} 段)</span>
						{diffCount !== 0 && (
							<span className="text-[10px] opacity-80">
								({diffCount > 0 ? `+${diffCount}` : diffCount} 字)
							</span>
						)}
					</div>
				)}
			</div>

			{/* Center: View Mode Switch */}
			<div className="flex items-center shrink-0 bg-surface-secondary/80 dark:bg-zinc-800/80 p-0.5 rounded-lg border border-border/80">
				<button
					type="button"
					onClick={() => onViewModeChange("diff")}
					className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-all cursor-pointer ${
						viewMode === "diff"
							? "bg-surface text-accent shadow-xs"
							: "text-muted hover:text-foreground"
					}`}
				>
					<GitCompare className="w-3.5 h-3.5" />
					实时高亮差异
				</button>
				<button
					type="button"
					onClick={() => onViewModeChange("clean")}
					className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-all cursor-pointer ${
						viewMode === "clean"
							? "bg-surface text-foreground shadow-xs"
							: "text-muted hover:text-foreground"
					}`}
				>
					<Eye className="w-3.5 h-3.5" />
					纯净成稿
				</button>
			</div>

			{/* Right: Actions */}
			<div className="flex items-center gap-2 shrink-0">
				<Button
					variant="ghost"
					size="sm"
					className="h-8 text-xs text-muted hover:text-foreground cursor-pointer px-3"
					onPress={onCancel}
				>
					<X className="w-3.5 h-3.5 mr-1" />
					放弃更改
				</Button>
				<Button
					variant="primary"
					size="sm"
					className="h-8 text-xs font-medium bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs cursor-pointer px-3.5"
					onPress={onAccept}
				>
					<Check className="w-3.5 h-3.5 mr-1 stroke-[2.5]" />
					采纳全部并覆盖
				</Button>
			</div>
		</header>
	);
}
