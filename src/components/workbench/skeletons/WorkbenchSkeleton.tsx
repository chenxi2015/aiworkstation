import { FolderDetailSkeleton } from "./FolderDetailSkeleton";
import { FolderGridSkeleton } from "./FolderGridSkeleton";
import { HeaderSkeleton } from "./HeaderSkeleton";

/**
 * Full page skeleton placeholder for AI Workbench route pending state.
 * Adaptively renders 2-column or 3-column layout based on active category in sessionStorage.
 */
export function WorkbenchSkeleton() {
	let isUnclassified = false;
	if (typeof window !== "undefined") {
		try {
			const match = document.cookie.match(
				/(?:^|;\s*)aiworkstation_active_category=([^;]+)/,
			);
			const cookieVal = match ? decodeURIComponent(match[1]) : null;
			isUnclassified =
				cookieVal === "未分类" ||
				sessionStorage.getItem("aiworkstation_active_category") === "未分类" ||
				localStorage.getItem("aiworkstation_active_category") === "未分类";
		} catch {
			// Ignore access restrictions
		}
	}

	return (
		<div className="h-screen bg-background text-foreground flex flex-col overflow-hidden selection:bg-accent-soft selection:text-accent-soft-foreground">
			{/* Top Header Skeleton */}
			<HeaderSkeleton />

			{/* Main Workspace Layout */}
			<div className="flex-1 flex w-full min-h-0 overflow-hidden">
				{isUnclassified ? (
					/* Unclassified 2-column skeleton */
					<main className="flex-1 p-6 lg:p-8 min-w-0 flex flex-col overflow-y-auto h-full">
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
			</div>
		</div>
	);
}
