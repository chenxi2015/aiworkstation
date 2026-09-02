import { CapsuleBannerSkeleton } from "./CapsuleBannerSkeleton";
import { ChatWithBookmarksSkeleton } from "./ChatWithBookmarksSkeleton";
import { FolderDetailSkeleton } from "./FolderDetailSkeleton";
import { FolderGridSkeleton } from "./FolderGridSkeleton";

/**
 * Full page skeleton placeholder for AI Workbench route pending state
 */
export function WorkbenchSkeleton() {
	return (
		<div className="min-h-screen bg-background text-foreground flex flex-col selection:bg-accent-soft selection:text-accent-soft-foreground">
			{/* Top Header Skeleton */}
			<header className="sticky top-0 z-40 bg-surface/80 border-b border-border px-6 h-15 flex items-center gap-4 justify-between backdrop-blur-md animate-pulse">
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

			{/* Main Workspace Layout (Left: Folder Details | Center: Grid | Right: Resident AI Search Hub) */}
			<div className="flex-1 flex w-full">
				{/* 1. Left Column Skeleton */}
				<FolderDetailSkeleton />

				{/* 2. Center Column Skeleton */}
				<main className="flex-1 p-6 lg:p-7 min-w-0 flex flex-col overflow-y-auto">
					<CapsuleBannerSkeleton />
					<div className="space-y-2 mb-6">
						<div className="w-32 h-7 rounded-lg bg-surface-secondary/70 animate-pulse" />
						<div className="w-64 h-3.5 rounded bg-surface-secondary/40 animate-pulse" />
					</div>
					<FolderGridSkeleton count={8} />
				</main>

				{/* 3. Right Column Skeleton */}
				<ChatWithBookmarksSkeleton />
			</div>
		</div>
	);
}
