import { Sparkles } from "lucide-react";
import { memo } from "react";

export interface ChatInputTopToolbarProps {
	displayModel: string;
}

/**
 * Top action toolbar above the chat input card:
 * Displays the active model badge cleanly without duplicate scope pills.
 */
export const ChatInputTopToolbar = memo(function ChatInputTopToolbar({
	displayModel,
}: ChatInputTopToolbarProps) {
	return (
		<div className="flex items-center gap-1.5 min-w-0 overflow-hidden px-0.5">
			{/* Model Badge */}
			<div
				className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-surface-secondary/70 border border-border/60 text-[11px] font-medium text-foreground/90 shadow-2xs select-none shrink-0"
				title={`当前模型: ${displayModel}`}
			>
				<span className="w-4 h-4 rounded-full bg-gradient-to-tr from-violet-500 via-indigo-500 to-fuchsia-500 flex items-center justify-center text-white shrink-0 shadow-2xs">
					<Sparkles className="w-2.5 h-2.5" />
				</span>
				<span className="max-w-[120px] truncate text-[10px] font-semibold text-foreground/80">
					{displayModel}
				</span>
			</div>
		</div>
	);
});
