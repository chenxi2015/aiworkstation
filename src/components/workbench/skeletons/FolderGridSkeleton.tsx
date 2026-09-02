import { Card } from "@heroui/react";

interface FolderGridSkeletonProps {
	count?: number;
}

/**
 * Skeleton placeholder for Category Folders Grid
 */
export function FolderGridSkeleton({ count = 8 }: FolderGridSkeletonProps) {
	const items = Array.from({ length: count }, (_, i) => i);

	return (
		<div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3.5">
			{items.map((i) => (
				<Card
					key={`grid-skel-${i}`}
					className="p-4 rounded-2xl bg-surface-secondary/40 border border-border/60 flex flex-col gap-3 shadow-none animate-pulse"
				>
					<div className="flex items-center justify-between">
						<div className="w-10 h-10 rounded-xl bg-surface-secondary/80" />
						<div className="w-12 h-5 rounded-full bg-surface-secondary/60" />
					</div>
					<div className="space-y-1.5 pt-1">
						<div className="w-3/4 h-4 rounded-md bg-surface-secondary/80" />
						<div className="w-1/2 h-3 rounded-md bg-surface-secondary/50" />
					</div>
					<div className="pt-2 border-t border-border/40 flex items-center justify-between">
						<div className="w-16 h-3 rounded-md bg-surface-secondary/50" />
						<div className="w-6 h-3 rounded-md bg-surface-secondary/40" />
					</div>
				</Card>
			))}
		</div>
	);
}
