import { ChevronLeft, ChevronRight } from "lucide-react";
import { type FC, useMemo } from "react";

export interface DrawerPaginationProps {
	currentPage: number;
	totalPages: number;
	totalItems: number;
	pageSize?: number;
	onPageChange: (page: number) => void;
	className?: string;
}

/**
 * Reusable, compact pagination controller designed for in-drawer and sidebar lists.
 */
export const DrawerPagination: FC<DrawerPaginationProps> = ({
	currentPage,
	totalPages,
	totalItems,
	onPageChange,
	className = "",
}) => {
	// Generate visible page numbers with smart ellipsis window
	const pageNumbers = useMemo(() => {
		if (totalPages <= 5) {
			return Array.from({ length: totalPages }, (_, i) => i + 1);
		}

		const pages: (number | "ellipsis")[] = [];
		if (currentPage <= 3) {
			pages.push(1, 2, 3, 4, "ellipsis", totalPages);
		} else if (currentPage >= totalPages - 2) {
			pages.push(
				1,
				"ellipsis",
				totalPages - 3,
				totalPages - 2,
				totalPages - 1,
				totalPages,
			);
		} else {
			pages.push(
				1,
				"ellipsis",
				currentPage - 1,
				currentPage,
				currentPage + 1,
				"ellipsis",
				totalPages,
			);
		}
		return pages;
	}, [currentPage, totalPages]);

	if (totalPages <= 1) {
		return null;
	}

	return (
		<div
			className={`px-3 py-1.5 border-t border-border/70 bg-surface-secondary/40 shrink-0 flex items-center justify-between select-none ${className}`}
		>
			{/* Left: Summary text */}
			<div className="text-[11px] text-muted flex items-center gap-1">
				<span>第</span>
				<span className="font-semibold text-foreground">{currentPage}</span>
				<span>/ {totalPages} 页</span>
				<span className="text-[10px] text-muted/70">({totalItems} 条)</span>
			</div>

			{/* Right: Page Navigation Controls */}
			<div className="flex items-center gap-1">
				{/* Previous page button */}
				<button
					type="button"
					disabled={currentPage <= 1}
					onClick={() => onPageChange(currentPage - 1)}
					className="h-6 w-6 rounded-md flex items-center justify-center text-muted hover:text-foreground hover:bg-surface border border-transparent hover:border-border/60 disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
					aria-label="上一页"
					title="上一页"
				>
					<ChevronLeft className="w-3.5 h-3.5" />
				</button>

				{/* Page number buttons */}
				<div className="flex items-center gap-0.5">
					{pageNumbers.map((item, idx) => {
						if (item === "ellipsis") {
							return (
								<span
									key={`ellipsis-${idx}`}
									className="w-4 text-center text-muted text-[10px]"
								>
									…
								</span>
							);
						}

						const isActive = item === currentPage;
						return (
							<button
								key={`page-${item}`}
								type="button"
								onClick={() => onPageChange(item)}
								aria-current={isActive ? "page" : undefined}
								className={`h-6 min-w-6 px-1.5 rounded-md text-[11px] font-medium flex items-center justify-center transition-colors cursor-pointer ${
									isActive
										? "bg-accent text-accent-foreground shadow-xs font-semibold"
										: "text-muted hover:text-foreground hover:bg-surface border border-transparent hover:border-border/60"
								}`}
							>
								{item}
							</button>
						);
					})}
				</div>

				{/* Next page button */}
				<button
					type="button"
					disabled={currentPage >= totalPages}
					onClick={() => onPageChange(currentPage + 1)}
					className="h-6 w-6 rounded-md flex items-center justify-center text-muted hover:text-foreground hover:bg-surface border border-transparent hover:border-border/60 disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
					aria-label="下一页"
					title="下一页"
				>
					<ChevronRight className="w-3.5 h-3.5" />
				</button>
			</div>
		</div>
	);
};

