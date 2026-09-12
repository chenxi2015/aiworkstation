import { Skeleton } from "@heroui/react";
import { HeaderSkeleton } from "./HeaderSkeleton";

/**
 * Editor canvas placeholder showing header, toolbar, content lines and status bar.
 * Reusable both in the full page route skeleton and in EditorApp during document fetch.
 */
export function EditorCanvasSkeleton() {
	return (
		<div className="flex-1 flex flex-col min-w-0 min-h-0 bg-surface dark:bg-background overflow-hidden">
			{/* Top Document Header Skeleton */}
			<div className="shrink-0 px-8 pt-4 pb-2 border-b border-border/40 flex items-center justify-between gap-3">
				<div className="flex items-center gap-2 flex-1 min-w-0">
					<Skeleton className="w-8 h-4 rounded" />
					<Skeleton className="h-6 w-52 sm:w-72 rounded-lg" />
					<Skeleton className="w-4 h-4 rounded" />
				</div>
				<div className="flex items-center gap-2 shrink-0">
					<Skeleton className="w-24 h-7 rounded-lg hidden sm:block" />
					<Skeleton className="w-14 h-5 rounded-full" />
					<Skeleton className="w-7 h-7 rounded-lg" />
				</div>
			</div>

			{/* TipTap Editor Toolbar Skeleton */}
			<div className="shrink-0 px-8 py-2 border-b border-border/40 flex items-center gap-1.5 flex-wrap bg-surface-secondary/20">
				<Skeleton className="w-6 h-6 rounded" />
				<Skeleton className="w-6 h-6 rounded" />
				<div className="w-px h-4 bg-border/60 mx-1" />
				<Skeleton className="w-6 h-6 rounded" />
				<Skeleton className="w-6 h-6 rounded" />
				<Skeleton className="w-6 h-6 rounded" />
				<div className="w-px h-4 bg-border/60 mx-1" />
				<Skeleton className="w-12 h-6 rounded" />
				<Skeleton className="w-12 h-6 rounded" />
				<div className="w-px h-4 bg-border/60 mx-1" />
				<Skeleton className="w-6 h-6 rounded" />
				<Skeleton className="w-6 h-6 rounded" />
				<Skeleton className="w-6 h-6 rounded" />
				<div className="w-px h-4 bg-border/60 mx-1" />
				<Skeleton className="w-20 h-6 rounded-full ml-auto" />
			</div>

			{/* Editor Content Area Skeleton */}
			<div className="flex-1 overflow-y-auto px-8 py-8">
				<div className="max-w-3xl mx-auto space-y-6">
					{/* Article Title Placeholder */}
					<div className="space-y-2">
						<Skeleton className="h-8 w-4/5 rounded-lg" />
						<Skeleton className="h-4 w-1/3 rounded" />
					</div>

					{/* Paragraph 1 */}
					<div className="space-y-2.5 pt-2">
						<Skeleton className="h-3.5 w-full rounded" />
						<Skeleton className="h-3.5 w-11/12 rounded" />
						<Skeleton className="h-3.5 w-4/5 rounded" />
						<Skeleton className="h-3.5 w-3/4 rounded" />
					</div>

					{/* Section Heading */}
					<div className="pt-2">
						<Skeleton className="h-5 w-48 rounded" />
					</div>

					{/* Paragraph 2 */}
					<div className="space-y-2.5">
						<Skeleton className="h-3.5 w-full rounded" />
						<Skeleton className="h-3.5 w-5/6 rounded" />
						<Skeleton className="h-3.5 w-11/12 rounded" />
						<Skeleton className="h-3.5 w-2/3 rounded" />
					</div>

					{/* Blockquote / Callout card placeholder */}
					<div className="p-4 rounded-xl border-l-4 border-accent/40 bg-surface-secondary/20 space-y-2">
						<Skeleton className="h-3 w-3/4 rounded" />
						<Skeleton className="h-3 w-1/2 rounded" />
					</div>

					{/* Paragraph 3 */}
					<div className="space-y-2.5">
						<Skeleton className="h-3.5 w-full rounded" />
						<Skeleton className="h-3.5 w-4/5 rounded" />
						<Skeleton className="h-3.5 w-3/5 rounded" />
					</div>
				</div>
			</div>

			{/* Bottom Action Bar Skeleton */}
			<div className="shrink-0 border-t border-border/60 bg-surface/60 px-4 py-2 flex items-center justify-between gap-2">
				<div className="flex items-center gap-2">
					<Skeleton className="w-16 h-3 rounded" />
					<div className="w-2 h-2 rounded-full bg-surface-secondary/30" />
					<Skeleton className="w-20 h-3 rounded" />
				</div>
				<div className="flex items-center gap-1.5">
					<Skeleton className="w-16 h-6 rounded" />
					<Skeleton className="w-16 h-6 rounded" />
					<Skeleton className="w-16 h-6 rounded" />
				</div>
			</div>
		</div>
	);
}

/**
 * Sidebar document list skeleton matching DocumentSidebar.
 */
export function DocumentSidebarSkeleton() {
	return (
		<aside className="w-64 shrink-0 border-r border-border bg-surface flex flex-col min-h-0">
			{/* Search & Action Buttons Placeholder */}
			<div className="p-3 border-b border-border space-y-2">
				<Skeleton className="h-7 w-full rounded-lg" />
				<div className="flex items-center gap-2">
					<Skeleton className="flex-1 h-7 rounded-lg" />
					<Skeleton className="w-14 h-7 rounded-lg" />
				</div>
			</div>

			{/* Document items list placeholder */}
			<div className="flex-1 p-2 space-y-1.5 overflow-hidden">
				{Array.from({ length: 7 }).map((_, idx) => (
					<div
						// biome-ignore lint/suspicious/noArrayIndexKey: static skeleton keys
						key={idx}
						className={`w-full px-3 py-2.5 rounded-lg border border-border/30 bg-surface-secondary/20 space-y-2 ${
							idx === 0 ? "border-accent/30 bg-accent/5" : ""
						}`}
					>
						<div className="flex items-center justify-between gap-2">
							<Skeleton
								className={`h-3.5 rounded ${
									idx === 0 ? "w-3/4" : idx % 2 === 0 ? "w-4/5" : "w-3/5"
								}`}
							/>
							<Skeleton className="w-8 h-2.5 rounded shrink-0" />
						</div>
						<div className="flex items-center justify-between gap-2">
							<Skeleton className="w-20 h-2.5 rounded" />
							<Skeleton className="w-10 h-2.5 rounded" />
						</div>
					</div>
				))}
			</div>
		</aside>
	);
}

/**
 * Complete route-level skeleton for the creation (editor) module.
 * Accurately mimics the 2-column layout (Sidebar + Canvas) preventing visual shift.
 */
export function EditorSkeleton() {
	return (
		<div className="h-screen bg-surface dark:bg-background text-foreground flex flex-col overflow-hidden selection:bg-accent-soft selection:text-accent-soft-foreground">
			<HeaderSkeleton />
			<main className="flex-1 overflow-hidden flex min-h-0">
				<DocumentSidebarSkeleton />
				<EditorCanvasSkeleton />
			</main>
		</div>
	);
}
