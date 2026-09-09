/**
 * Shared top header skeleton (brand + module tabs + actions), matching
 * WorkbenchHeader layout. Used by all route-level pending skeletons.
 */
export function HeaderSkeleton() {
	return (
		<header className="shrink-0 bg-surface/80 border-b border-border px-6 h-15 flex items-center gap-4 justify-between backdrop-blur-md animate-pulse">
			{/* Left: Brand */}
			<div className="flex items-center gap-2.5 shrink-0 pr-2">
				<div className="w-8 h-8 rounded-xl bg-surface-secondary/80 shrink-0" />
				<div className="flex flex-col gap-1">
					<div className="w-16 h-3.5 rounded bg-surface-secondary/80" />
					<div className="w-12 h-2.5 rounded bg-surface-secondary/40" />
				</div>
			</div>

			{/* Center: Category Tabs Skeleton */}
			<div className="hidden md:flex items-center gap-1.5 p-1 bg-surface-secondary/40 rounded-full border border-border/50">
				<div className="w-16 h-6 rounded-full bg-surface-secondary/80" />
				<div className="w-14 h-6 rounded-full bg-surface-secondary/40" />
				<div className="w-14 h-6 rounded-full bg-surface-secondary/40" />
				<div className="w-16 h-6 rounded-full bg-surface-secondary/40" />
			</div>

			{/* Right: Actions Skeleton */}
			<div className="flex items-center gap-2 shrink-0">
				<div className="w-20 h-7 rounded-full bg-surface-secondary/60" />
				<div className="w-20 h-7 rounded-full bg-surface-secondary/50" />
				<div className="w-22 h-7 rounded-full bg-surface-secondary/40 hidden sm:block" />
				<div className="w-7 h-7 rounded-full bg-surface-secondary/50" />
				<div className="w-7 h-7 rounded-full bg-surface-secondary/50" />
			</div>
		</header>
	);
}
