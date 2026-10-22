import { Sparkles } from "lucide-react";
import type React from "react";
import { useCallback, useRef, useState } from "react";
import type { AiBarAction } from "./types";

export interface AiPresetActionListProps {
	actions: AiBarAction[];
	onSelectAction: (action: AiBarAction) => void;
	title?: string;
}

interface ActiveTooltipState {
	description: string;
	left: number;
	bottom: number;
	arrowLeft: number;
}

/**
 * Compact chip-style preset AI capability row at the bottom of the selection bubble menu.
 * Hovering a chip reveals its detailed description as an elegant boundary-safe tooltip.
 */
export function AiPresetActionList({
	actions,
	onSelectAction,
	title = "AI 智能改写",
}: AiPresetActionListProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const [activeTooltip, setActiveTooltip] = useState<ActiveTooltipState | null>(
		null,
	);

	// Compute boundary-clamped position so tooltip never gets clipped by container edges
	const handleMouseEnter = useCallback(
		(
			action: AiBarAction,
			e: React.MouseEvent<HTMLButtonElement> | React.FocusEvent<HTMLButtonElement>,
		) => {
			if (!action.description) {
				setActiveTooltip(null);
				return;
			}
			const container = containerRef.current;
			if (!container) return;

			const containerRect = container.getBoundingClientRect();
			const btnRect = e.currentTarget.getBoundingClientRect();

			const tooltipWidth = 192; // 12rem (w-48)
			const btnCenter = btnRect.left + btnRect.width / 2 - containerRect.left;

			// Keep 12px padding on both sides to prevent tooltip from overflowing the popup boundary
			const minLeft = 12;
			const maxLeft = Math.max(minLeft, containerRect.width - tooltipWidth - 12);
			const idealLeft = btnCenter - tooltipWidth / 2;
			const clampedLeft = Math.max(minLeft, Math.min(idealLeft, maxLeft));

			// Align arrow directly towards the button horizontal center
			const arrowLeft = btnCenter - clampedLeft;

			// Position nicely above the hovered button
			const bottom = containerRect.bottom - btnRect.top + 6;

			setActiveTooltip({
				description: action.description,
				left: clampedLeft,
				bottom,
				arrowLeft,
			});
		},
		[],
	);

	const handleMouseLeave = useCallback(() => {
		setActiveTooltip(null);
	}, []);

	return (
		<div
			ref={containerRef}
			onMouseLeave={handleMouseLeave}
			className="relative flex flex-col py-1"
		>
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
						onMouseEnter={(e) => handleMouseEnter(action, e)}
						onFocus={(e) => handleMouseEnter(action, e)}
						onBlur={handleMouseLeave}
						onClick={() => {
							setActiveTooltip(null);
							onSelectAction(action);
						}}
						className="group relative flex items-center gap-1.5 px-2.5 py-1.25 rounded-lg border border-border/70 bg-surface-secondary/70 dark:bg-muted/20 text-[11.5px] font-medium text-foreground/85 hover:border-accent/40 hover:bg-accent/10 hover:text-accent hover:shadow-xs active:scale-[0.97] transition-all duration-150 cursor-pointer"
					>
						<action.icon className="w-3.5 h-3.5 text-muted-foreground/75 group-hover:text-accent transition-colors shrink-0" />
						<span className="leading-none">{action.label}</span>
					</button>
				))}
			</div>

			{/* Refined boundary-safe single Tooltip */}
			{activeTooltip && (
				<div
					className="pointer-events-none absolute z-50 flex flex-col animate-in fade-in-0 zoom-in-95 duration-100"
					style={{
						left: activeTooltip.left,
						bottom: activeTooltip.bottom,
						width: 192,
					}}
				>
					<div className="w-full rounded-lg bg-neutral-900/95 dark:bg-neutral-800/95 px-2.5 py-1.5 text-[10.5px] leading-snug text-neutral-100 shadow-xl ring-1 ring-white/10 backdrop-blur-md text-center">
						{activeTooltip.description}
					</div>
					{/* Tooltip downward arrow precisely targeted to the button center */}
					<div
						className="w-0 h-0 border-x-4 border-x-transparent border-t-4 border-t-neutral-900/95 dark:border-t-neutral-800/95"
						style={{
							marginLeft: Math.max(8, Math.min(activeTooltip.arrowLeft - 4, 180)),
						}}
					/>
				</div>
			)}
		</div>
	);
}
