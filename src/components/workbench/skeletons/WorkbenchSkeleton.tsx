import { ChatWithBookmarksSkeleton } from "./ChatWithBookmarksSkeleton";
import { FolderDetailSkeleton } from "./FolderDetailSkeleton";
import { FolderGridSkeleton } from "./FolderGridSkeleton";

/**
 * Full page skeleton placeholder for AI Workbench route pending state.
 * Adaptively renders 2-column or 3-column layout based on active category in sessionStorage.
 */
export function WorkbenchSkeleton() {
	const isUnclassified =
		typeof window !== "undefined" &&
		sessionStorage.getItem("aiworkstation_active_category") === "未分类";

	return (
		<div className="h-screen bg-background text-foreground flex flex-col overflow-hidden selection:bg-accent-soft selection:text-accent-soft-foreground">
			{/* Top Header Skeleton */}
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

			{/* Main Workspace Layout */}
			<div className="flex-1 flex w-full min-h-0 overflow-hidden">
				{isUnclassified ? (
					/* Unclassified 2-column skeleton */
					<main className="flex-1 p-6 lg:p-8 min-w-0 flex flex-col overflow-y-auto border-r border-border h-full">
						<div className="space-y-2 mb-6">
							<div className="w-40 h-8 rounded-lg bg-surface-secondary/70 animate-pulse" />
							<div className="w-80 h-3.5 rounded bg-surface-secondary/40 animate-pulse" />
						</div>
						{/* Banner Skeleton */}
						<div className="w-full h-16 rounded-2xl bg-surface-secondary/50 animate-pulse mb-6" />
						{/* Grid Skeleton */}
						<div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-2.5">
							{Array.from({ length: 15 }).map((_, idx) => (
								<div
									// biome-ignore lint/suspicious/noArrayIndexKey: skeleton placeholders are static
									key={idx}
									className="h-28 rounded-xl bg-surface-secondary/40 animate-pulse border border-border/40"
								/>
							))}
						</div>
					</main>
				) : (
					/* Workbench 3-column skeleton */
					<>
						<FolderDetailSkeleton />
						<main className="flex-1 p-6 lg:p-7 min-w-0 flex flex-col overflow-y-auto h-full">
							<div className="space-y-2 mb-6">
								<div className="w-32 h-7 rounded-lg bg-surface-secondary/70 animate-pulse" />
								<div className="w-64 h-3.5 rounded bg-surface-secondary/40 animate-pulse" />
							</div>
							<FolderGridSkeleton count={8} />
						</main>
					</>
				)}

				{/* Right Column Skeleton (Permanent) */}
				<ChatWithBookmarksSkeleton />
			</div>
		</div>
	);
}
