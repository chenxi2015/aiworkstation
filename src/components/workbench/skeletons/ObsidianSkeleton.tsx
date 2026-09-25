import { Skeleton } from "@heroui/react";

/** Mock tree items for rendering realistic hierarchical directory tree skeleton */
const TREE_SKELETON_ITEMS = [
	{ depth: 0, isDir: true, width: "w-24" },
	{ depth: 1, isDir: true, width: "w-20" },
	{ depth: 2, isDir: false, width: "w-28" },
	{ depth: 2, isDir: false, width: "w-32" },
	{ depth: 1, isDir: false, width: "w-24" },
	{ depth: 0, isDir: true, width: "w-28" },
	{ depth: 1, isDir: false, width: "w-36" },
	{ depth: 1, isDir: false, width: "w-24" },
	{ depth: 0, isDir: false, width: "w-32" },
	{ depth: 0, isDir: false, width: "w-20" },
	{ depth: 0, isDir: false, width: "w-28" },
] as const;

/**
 * Obsidian sidebar tree skeleton mimicking search, action tools,
 * indented tree nodes, and bottom vault switcher.
 */
export function ObsidianTreeSkeleton({ width }: { width?: number }) {
	const defaultWidth = 300;
	let resolvedWidth = width ?? defaultWidth;

	if (width === undefined && typeof window !== "undefined") {
		try {
			const saved = Number(localStorage.getItem("obsidian_sidebar_width"));
			if (saved >= 240 && saved <= 600) {
				resolvedWidth = saved;
			}
		} catch {}
	}

	return (
		<aside
			style={{ width: `${resolvedWidth}px` }}
			className="relative shrink-0 border-r border-border flex flex-col overflow-hidden bg-surface"
		>
			{/* Top: search input & action buttons */}
			<div className="px-2.5 pt-2.5 pb-1.5 space-y-1.5 shrink-0">
				<Skeleton className="h-7 w-full rounded-lg" />
				<div className="flex items-center justify-between px-1">
					<Skeleton className="w-8 h-3.5 rounded" />
					<div className="flex items-center gap-1">
						<Skeleton className="w-5 h-5 rounded-md" />
						<Skeleton className="w-5 h-5 rounded-md" />
						<Skeleton className="w-5 h-5 rounded-md" />
						<Skeleton className="w-5 h-5 rounded-md" />
						<Skeleton className="w-5 h-5 rounded-md" />
					</div>
				</div>
			</div>

			{/* Tree nodes list */}
			<div className="flex-1 overflow-y-auto px-1.5 py-1 space-y-1">
				{TREE_SKELETON_ITEMS.map((item, idx) => {
					const paddingLeft = `${item.depth * 14 + 6}px`;
					return (
						<div
							// biome-ignore lint/suspicious/noArrayIndexKey: static skeleton keys
							key={idx}
							style={{ paddingLeft }}
							className="flex items-center gap-2 py-1 pr-2 rounded-md"
						>
							{item.isDir ? (
								<>
									<Skeleton className="w-3 h-3 rounded shrink-0" />
									<Skeleton className="w-3.5 h-3.5 rounded shrink-0" />
								</>
							) : (
								<>
									<div className="w-3 shrink-0" />
									<Skeleton className="w-3.5 h-3.5 rounded shrink-0" />
								</>
							)}
							<Skeleton className={`h-3.5 ${item.width} rounded`} />
						</div>
					);
				})}
			</div>

			{/* Bottom: Vault Switcher bar */}
			<div className="border-t border-border shrink-0 px-3 py-2.5 flex items-center justify-between gap-2 bg-surface">
				<div className="flex items-center gap-2 min-w-0 flex-1">
					<Skeleton className="w-3.5 h-3.5 rounded shrink-0" />
					<Skeleton className="w-24 h-3.5 rounded" />
				</div>
				<Skeleton className="w-3.5 h-3.5 rounded shrink-0" />
			</div>
		</aside>
	);
}

/**
 * Obsidian note markdown content skeleton matching the 760px centered reading width.
 * Reusable both inside NotePanel during note fetch and in the full canvas skeleton.
 */
export function ObsidianNoteBodySkeleton() {
	return (
		<div className="h-full overflow-y-auto px-6 py-5">
			<div className="max-w-[760px] mx-auto space-y-6">
				{/* Note Title (H1) */}
				<div className="space-y-2">
					<Skeleton className="h-8 w-3/5 rounded-lg" />
					{/* Frontmatter tags / metadata pill placeholders */}
					<div className="flex items-center gap-2 pt-1">
						<Skeleton className="h-4 w-12 rounded-full" />
						<Skeleton className="h-4 w-16 rounded-full" />
						<Skeleton className="h-4 w-20 rounded-full" />
					</div>
				</div>

				{/* Paragraph 1 */}
				<div className="space-y-2.5 pt-2">
					<Skeleton className="h-3.5 w-full rounded" />
					<Skeleton className="h-3.5 w-11/12 rounded" />
					<Skeleton className="h-3.5 w-4/5 rounded" />
					<Skeleton className="h-3.5 w-3/4 rounded" />
				</div>

				{/* Section Heading (H2) */}
				<div className="pt-2">
					<Skeleton className="h-6 w-44 rounded-md" />
				</div>

				{/* Paragraph 2 */}
				<div className="space-y-2.5">
					<Skeleton className="h-3.5 w-full rounded" />
					<Skeleton className="h-3.5 w-5/6 rounded" />
					<Skeleton className="h-3.5 w-11/12 rounded" />
				</div>

				{/* Callout / Blockquote card */}
				<div className="p-4 border-l-4 border-accent/40 bg-surface-secondary/20 space-y-2 rounded-r-lg">
					<div className="flex items-center gap-2">
						<Skeleton className="w-4 h-4 rounded" />
						<Skeleton className="h-3.5 w-24 rounded" />
					</div>
					<Skeleton className="h-3 w-4/5 rounded" />
					<Skeleton className="h-3 w-3/5 rounded" />
				</div>

				{/* List items */}
				<div className="space-y-2 pl-2">
					<div className="flex items-center gap-2.5">
						<Skeleton className="w-3.5 h-3.5 rounded shrink-0" />
						<Skeleton className="h-3.5 w-2/3 rounded" />
					</div>
					<div className="flex items-center gap-2.5">
						<Skeleton className="w-3.5 h-3.5 rounded shrink-0" />
						<Skeleton className="h-3.5 w-1/2 rounded" />
					</div>
					<div className="flex items-center gap-2.5">
						<Skeleton className="w-3.5 h-3.5 rounded shrink-0" />
						<Skeleton className="h-3.5 w-3/4 rounded" />
					</div>
				</div>

				{/* Paragraph 3 */}
				<div className="space-y-2.5">
					<Skeleton className="h-3.5 w-full rounded" />
					<Skeleton className="h-3.5 w-4/5 rounded" />
				</div>
			</div>
		</div>
	);
}

/**
 * Right-side note canvas skeleton showing breadcrumb bar, body, and status bar.
 */
export function ObsidianNoteCanvasSkeleton() {
	return (
		<main className="flex-1 flex flex-col min-w-0 min-h-0 bg-surface dark:bg-background overflow-hidden">
			{/* Top breadcrumb & actions toolbar */}
			<div className="h-10 px-3 py-1.5 border-b border-border flex items-center justify-between gap-2 shrink-0 bg-surface/40">
				{/* Left: back/forward and breadcrumb path */}
				<div className="flex items-center gap-1.5 flex-1 min-w-0">
					<div className="flex items-center gap-0.5">
						<Skeleton className="w-5 h-5 rounded-md" />
						<Skeleton className="w-5 h-5 rounded-md" />
					</div>
					<div className="w-px h-3.5 bg-border/60 mx-1" />
					<div className="flex items-center gap-1.5">
						<Skeleton className="w-14 h-4 rounded" />
						<span className="text-muted/40 text-xs">/</span>
						<Skeleton className="w-24 h-4 rounded" />
					</div>
				</div>

				{/* Right: view mode & delete buttons */}
				<div className="flex items-center gap-1.5 shrink-0">
					<Skeleton className="w-6 h-6 rounded-md" />
					<Skeleton className="w-6 h-6 rounded-md" />
				</div>
			</div>

			{/* Center: Note body skeleton */}
			<div className="flex-1 overflow-hidden relative">
				<ObsidianNoteBodySkeleton />
			</div>

			{/* Bottom status bar */}
			<div className="shrink-0 border-t border-border bg-surface px-4 py-1.5 flex items-center justify-between text-[11px]">
				<Skeleton className="w-14 h-3 rounded" />
				<Skeleton className="w-16 h-3 rounded" />
			</div>
		</main>
	);
}

/**
 * Complete route-level skeleton for the Obsidian (notes) module.
 * Accurately mimics the 2-column layout (Tree Sidebar + Note Canvas) avoiding layout shift.
 */
export function ObsidianSkeleton() {
	return (
		<div className="h-full bg-surface dark:bg-background text-foreground flex flex-col overflow-hidden selection:bg-accent-soft selection:text-accent-soft-foreground">
			<div className="flex-1 flex overflow-hidden min-h-0">
				<ObsidianTreeSkeleton />
				<ObsidianNoteCanvasSkeleton />
			</div>
		</div>
	);
}
