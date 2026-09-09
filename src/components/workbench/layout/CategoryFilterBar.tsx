import { useDroppable } from "@dnd-kit/react";
import { memo, useMemo } from "react";
import {
	ALL_CATEGORY,
	resolveCategoryLabel,
	UNCLASSIFIED_CATEGORY,
} from "../../../modules/registry";
import { categoryDropId } from "../dnd/dndUtils";
import type { Category, Folder } from "../types";

export interface CategoryFilterBarProps {
	categories: string[];
	activeCategory: Category;
	unclassifiedCount: number;
	folders: Folder[];
	onSelectCategory: (category: Category) => void;
}

interface FilterChipProps {
	value: string;
	label: string;
	isActive: boolean;
	count: number;
	isUnclassified?: boolean;
	droppable?: boolean;
	onSelect: () => void;
}

/**
 * Individual filter chip — also a droppable target for moving folders into a category
 */
const FilterChip = memo(function FilterChip({
	value,
	label,
	isActive,
	count,
	isUnclassified = false,
	droppable = true,
	onSelect,
}: FilterChipProps) {
	const { ref, isDropTarget } = useDroppable({
		id: categoryDropId(value),
		disabled: !droppable,
		data: { category: value },
	});

	return (
		<button
			ref={ref}
			type="button"
			onClick={onSelect}
			className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-all duration-150 flex items-center gap-1.5 cursor-pointer select-none ${
				isDropTarget
					? "bg-accent text-accent-foreground font-semibold shadow-md ring-2 ring-accent/80 scale-105"
					: isActive
						? "bg-accent-soft text-accent font-semibold shadow-xs"
						: "text-muted hover:text-foreground hover:bg-surface-secondary"
			}`}
		>
			<span>{label}</span>
			{count > 0 && (
				<span
					className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono transition-colors ${
						isDropTarget
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
 * In-page category filter for the 书签 module: 全部 / 未分类 / dynamic groupings.
 * Categories are a data dimension here, not top-level navigation.
 */
export const CategoryFilterBar = memo(function CategoryFilterBar({
	categories,
	activeCategory,
	unclassifiedCount,
	folders,
	onSelectCategory,
}: CategoryFilterBarProps) {
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
		<div className="shrink-0 border-b border-border bg-surface/60 backdrop-blur-sm px-6 py-1.5 flex items-center gap-1 overflow-x-auto no-scrollbar">
			<FilterChip
				value={ALL_CATEGORY}
				label={ALL_CATEGORY}
				isActive={activeCategory === ALL_CATEGORY}
				count={folders.length}
				droppable={false}
				onSelect={() => onSelectCategory(ALL_CATEGORY)}
			/>
			<FilterChip
				value={UNCLASSIFIED_CATEGORY}
				label={UNCLASSIFIED_CATEGORY}
				isActive={activeCategory === UNCLASSIFIED_CATEGORY}
				count={unclassifiedCount}
				isUnclassified
				droppable={false}
				onSelect={() => onSelectCategory(UNCLASSIFIED_CATEGORY)}
			/>
			<div className="w-px h-4 bg-border mx-1 shrink-0" />
			{categories.map((cat) => {
				if (cat === UNCLASSIFIED_CATEGORY) return null;
				const count = folderCountMap.get(cat) || 0;
				// Hide empty groupings unless currently active
				if (count === 0 && cat !== activeCategory) return null;
				return (
					<FilterChip
						key={cat}
						value={cat}
						label={resolveCategoryLabel(cat)}
						isActive={cat === activeCategory}
						count={count}
						onSelect={() => onSelectCategory(cat)}
					/>
				);
			})}
		</div>
	);
});
