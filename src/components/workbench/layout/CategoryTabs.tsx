import { useDroppable } from "@dnd-kit/core";
import { memo, useMemo } from "react";
import { categoryDropId } from "../dnd/dndUtils";
import type { Category, Folder } from "../types";

export interface CategoryTabsProps {
	categories: string[];
	activeCategory: Category;
	unclassifiedCount: number;
	folders: Folder[];
	onSelectCategory: (category: Category) => void;
}

interface CategoryTabItemProps {
	category: string;
	isActive: boolean;
	count: number;
	onSelect: () => void;
}

/**
 * Individual category tab item that acts as a droppable target for folders
 */
const CategoryTabItem = memo(function CategoryTabItem({
	category,
	isActive,
	count,
	onSelect,
}: CategoryTabItemProps) {
	const isUnclassified = category === "未分类";
	const { setNodeRef, isOver } = useDroppable({
		id: categoryDropId(category),
		disabled: isUnclassified,
		data: { category },
	});

	return (
		<button
			ref={setNodeRef}
			type="button"
			onClick={onSelect}
			className={`px-3.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all duration-150 flex items-center gap-1.5 cursor-pointer select-none ${
				isOver
					? "bg-accent text-accent-foreground font-semibold shadow-md ring-2 ring-accent/80 scale-105"
					: isActive
						? "bg-accent-soft text-accent font-semibold shadow-xs"
						: "text-muted hover:text-foreground hover:bg-surface-secondary"
			}`}
		>
			<span>{category}</span>
			{count > 0 && (
				<span
					className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono transition-colors ${
						isOver
							? "bg-accent-foreground/20 text-accent-foreground font-bold"
							: isUnclassified
								? "bg-danger/15 text-danger font-bold"
								: isActive
									? "bg-accent/20 text-accent"
									: "bg-surface-secondary text-muted"
					}`}
				>
					{count}
				</span>
			)}
		</button>
	);
});

/**
 * Dynamic Category Navigation Pills with item count badges and Dnd droppable support
 */
export const CategoryTabs = memo(function CategoryTabs({
	categories,
	activeCategory,
	unclassifiedCount,
	folders,
	onSelectCategory,
}: CategoryTabsProps) {
	// Precompute folder counts per category once to avoid O(M*N) filtering in JSX loop
	const folderCountMap = useMemo(() => {
		const map = new Map<string, number>();
		for (const f of folders) {
			if (f.category) {
				map.set(f.category, (map.get(f.category) || 0) + 1);
			}
		}
		return map;
	}, [folders]);

	return (
		<nav className="flex items-center gap-1 overflow-x-auto no-scrollbar flex-1 py-1 px-2">
			{categories.map((cat) => {
				const isActive = cat === activeCategory;
				const count =
					cat === "未分类" ? unclassifiedCount : folderCountMap.get(cat) || 0;

				// Hide empty categories unless active or standard
				if (count === 0 && !["工作台", "未分类"].includes(cat) && !isActive) {
					return null;
				}

				return (
					<CategoryTabItem
						key={cat}
						category={cat}
						isActive={isActive}
						count={count}
						onSelect={() => onSelectCategory(cat)}
					/>
				);
			})}
		</nav>
	);
});
