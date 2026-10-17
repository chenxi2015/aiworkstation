import { Popover } from "@heroui/react";
import { memo, type ReactNode } from "react";

export interface VideoDurationPopoverProps {
	duration: number; // Duration in seconds (e.g. 5, 10, 15)
	onChangeDuration: (val: number) => void;
	trigger: ReactNode;
}

/**
 * Video duration popover matching user reference screenshot 2:
 * - Slider range: 3s to 30s
 * - Scale ticks: 0, 10, 20, 30
 * - Right card: Current number + 'S' unit
 */
export const VideoDurationPopover = memo(function VideoDurationPopover({
	duration,
	onChangeDuration,
	trigger,
}: VideoDurationPopoverProps) {
	const min = 3;
	const max = 30;
	const percentage = Math.min(
		100,
		Math.max(0, ((duration - min) / (max - min)) * 100),
	);

	return (
		<Popover>
			<Popover.Trigger>{trigger}</Popover.Trigger>
			<Popover.Content
				placement="top"
				offset={8}
				className="w-[280px] p-3.5 rounded-2xl bg-surface/98 backdrop-blur-xl border border-border/80 shadow-2xl z-50 select-none"
			>
				<Popover.Dialog
					aria-label="视频时长设置"
					className="outline-none flex flex-col gap-2.5"
				>
					<div className="text-[11px] font-semibold text-muted px-0.5">
						时长
					</div>

					<div className="flex items-center gap-3">
						{/* Slider container with custom progress rail */}
						<div className="flex-1 flex flex-col gap-1.5 pt-1">
							<div className="relative flex items-center h-4">
								{/* Background Track */}
								<div className="absolute left-0 right-0 h-1.5 rounded-full bg-surface-secondary border border-border/40 overflow-hidden">
									{/* Active Fill Track */}
									<div
										style={{ width: `${percentage}%` }}
										className="h-full bg-purple-600 transition-all rounded-full"
									/>
								</div>
								{/* Range input transparent overlay */}
								<input
									type="range"
									min={min}
									max={max}
									step={1}
									value={duration}
									onChange={(e) => onChangeDuration(Number(e.target.value))}
									className="absolute left-0 right-0 w-full h-4 opacity-0 cursor-pointer z-10"
								/>
								{/* Custom Thumb */}
								<div
									style={{ left: `calc(${percentage}% - 7px)` }}
									className="absolute w-3.5 h-3.5 rounded-full bg-white border-2 border-purple-600 shadow-sm pointer-events-none transition-all"
								/>
							</div>

							{/* Scale Ticks */}
							<div className="flex justify-between text-[9px] text-muted/80 px-0.5 font-medium">
								<span>0</span>
								<span>10</span>
								<span>20</span>
								<span>30</span>
							</div>
						</div>

						{/* Right Value Box */}
						<div className="flex items-center justify-center gap-1 min-w-[54px] h-8 px-2 rounded-xl bg-surface-secondary/70 border border-border/60 shadow-2xs shrink-0">
							<span className="text-sm font-bold text-foreground">
								{duration}
							</span>
							<span className="text-[10px] text-muted font-medium">S</span>
						</div>
					</div>
				</Popover.Dialog>
			</Popover.Content>
		</Popover>
	);
});
