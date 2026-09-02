/**
 * Skeleton placeholder for Daily Capsule Banner
 */
export function CapsuleBannerSkeleton() {
	return (
		<div className="mb-6 rounded-2xl bg-surface-secondary/30 border border-border/60 p-4 shadow-2xs backdrop-blur-sm animate-pulse">
			<div className="flex items-center justify-between gap-4 mb-3">
				<div className="flex items-center gap-2.5">
					<div className="w-7 h-7 rounded-xl bg-surface-secondary/80 shrink-0" />
					<div className="space-y-1">
						<div className="w-24 h-3.5 rounded bg-surface-secondary/70" />
						<div className="w-48 h-2.5 rounded bg-surface-secondary/40" />
					</div>
				</div>
				<div className="w-16 h-7 rounded-full bg-surface-secondary/60" />
			</div>

			<div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
				{Array.from({ length: 3 }, (_, i) => (
					<div
						key={`capsule-skel-${i}`}
						className="bg-surface/60 rounded-xl border border-border/60 p-3.5 flex flex-col justify-between gap-2.5 min-h-[110px]"
					>
						<div className="flex items-start gap-2.5">
							<div className="w-8 h-8 rounded-lg bg-surface-secondary/80 shrink-0" />
							<div className="flex-1 space-y-1.5">
								<div className="w-3/4 h-3.5 rounded bg-surface-secondary/80" />
								<div className="w-1/2 h-2.5 rounded bg-surface-secondary/40" />
							</div>
						</div>
						<div className="w-full h-3 rounded bg-surface-secondary/40" />
						<div className="pt-2 border-t border-border/40 flex items-center justify-between">
							<div className="w-20 h-2.5 rounded bg-surface-secondary/40" />
							<div className="w-10 h-4 rounded bg-surface-secondary/60" />
						</div>
					</div>
				))}
			</div>
		</div>
	);
}
