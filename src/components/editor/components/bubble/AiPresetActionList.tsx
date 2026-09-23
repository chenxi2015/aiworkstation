import { Sparkles } from "lucide-react";
import type { AiBarAction } from "./types";

export interface AiPresetActionListProps {
	actions: AiBarAction[];
	onSelectAction: (action: AiBarAction) => void;
	title?: string;
}

/**
 * Compact chip-style preset AI capability row at the bottom of the selection bubble menu.
 * Hovering a chip reveals its detailed description as an elegant tooltip.
 */
export function AiPresetActionList({
	actions,
	onSelectAction,
	title = "AI 智能改写",
}: AiPresetActionListProps) {
	return (
		<div className="flex flex-col py-1">
			{/* Section Header */}
			<div className="px-3 pt-1.5 pb-1 flex items-center justify-between">
				<div className="flex items-center gap-1.5 text-[11px] font-medium text-foreground/75">
					<Sparkles className="w-3 h-3 text-accent shrink-0" />
					<span>{title}</span>
				</div>
				<span className="text-[10px] text-muted-foreground/60 tracking-tight">
					快捷指令 · 点击执行
				</span>
			</div>

			{/* Action Chips Grid/Flex */}
			<div className="flex flex-wrap gap-1.5 px-3 py-1.5">
				{actions.map((action) => (
					<button
						key={action.id}
						type="button"
						onClick={() => onSelectAction(action)}
						className="group relative flex items-center gap-1.5 px-2.5 py-1.25 rounded-lg border border-border/70 bg-surface-secondary/70 dark:bg-muted/20 text-[11.5px] font-medium text-foreground/85 hover:border-accent/40 hover:bg-accent/10 hover:text-accent hover:shadow-xs active:scale-[0.97] transition-all duration-150 cursor-pointer"
					>
						<action.icon className="w-3.5 h-3.5 text-muted-foreground/75 group-hover:text-accent transition-colors shrink-0" />
						<span className="leading-none">{action.label}</span>

						{/* Refined Tooltip */}
						{action.description && (
							<div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 hidden group-hover:flex flex-col items-center w-48 animate-in fade-in-0 zoom-in-95 duration-100">
								<div className="w-full rounded-lg bg-neutral-900/95 dark:bg-neutral-800/95 px-2.5 py-1.5 text-[10.5px] leading-snug text-neutral-100 shadow-xl ring-1 ring-white/10 backdrop-blur-md text-center">
									{action.description}
								</div>
								{/* Tooltip downward arrow */}
								<div className="w-0 h-0 border-x-4 border-x-transparent border-t-4 border-t-neutral-900/95 dark:border-t-neutral-800/95" />
							</div>
						)}
					</button>
				))}
			</div>
		</div>
	);
}
