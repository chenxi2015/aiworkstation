import { memo } from "react";

export interface AssistantThinkingIndicatorProps {
	/** Whether the message already contains some content or previous steps */
	hasContent?: boolean;
	/** Whether there is a step currently in 'running' status */
	hasRunningStep?: boolean;
	/** Optional custom status text override */
	statusText?: string;
}

/**
 * Ultra-clean, modern AI thinking indicator inspired by top-tier AI agents.
 * Renders a soft glowing blue dot and a gentle white shimmer sweeping across the text.
 */
export const AssistantThinkingIndicator = memo(
	function AssistantThinkingIndicator({
		hasRunningStep = false,
		statusText,
	}: AssistantThinkingIndicatorProps) {
		const label = statusText || (hasRunningStep ? "Executing..." : "Thinking");

		return (
			<div className="flex items-center gap-2 py-1 select-none animate-in fade-in duration-200">
				{/* Glowing soft blue dot */}
				<span className="relative flex h-2 w-2 items-center justify-center shrink-0">
					<span className="absolute inline-flex h-2 w-2 rounded-full bg-blue-500/30 dark:bg-blue-400/30 animate-ping" />
					<span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-blue-500 dark:bg-blue-400 shadow-[0_0_6px_rgba(59,130,246,0.5)]" />
				</span>

				{/* Shimmering text with soft light sweep */}
				<div className="relative inline-flex items-center overflow-hidden">
					<span className="thinking-shimmer-text text-[13px] font-normal tracking-wide">
						{label}
					</span>
					{/* Gentle white shimmer light sweep */}
					<span
						aria-hidden="true"
						className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/60 dark:via-white/35 to-transparent animate-visual-shimmer pointer-events-none"
					/>
				</div>
			</div>
		);
	},
);
