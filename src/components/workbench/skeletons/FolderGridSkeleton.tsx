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
					className="p-3 rounded-2xl bg-surface-secondary/40 border border-border/60 flex flex-col gap-2 shadow-none animate-pulse"
				>
					<div className="flex items-center justify-between">
						<div className="w-10 h-10 rounded-[12px] bg-surface-secondary/80" />
						<div className="w-8 h-4 rounded-full bg-surface-secondary/60" />
					</div>
					<div className="space-y-1 pt-0.5">
						<div className="w-3/4 h-3.5 rounded-md bg-surface-secondary/80" />
						<div className="w-1/2 h-2.5 rounded-md bg-surface-secondary/50" />
					</div>
					<div className="pt-1 flex items-center justify-between">
						<div className="w-14 h-3 rounded-md bg-surface-secondary/50" />
					</div>
				</Card>
			))}
		</div>
	);
}
