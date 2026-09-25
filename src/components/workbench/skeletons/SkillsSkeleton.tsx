
/**
 * Skeleton for single Skill grid card matching SkillGridCard layout.
 */
export function SkillsCardSkeleton() {
	return (
		<div className="rounded-2xl border border-zinc-200/80 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/60 p-4 shadow-2xs flex flex-col justify-between h-[210px] animate-pulse">
			<div>
				{/* Top row: Icon + Title & Badges */}
				<div className="flex items-start gap-3">
					<div className="w-11 h-11 rounded-xl bg-zinc-200/80 dark:bg-zinc-800/80 shrink-0" />
					<div className="min-w-0 flex-1 space-y-2">
						<div className="flex items-center gap-1.5">
							<div className="h-4 w-28 rounded bg-zinc-200/80 dark:bg-zinc-800/80" />
							<div className="w-3.5 h-3.5 rounded-full bg-blue-500/20" />
						</div>
						<div className="flex items-center gap-1.5">
							<div className="h-4 w-16 rounded-md bg-zinc-100 dark:bg-zinc-800" />
							<div className="h-4 w-20 rounded-md bg-amber-50 dark:bg-amber-950/30" />
						</div>
					</div>
				</div>

				{/* Middle description lines */}
				<div className="mt-3.5 space-y-2">
					<div className="h-3 w-full rounded bg-zinc-200/70 dark:bg-zinc-800/70" />
					<div className="h-3 w-4/5 rounded bg-zinc-200/60 dark:bg-zinc-800/60" />
					<div className="h-3 w-2/3 rounded bg-zinc-200/50 dark:bg-zinc-800/50" />
				</div>
			</div>

			{/* Bottom metrics */}
			<div className="mt-4 pt-3 border-t border-zinc-100 dark:border-zinc-800/60 flex items-center justify-between">
				<div className="flex items-center gap-3">
					<div className="h-3 w-12 rounded bg-zinc-200/60 dark:bg-zinc-800/60" />
					<div className="h-3 w-10 rounded bg-zinc-200/50 dark:bg-zinc-800/50" />
					<div className="h-3 w-16 rounded bg-zinc-200/50 dark:bg-zinc-800/50" />
				</div>
				<div className="h-3 w-14 rounded bg-zinc-200/50 dark:bg-zinc-800/50" />
			</div>
		</div>
	);
}

/**
 * Skeleton for single Skill list item matching SkillListItem layout.
 */
export function SkillsListItemSkeleton() {
	return (
		<div className="rounded-2xl border border-zinc-200/80 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/60 p-4 shadow-2xs flex items-center justify-between gap-4 animate-pulse">
			<div className="flex items-center gap-4 min-w-0 flex-1">
				<div className="w-12 h-12 rounded-xl bg-zinc-200/80 dark:bg-zinc-800/80 shrink-0" />
				<div className="min-w-0 flex-1 space-y-2">
					<div className="flex items-center gap-2">
						<div className="h-4 w-32 rounded bg-zinc-200/80 dark:bg-zinc-800/80" />
						<div className="w-3.5 h-3.5 rounded-full bg-blue-500/20" />
						<div className="h-4 w-16 rounded-md bg-zinc-100 dark:bg-zinc-800" />
					</div>
					<div className="h-3 w-3/4 max-w-md rounded bg-zinc-200/60 dark:bg-zinc-800/60" />
				</div>
			</div>
			<div className="flex items-center gap-4 shrink-0">
				<div className="hidden sm:flex items-center gap-3">
					<div className="h-3 w-12 rounded bg-zinc-200/60 dark:bg-zinc-800/60" />
					<div className="h-3 w-10 rounded bg-zinc-200/50 dark:bg-zinc-800/50" />
					<div className="h-3 w-16 rounded bg-zinc-200/50 dark:bg-zinc-800/50" />
				</div>
				<div className="w-7 h-7 rounded-lg bg-zinc-200/50 dark:bg-zinc-800/50" />
			</div>
		</div>
	);
}

/**
 * Skeleton for SkillsHeaderBar matching tab switcher, filter dropdowns, action buttons and search input.
 */
export function SkillsHeaderBarSkeleton() {
	return (
		<div className="space-y-4 mb-6 animate-pulse">
			{/* Top Control Bar: Tabs on left, dropdowns & actions on right */}
			<div className="flex flex-wrap items-center justify-between gap-3 pt-2">
				{/* Tabs */}
				<div className="flex items-center gap-1.5">
					<div className="h-7 w-16 rounded-lg bg-zinc-200/90 dark:bg-zinc-800/90" />
					<div className="h-7 w-20 rounded-lg bg-zinc-200/50 dark:bg-zinc-800/50" />
					<div className="h-7 w-20 rounded-lg bg-zinc-200/50 dark:bg-zinc-800/50" />
				</div>

				{/* Right Filters & View Switcher */}
				<div className="flex flex-wrap items-center gap-2">
					<div className="h-8 w-24 rounded-lg bg-zinc-200/60 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-800" />
					<div className="h-8 w-28 rounded-lg bg-zinc-200/60 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-800" />
					<div className="h-8 w-24 rounded-lg bg-zinc-200/60 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-800" />
					<div className="h-8 w-24 rounded-lg bg-zinc-900/80 dark:bg-zinc-100/80" />
					<div className="h-8 w-8 rounded-lg bg-zinc-200/60 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-800" />
					<div className="h-8 w-16 rounded-lg bg-zinc-200/50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-800" />
				</div>
			</div>

			{/* Full-width Search Bar */}
			<div className="h-10 w-full rounded-xl bg-zinc-200/50 dark:bg-zinc-800/50 border border-zinc-200/80 dark:border-zinc-800" />
		</div>
	);
}

/**
 * Grid layout skeleton for Skills cards.
 */
export function SkillsGridSkeleton({ count = 6 }: { count?: number }) {
	return (
		<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
			{Array.from({ length: count }, (_, i) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: skeleton placeholders are static
				<SkillsCardSkeleton key={`skills-skel-card-${i}`} />
			))}
		</div>
	);
}

/**
 * List layout skeleton for Skills list items.
 */
export function SkillsListSkeleton({ count = 6 }: { count?: number }) {
	return (
		<div className="space-y-3">
			{Array.from({ length: count }, (_, i) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: skeleton placeholders are static
				<SkillsListItemSkeleton key={`skills-skel-item-${i}`} />
			))}
		</div>
	);
}

/**
 * Full page skeleton placeholder for Skills route pending state.
 * Faithfully matches SkillsApp layout: WorkbenchHeader + SkillsHeaderBar + SkillsGrid.
 */
export function SkillsSkeleton() {
	return (
		<div className="h-full bg-[#fcfcfd] dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 flex flex-col overflow-hidden">
			<main className="flex-1 overflow-y-auto">
				<div className="max-w-6xl mx-auto px-6 py-4">
					<SkillsHeaderBarSkeleton />
					<SkillsGridSkeleton count={6} />
				</div>
			</main>
		</div>
	);
}
