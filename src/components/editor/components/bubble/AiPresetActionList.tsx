import type { AiBarAction } from "./types";

export interface AiPresetActionListProps {
	actions: AiBarAction[];
	onSelectAction: (action: AiBarAction) => void;
	title?: string;
}

/**
 * Compact tag-style preset AI capability row at the bottom of the selection bubble menu.
 * Hovering a tag reveals its detailed description as a tooltip.
 */
export function AiPresetActionList({
	actions,
	onSelectAction,
	title = "AI 智能改写",
}: AiPresetActionListProps) {
	return (
		<div className="flex flex-col">
			<div className="px-2.5 pt-1.5 text-[10px] font-semibold text-muted tracking-wider uppercase flex items-center justify-between">
				<span>{title}</span>
				<span className="text-[9px] text-muted/70 normal-case font-normal">
					点击即可执行 · 悬停查看说明
				</span>
			</div>
			<div className="flex flex-wrap gap-1.5 px-2.5 py-2">
				{actions.map((action) => (
					<button
						key={action.id}
						type="button"
						onClick={() => onSelectAction(action)}
						className="group relative flex items-center gap-1 px-2 py-1 rounded-full border border-border/70 bg-muted/5 text-[11px] text-foreground/85 hover:border-accent/50 hover:bg-accent/10 hover:text-accent transition-colors cursor-pointer"
					>
						<action.icon className="w-3 h-3 shrink-0" />
						<span className="leading-tight">{action.label}</span>
						{action.description && (
							<span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 z-50 hidden group-hover:block w-44 whitespace-normal rounded-lg border border-border/80 bg-surface px-2 py-1.5 text-[10px] leading-snug text-muted shadow-[0_8px_24px_rgba(0,0,0,0.14)]">
								{action.description}
							</span>
						)}
					</button>
				))}
			</div>
		</div>
	);
}
