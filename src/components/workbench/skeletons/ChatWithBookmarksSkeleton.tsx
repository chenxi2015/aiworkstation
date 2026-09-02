/**
 * Skeleton placeholder for Right-side AI Search & Knowledge Q&A Panel
 */
export function ChatWithBookmarksSkeleton({
	className = "",
}: {
	className?: string;
}) {
	return (
		<aside
			className={`w-[320px] xl:w-[360px] 2xl:w-[400px] shrink-0 bg-surface/95 backdrop-blur-md border-l border-border flex flex-col h-[calc(100vh-60px)] sticky top-[60px] animate-pulse ${className}`}
		>
			{/* Top Header skeleton */}
			<div className="p-3.5 border-b border-border/80 bg-surface-secondary/30 shrink-0 flex flex-col gap-2.5">
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-2">
						<div className="w-6 h-6 rounded-lg bg-surface-secondary/80 shrink-0" />
						<div className="w-28 h-4 rounded-md bg-surface-secondary/80" />
					</div>
					<div className="w-16 h-3 rounded bg-surface-secondary/40" />
				</div>

				{/* Vector Embedding Status Widget skeleton */}
				<div className="p-2 rounded-xl bg-surface-secondary/40 border border-border/50 flex items-center justify-between gap-2">
					<div className="flex items-center gap-2 flex-1">
						<div className="w-4 h-4 rounded-md bg-surface-secondary/70 shrink-0" />
						<div className="w-24 h-3 rounded bg-surface-secondary/60" />
					</div>
					<div className="w-14 h-5 rounded-full bg-surface-secondary/60" />
				</div>
			</div>

			{/* Message History skeleton */}
			<div className="flex-1 overflow-y-auto p-4 space-y-4">
				{/* AI message bubble skeleton */}
				<div className="flex flex-col items-start gap-1.5">
					<div className="flex items-center gap-1.5 px-1">
						<div className="w-12 h-2.5 rounded bg-surface-secondary/50" />
					</div>
					<div className="w-4/5 p-3 rounded-2xl rounded-tl-xs bg-surface border border-border space-y-2">
						<div className="w-full h-3 rounded bg-surface-secondary/70" />
						<div className="w-3/4 h-3 rounded bg-surface-secondary/50" />
					</div>

					{/* References card skeleton */}
					<div className="mt-1 w-full p-3 rounded-xl bg-surface/90 border border-border space-y-2.5">
						<div className="flex items-center justify-between">
							<div className="w-28 h-3 rounded bg-surface-secondary/60" />
							<div className="w-10 h-3 rounded bg-surface-secondary/40" />
						</div>
						<div className="space-y-1.5">
							<div className="p-2 rounded-lg bg-surface-secondary/30 border border-border/40 flex items-center gap-2">
								<div className="w-5 h-5 rounded-md bg-surface-secondary/60 shrink-0" />
								<div className="flex-1 space-y-1">
									<div className="w-3/5 h-3 rounded bg-surface-secondary/60" />
									<div className="w-2/5 h-2 rounded bg-surface-secondary/40" />
								</div>
							</div>
							<div className="p-2 rounded-lg bg-surface-secondary/30 border border-border/40 flex items-center gap-2">
								<div className="w-5 h-5 rounded-md bg-surface-secondary/60 shrink-0" />
								<div className="flex-1 space-y-1">
									<div className="w-4/5 h-3 rounded bg-surface-secondary/60" />
									<div className="w-1/3 h-2 rounded bg-surface-secondary/40" />
								</div>
							</div>
						</div>
					</div>
				</div>

				{/* User prompt suggestion tags skeleton */}
				<div className="space-y-2 pt-2">
					<div className="w-20 h-2.5 rounded bg-surface-secondary/40 mx-auto" />
					<div className="flex flex-wrap gap-1.5 justify-center">
						<div className="w-32 h-6 rounded-full bg-surface-secondary/40" />
						<div className="w-28 h-6 rounded-full bg-surface-secondary/40" />
					</div>
				</div>
			</div>

			{/* Bottom Input Area skeleton */}
			<div className="p-3 border-t border-border bg-surface-secondary/40 shrink-0 flex flex-col gap-1.5">
				<div className="flex items-end gap-2 bg-surface border border-border/80 rounded-xl p-2 h-[68px]">
					<div className="flex-1 h-full py-1">
						<div className="w-3/4 h-3 rounded bg-surface-secondary/50" />
					</div>
					<div className="w-7 h-7 rounded-lg bg-surface-secondary/80 shrink-0" />
				</div>
				<div className="flex items-center justify-between px-1">
					<div className="w-36 h-2.5 rounded bg-surface-secondary/40" />
					<div className="w-24 h-2.5 rounded bg-surface-secondary/40" />
				</div>
			</div>
		</aside>
	);
}
