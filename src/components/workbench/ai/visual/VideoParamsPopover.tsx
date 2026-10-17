import { Popover } from "@heroui/react";
import { Maximize2 } from "lucide-react";
import { memo, type ReactNode } from "react";
import {
	VIDEO_ASPECT_RATIO_OPTIONS,
	VIDEO_RESOLUTION_OPTIONS,
	type VideoAspectRatio,
	type VideoResolution,
} from "../../../../types/visualGeneration.ts";

export interface VideoParamsPopoverProps {
	aspectRatio: VideoAspectRatio;
	resolution: VideoResolution;
	onChangeAspectRatio: (val: VideoAspectRatio) => void;
	onChangeResolution: (val: VideoResolution) => void;
	trigger: ReactNode;
}

/**
 * Video parameters popover: Aspect Ratio (7 video ratios) and Resolution (480p/720p/1080p).
 * Matches user reference screenshot 1.
 */
export const VideoParamsPopover = memo(function VideoParamsPopover({
	aspectRatio,
	resolution,
	onChangeAspectRatio,
	onChangeResolution,
	trigger,
}: VideoParamsPopoverProps) {
	return (
		<Popover>
			<Popover.Trigger>{trigger}</Popover.Trigger>
			<Popover.Content
				placement="top"
				offset={8}
				className="w-[330px] max-w-[92vw] p-3 rounded-2xl bg-surface/98 backdrop-blur-xl border border-border/80 shadow-2xl z-50 select-none"
			>
				<Popover.Dialog
					aria-label="视频生成参数配置"
					className="outline-none flex flex-col gap-3.5"
				>
					{/* 1. Video Aspect Ratio Section */}
					<div className="flex flex-col gap-1.5">
						<div className="text-[11px] font-semibold text-muted px-0.5">
							宽高比
						</div>
						<div className="grid grid-cols-7 gap-1 bg-surface-secondary/40 p-1.5 rounded-xl border border-border/50">
							{VIDEO_ASPECT_RATIO_OPTIONS.map((opt) => {
								const isSelected = aspectRatio === opt.id;
								return (
									<button
										key={opt.id}
										type="button"
										onClick={() => onChangeAspectRatio(opt.id)}
										className={`flex flex-col items-center justify-center py-1.5 px-0.5 rounded-lg text-center transition-all cursor-pointer ${
											isSelected
												? "bg-surface text-foreground font-semibold shadow-xs ring-1 ring-border/80"
												: "text-muted hover:text-foreground hover:bg-surface/50"
										}`}
										title={`比例 ${opt.label}`}
									>
										{/* Miniature visual wireframe */}
										<div className="h-5 flex items-center justify-center">
											{opt.id === "auto" ? (
												<Maximize2 className="w-3.5 h-3.5" />
											) : (
												<div
													style={{
														width: `${opt.previewWidth}px`,
														height: `${opt.previewHeight}px`,
													}}
													className="border border-current rounded-[2px] transition-all opacity-90"
												/>
											)}
										</div>
										<span className="text-[10px] tracking-tight mt-1 truncate max-w-full">
											{opt.label}
										</span>
									</button>
								);
							})}
						</div>
					</div>

					{/* 2. Video Resolution Section */}
					<div className="flex flex-col gap-1.5">
						<div className="text-[11px] font-semibold text-muted px-0.5">
							分辨率
						</div>
						<div className="grid grid-cols-3 gap-1 bg-surface-secondary/60 p-1 rounded-xl border border-border/50">
							{VIDEO_RESOLUTION_OPTIONS.map((res) => {
								const isSelected = resolution === res;
								return (
									<button
										key={res}
										type="button"
										onClick={() => onChangeResolution(res)}
										className={`py-1 text-xs rounded-lg font-medium transition-all cursor-pointer ${
											isSelected
												? "bg-surface text-foreground font-bold shadow-xs ring-1 ring-border/80"
												: "text-muted hover:text-foreground hover:bg-surface/40"
										}`}
									>
										{res}
									</button>
								);
							})}
						</div>
					</div>
				</Popover.Dialog>
			</Popover.Content>
		</Popover>
	);
});
