/**
 * Skeleton placeholder for the global right-side AI panel.
 * Rendered by AppShell ahead of the real panel in DOM order so that streaming
 * SSR paints a reserved sidebar before the panel markup arrives; hidden via CSS
 * (`:has([data-ai-panel])`) once the real panel exists.
 */
export function AiPanelSkeleton() {
	return (
		<aside
			data-ai-panel-skeleton
			className="order-3 w-[380px] xl:w-[440px] 2xl:w-[480px] shrink-0 bg-surface/95 border-l border-border flex flex-col h-full animate-pulse"
		>
			{/* Header: title + scope pill */}
			<div className="p-3 border-b border-border/80 flex flex-col gap-2 shrink-0">
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-2">
						<div className="w-6 h-6 rounded-lg bg-surface-secondary/80" />
						<div className="w-24 h-3.5 rounded bg-surface-secondary/70" />
					</div>
					<div className="w-16 h-5 rounded-lg bg-surface-secondary/50" />
				</div>
				{/* Embedding status bar */}
				<div className="w-full h-8 rounded-xl bg-surface-secondary/40" />
				{/* Tab switcher */}
				<div className="flex items-center p-0.5 bg-surface-secondary/60 rounded-xl border border-border/50">
					<div className="flex-1 h-7 rounded-lg bg-surface-secondary/80" />
					<div className="flex-1 h-7 rounded-lg bg-surface-secondary/40" />
				</div>
			</div>

			{/* Body: message/thread placeholders */}
			<div className="flex-1 p-3 space-y-3 overflow-hidden">
				<div className="flex justify-end">
					<div className="w-3/5 h-9 rounded-2xl bg-surface-secondary/50" />
				</div>
				<div className="space-y-2">
					<div className="w-2/3 h-3 rounded bg-surface-secondary/60" />
					<div className="w-5/6 h-3 rounded bg-surface-secondary/40" />
					<div className="w-1/2 h-3 rounded bg-surface-secondary/40" />
				</div>
				<div className="space-y-2 pt-2">
					<div className="w-4/6 h-3 rounded bg-surface-secondary/50" />
					<div className="w-3/6 h-3 rounded bg-surface-secondary/40" />
				</div>
			</div>

			{/* Footer: model bar + input */}
			<div className="p-3 border-t border-border/60 shrink-0 space-y-2">
				<div className="w-28 h-6 rounded-full bg-surface-secondary/60" />
				<div className="w-full h-16 rounded-2xl bg-surface-secondary/40 border border-border/50" />
			</div>
		</aside>
	);
}
