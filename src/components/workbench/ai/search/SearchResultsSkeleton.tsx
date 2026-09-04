import { Skeleton } from "@heroui/react";

/**
 * Structured loading skeleton that mirrors the SearchResultItemRow layout,
 * so the panel doesn't "jump" when real results arrive.
 */
export function SearchResultsSkeleton({ rows = 3 }: { rows?: number }) {
	return (
		<div className="space-y-2.5 py-1" aria-hidden>
			{Array.from({ length: rows }, (_, i) => `skeleton-row-${i}`).map((key) => (
				<div
					key={key}
					className="p-2.5 rounded-xl border border-border/70 bg-surface flex items-start gap-2.5"
				>
					{/* Checkbox */}
					<Skeleton className="w-3.5 h-3.5 rounded mt-1 shrink-0" />

					{/* Favicon */}
					<Skeleton className="w-7 h-7 rounded-lg shrink-0 mt-0.5" />

					{/* Text block */}
					<div className="flex-1 min-w-0 space-y-1.5 pt-0.5">
						<Skeleton className="h-3.5 w-3/5 rounded" />
						<Skeleton className="h-2.5 w-full rounded" />
						<Skeleton className="h-2.5 w-4/5 rounded" />
						<Skeleton className="h-2 w-1/2 rounded" />
						<div className="flex items-center gap-1.5 pt-0.5">
							<Skeleton className="h-3.5 w-14 rounded" />
							<Skeleton className="h-3.5 w-10 rounded" />
						</div>
					</div>

					{/* Right column: similarity badge + action */}
					<div className="flex flex-col items-end justify-between self-stretch shrink-0">
						<Skeleton className="h-4 w-9 rounded-full" />
						<Skeleton className="h-6 w-6 rounded-lg" />
					</div>
				</div>
			))}
		</div>
	);
}
