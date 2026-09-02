import { Card } from "@heroui/react";

/**
 * Skeleton placeholder for Folder Detail Left Panel
 */
export function FolderDetailSkeleton() {
	return (
		<aside className="w-[280px] xl:w-[310px] 2xl:w-[330px] shrink-0 bg-surface/95 backdrop-blur-md border-r border-border flex flex-col h-[calc(100vh-60px)] sticky top-[60px] p-3.5 space-y-4 animate-pulse">
			{/* Category switcher strip skeleton */}
			<div className="flex items-center gap-1 pb-2 border-b border-border/60 overflow-hidden">
				<div className="w-16 h-6 rounded-lg bg-surface-secondary/70 shrink-0" />
				<div className="w-20 h-6 rounded-lg bg-surface-secondary/50 shrink-0" />
				<div className="w-16 h-6 rounded-lg bg-surface-secondary/40 shrink-0" />
			</div>

			{/* Folder Header Card skeleton */}
			<Card className="p-3.5 rounded-2xl bg-surface-secondary/40 border border-border/60 flex flex-col gap-2.5 shadow-none">
				<div className="flex items-start gap-2.5">
					<div className="w-9 h-9 rounded-xl bg-surface-secondary/80 shrink-0" />
					<div className="flex-1 space-y-1.5 pt-0.5">
						<div className="w-3/4 h-4 rounded bg-surface-secondary/80" />
						<div className="w-1/2 h-3 rounded bg-surface-secondary/50" />
					</div>
				</div>
				<div className="w-full h-7 rounded-xl bg-surface-secondary/60 mt-1" />
			</Card>

			{/* 8-Grid Preview skeleton */}
			<div className="space-y-2">
				<div className="flex items-center justify-between">
					<div className="w-20 h-3 rounded bg-surface-secondary/70" />
					<div className="w-8 h-3 rounded bg-surface-secondary/40" />
				</div>
				<div className="grid grid-cols-4 gap-1.5">
					{Array.from({ length: 8 }, (_, i) => (
						<div
							key={`grid-prev-skel-${i}`}
							className="aspect-square rounded-xl bg-surface-secondary/50 border border-border/40"
						/>
					))}
				</div>
			</div>

			{/* Item list skeleton items */}
			<div className="space-y-2 pt-2 border-t border-border/40 flex-1">
				<div className="flex items-center justify-between pb-1">
					<div className="w-24 h-3.5 rounded bg-surface-secondary/70" />
					<div className="w-8 h-3 rounded bg-surface-secondary/40" />
				</div>
				{Array.from({ length: 3 }, (_, i) => (
					<div
						key={`item-skel-${i}`}
						className="p-3 rounded-xl bg-surface-secondary/30 border border-border/50 space-y-2"
					>
						<div className="flex items-center gap-2">
							<div className="w-6 h-6 rounded-lg bg-surface-secondary/80 shrink-0" />
							<div className="w-2/3 h-3.5 rounded bg-surface-secondary/70" />
						</div>
						<div className="w-5/6 h-2.5 rounded bg-surface-secondary/40" />
					</div>
				))}
			</div>
		</aside>
	);
}
