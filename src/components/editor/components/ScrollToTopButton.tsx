import { ArrowUp } from "lucide-react";

export interface ScrollToTopButtonProps {
	/** Whether the scroll-to-top button is visible */
	visible: boolean;
	/** Callback invoked when the button is clicked */
	onClick: () => void;
}

/**
 * Floating button to scroll back to the top of the editor canvas.
 */
export function ScrollToTopButton({
	visible,
	onClick,
}: ScrollToTopButtonProps) {
	return (
		<button
			type="button"
			onClick={onClick}
			aria-label="滚动置顶"
			title="滚动置顶"
			className={`absolute right-6 bottom-6 z-20 flex items-center justify-center w-9 h-9 rounded-full bg-surface/80 dark:bg-zinc-800/80 backdrop-blur-md border border-border shadow-md hover:shadow-lg text-muted hover:text-foreground transition-all duration-200 hover:scale-105 active:scale-95 cursor-pointer ${
				visible
					? "opacity-100 translate-y-0 pointer-events-auto"
					: "opacity-0 translate-y-2 pointer-events-none"
			}`}
		>
			<ArrowUp className="w-4 h-4 stroke-[2.2]" />
		</button>
	);
}
