import { Button, Chip, EmptyState, InputGroup } from "@heroui/react";
import { ChevronDown, Search, X } from "lucide-react";
import { memo, useEffect, useMemo, useState } from "react";
import { WorkbenchItemCard } from "../item/WorkbenchItemCard";
import {
	type Folder,
	ITEM_TYPES,
	type ItemType,
	type WorkbenchItem,
} from "../types";

const INITIAL_CHUNK_SIZE = 30;
const INCREMENTAL_CHUNK_SIZE = 30;

export interface FolderItemListProps {
	folder: Folder;
	allFolders?: Folder[];
	onDeleteItem?: (item: WorkbenchItem, folderId: number) => void;
	onMoveItem?: (
		item: WorkbenchItem,
		sourceFolderId: number,
		targetFolderId: number,
	) => void;
	selectedTypeFilter?: string;
	onSelectTypeFilter?: (type: string) => void;
}

/**
 * Filterable and searchable list of items inside a specific folder.
 * Uses progressive chunk rendering to ensure instant 60fps responsiveness even with 1000+ items.
 */
export const FolderItemList = memo(function FolderItemList({
	folder,
	allFolders = [],
	onDeleteItem,
	onMoveItem,
	selectedTypeFilter: controlledTypeFilter,
	onSelectTypeFilter: controlledOnSelectTypeFilter,
}: FolderItemListProps) {
	const [localSearchQuery, setLocalSearchQuery] = useState("");
	const [localTypeFilter, setLocalTypeFilter] = useState("all");
	const [visibleCount, setVisibleCount] = useState(INITIAL_CHUNK_SIZE);

	const selectedType = controlledTypeFilter ?? localTypeFilter;
	const setSelectedType = controlledOnSelectTypeFilter ?? setLocalTypeFilter;

	// Reset pagination on folder, search or filter changes
	useEffect(() => {
		setVisibleCount(INITIAL_CHUNK_SIZE);
	}, [folder.id, selectedType, localSearchQuery]);

	// Other folders available for moving items
	const otherFolders = useMemo(() => {
		return allFolders.filter((f) => f.id !== folder.id);
	}, [allFolders, folder.id]);

	// Types available inside this folder
	const availableTypes = useMemo(() => {
		const types = new Set<ItemType>();
		for (const item of folder.items) {
			if (item.type) types.add(item.type);
		}
		return Array.from(types);
	}, [folder.items]);

	// Filtered item list based on search and type filter
	const filteredItems = useMemo(() => {
		let list = folder.items;

		if (selectedType !== "all") {
			list = list.filter((item) => item.type === selectedType);
		}

		if (localSearchQuery.trim()) {
			const q = localSearchQuery.toLowerCase();
			list = list.filter(
				(item) =>
					item.name.toLowerCase().includes(q) ||
					item.url?.toLowerCase().includes(q) ||
					item.description?.toLowerCase().includes(q) ||
					item.summary?.toLowerCase().includes(q) ||
					item.tags?.some((t) => t.toLowerCase().includes(q)),
			);
		}

		return list;
	}, [folder.items, selectedType, localSearchQuery]);

	// Slice visible items for ultra-fast initial DOM mounting
	const visibleItems = useMemo(() => {
		return filteredItems.slice(0, visibleCount);
	}, [filteredItems, visibleCount]);

	const hasMore = filteredItems.length > visibleCount;
	const remainingCount = filteredItems.length - visibleCount;

	const handleLoadMore = () => {
		setVisibleCount((prev) => prev + INCREMENTAL_CHUNK_SIZE);
	};

	return (
		<div className="space-y-3">
			{/* Header & Filter Controls */}
			<div className="space-y-2">
				<div className="flex items-center justify-between gap-2">
					<div className="flex items-center gap-1.5 text-xs font-semibold text-foreground tracking-tight">
						<span>归集内容列表</span>
						<Chip size="sm" variant="secondary" className="h-4 text-[10px] px-1">
							{folder.items.length}
						</Chip>
					</div>

					{localSearchQuery && (
						<span className="text-[10px] text-muted">
							找到 {filteredItems.length} 项
						</span>
					)}
				</div>

				{/* Search Input */}
				{folder.items.length > 2 && (
					<InputGroup className="w-full h-8 text-xs">
						<InputGroup.Prefix className="pl-2.5 text-muted">
							<Search className="w-3.5 h-3.5" />
						</InputGroup.Prefix>
						<InputGroup.Input
							type="text"
							placeholder="在当前文件夹搜索..."
							value={localSearchQuery}
							onChange={(e) => setLocalSearchQuery(e.target.value)}
							className="text-xs h-8 pl-1"
						/>
						{localSearchQuery && (
							<InputGroup.Suffix className="pr-1.5">
								<button
									type="button"
									onClick={() => setLocalSearchQuery("")}
									className="w-4 h-4 rounded-full flex items-center justify-center text-muted hover:text-foreground cursor-pointer"
								>
									<X className="w-3 h-3" />
								</button>
							</InputGroup.Suffix>
						)}
					</InputGroup>
				)}

				{/* Type Filter Chips */}
				{availableTypes.length > 1 && (
					<div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar pt-1">
						<button
							type="button"
							onClick={() => setSelectedType("all")}
							className={`text-[10px] px-2 py-0.5 rounded-full transition-colors cursor-pointer shrink-0 font-medium ${
								selectedType === "all"
									? "bg-foreground text-background"
									: "bg-surface-secondary text-muted hover:text-foreground"
							}`}
						>
							全部 ({folder.items.length})
						</button>

						{availableTypes.map((type) => {
							const typeInfo = ITEM_TYPES[type] || { label: type };
							const count = folder.items.filter((i) => i.type === type).length;
							const isActive = selectedType === type;

							return (
								<button
									key={type}
									type="button"
									onClick={() => setSelectedType(isActive ? "all" : type)}
									className={`text-[10px] px-2 py-0.5 rounded-full transition-colors cursor-pointer shrink-0 font-medium ${
										isActive
											? "bg-accent text-accent-foreground"
											: "bg-surface-secondary text-muted hover:text-foreground"
									}`}
								>
									{typeInfo.label} ({count})
								</button>
							);
						})}
					</div>
				)}
			</div>

			{/* Item List or Empty States */}
			{folder.items.length === 0 ? (
				<EmptyState className="text-xs text-muted py-6 text-center rounded-2xl bg-surface-secondary/20">
					暂无归集内容
				</EmptyState>
			) : filteredItems.length === 0 ? (
				<EmptyState className="text-xs text-muted py-6 text-center rounded-2xl bg-surface-secondary/20 flex flex-col items-center justify-center">
					<Search className="w-5 h-5 opacity-40 mb-1 text-muted" />
					<span>未找到匹配的归集内容</span>
				</EmptyState>
			) : (
				<div className="space-y-2.5">
					{visibleItems.map((item, index) => (
						<WorkbenchItemCard
							key={item.id || `${item.name}-${index}`}
							item={item}
							index={index}
							otherFolders={otherFolders}
							showMoveDropdown={true}
							onDeleteItem={
								onDeleteItem ? (it) => onDeleteItem(it, folder.id) : undefined
							}
							onMoveItem={
								onMoveItem
									? (it, targetId) => onMoveItem(it, folder.id, targetId)
									: undefined
							}
						/>
					))}

					{/* Progressive Load More Action */}
					{hasMore && (
						<div className="pt-2 pb-1 text-center">
							<Button
								variant="secondary"
								size="sm"
								className="w-full py-1.5 h-8 text-xs rounded-xl bg-surface-secondary/60 hover:bg-surface-secondary text-muted hover:text-foreground border border-border/60 cursor-pointer flex items-center justify-center gap-1 shadow-2xs font-medium"
								onPress={handleLoadMore}
							>
								<span>加载更多</span>
								<span className="text-[10px] font-mono opacity-70">
									(+{Math.min(INCREMENTAL_CHUNK_SIZE, remainingCount)} / 剩余 {remainingCount})
								</span>
								<ChevronDown className="w-3.5 h-3.5 opacity-70" />
							</Button>
						</div>
					)}
				</div>
			)}
		</div>
	);
});

