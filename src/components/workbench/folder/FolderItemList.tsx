import { Button, EmptyState, InputGroup, Tooltip } from "@heroui/react";
import { ChevronDown, LayoutGrid, List, Search, X } from "lucide-react";
import { memo, useEffect, useMemo, useState } from "react";
import { DraggableItem } from "../dnd/WorkbenchDnd";
import { ItemFavicon } from "../ItemFavicon";
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
 * Supports compact list and icon grid view modes.
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
	const [viewMode, setViewMode] = useState<"list" | "grid">("list");
	const [visibleCount, setVisibleCount] = useState(INITIAL_CHUNK_SIZE);

	const selectedType = controlledTypeFilter ?? localTypeFilter;
	const setSelectedType = controlledOnSelectTypeFilter ?? setLocalTypeFilter;

	// Reset pagination on folder, search or filter changes
	// biome-ignore lint/correctness/useExhaustiveDependencies: Reset pagination on folder, filter or search changes
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
		<div className="space-y-2.5">
			{/* Header & Filter Controls */}
			<div className="space-y-2">
				<div className="flex items-center justify-between gap-2">
					<div className="flex items-center gap-1.5 text-xs font-semibold text-foreground tracking-tight">
						<span>归集内容</span>
						<span className="text-[10px] text-muted font-mono bg-surface-secondary px-1.5 py-0.2 rounded-md">
							{filteredItems.length}
						</span>
					</div>

					{/* View Mode Switcher (List / Grid) */}
					<div className="flex items-center bg-surface-secondary/70 p-0.5 rounded-lg border border-border/50">
						<button
							type="button"
							onClick={() => setViewMode("list")}
							className={`p-1 rounded-md transition-colors cursor-pointer ${
								viewMode === "list"
									? "bg-surface text-foreground shadow-2xs font-medium"
									: "text-muted hover:text-foreground"
							}`}
							title="列表视图"
						>
							<List className="w-3.5 h-3.5" />
						</button>
						<button
							type="button"
							onClick={() => setViewMode("grid")}
							className={`p-1 rounded-md transition-colors cursor-pointer ${
								viewMode === "grid"
									? "bg-surface text-foreground shadow-2xs font-medium"
									: "text-muted hover:text-foreground"
							}`}
							title="图标网格视图"
						>
							<LayoutGrid className="w-3.5 h-3.5" />
						</button>
					</div>
				</div>

				{/* Search Input */}
				{folder.items.length > 2 && (
					<InputGroup className="w-full h-8 text-xs rounded-xl border border-border bg-surface hover:border-border/90 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/15 transition-all shadow-2xs">
						<InputGroup.Prefix className="pl-2.5 text-muted">
							<Search className="w-3.5 h-3.5" />
						</InputGroup.Prefix>
						<InputGroup.Input
							type="text"
							placeholder="在当前文件夹搜索..."
							value={localSearchQuery}
							onChange={(e) => setLocalSearchQuery(e.target.value)}
							className="text-xs h-8 pl-1 bg-transparent border-none focus:outline-none focus:ring-0"
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
					<div className="flex items-center gap-1 overflow-x-auto pb-0.5 scrollbar-none">
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
			) : viewMode === "list" ? (
				/* Compact List Mode */
				<div className="space-y-1">
					{visibleItems.map((item, index) => (
						<DraggableItem
							key={item.id || `${item.name}-${index}`}
							item={item}
							sourceFolderId={folder.id}
						>
							<WorkbenchItemCard
								item={item}
								index={index}
								compact={true}
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
						</DraggableItem>
					))}
				</div>
			) : (
				/* App Icon Grid Mode */
				<div className="grid grid-cols-4 gap-1.5 pt-0.5">
					{visibleItems.map((item, index) => (
						<DraggableItem
							key={item.id || `${item.name}-${index}`}
							item={item}
							sourceFolderId={folder.id}
							className="min-w-0 w-full"
						>
							<Tooltip>
								<Tooltip.Trigger className="w-full min-w-0 block">
									<button
										type="button"
										onClick={() => {
											if (item.url) {
												window.open(item.url, "_blank", "noopener,noreferrer");
											}
										}}
										className="group aspect-square w-full h-auto min-w-0 max-w-full rounded-xl bg-surface-secondary/60 hover:bg-accent-soft/80 border border-border/70 hover:border-accent/30 hover:scale-[1.04] transition-all duration-150 flex flex-col items-center justify-center p-1.5 cursor-pointer text-center relative overflow-hidden shadow-2xs"
									>
										<div className="w-6 h-6 rounded-lg bg-surface flex items-center justify-center shrink-0 shadow-2xs group-hover:bg-surface/90 transition-colors">
											<ItemFavicon
												url={item.url}
												favicon={item.favicon}
												type={item.type}
												name={item.name}
												size="xs"
												className="group-hover:scale-110 transition-transform"
												iconClassName="opacity-80 group-hover:opacity-100 group-hover:scale-110 transition-transform"
											/>
										</div>
										<span
											className="text-[9px] font-medium text-foreground/80 group-hover:text-accent mt-1 truncate block w-full min-w-0 px-0.5 text-center leading-tight"
											title={item.name}
										>
											{item.name}
										</span>
									</button>
								</Tooltip.Trigger>
								<Tooltip.Content className="text-xs py-1.5 px-2.5 max-w-[220px]">
									<div className="font-semibold text-foreground line-clamp-1">
										{item.name}
									</div>
									<div className="text-[10px] text-muted truncate mt-0.5">
										{item.url}
									</div>
								</Tooltip.Content>
							</Tooltip>
						</DraggableItem>
					))}
				</div>
			)}

			{/* Progressive Load More Action */}
			{hasMore && filteredItems.length > 0 && (
				<div className="pt-1.5 pb-1 text-center">
					<Button
						variant="secondary"
						size="sm"
						className="w-full py-1 h-7 text-xs rounded-xl bg-surface-secondary/60 hover:bg-surface-secondary text-muted hover:text-foreground border border-border/60 cursor-pointer flex items-center justify-center gap-1 shadow-2xs font-medium"
						onPress={handleLoadMore}
					>
						<span>加载更多</span>
						<span className="text-[10px] font-mono opacity-70">
							(+{Math.min(INCREMENTAL_CHUNK_SIZE, remainingCount)} / 剩余{" "}
							{remainingCount})
						</span>
						<ChevronDown className="w-3.5 h-3.5 opacity-70" />
					</Button>
				</div>
			)}
		</div>
	);
});
