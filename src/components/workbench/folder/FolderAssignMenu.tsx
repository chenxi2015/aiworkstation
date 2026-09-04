import { Dropdown, Tooltip } from "@heroui/react";
import { Folder as FolderIconLucide, FolderInput } from "lucide-react";
import { memo, useMemo, useState } from "react";
import { CATEGORIES, type Folder, sortCategoriesByNavOrder } from "../types";

export interface FolderAssignMenuProps {
	/**
	 * All available folders to choose from
	 */
	folders: Folder[];
	/**
	 * Optional navigation categories order reference (defaults to workbench CATEGORIES)
	 */
	categories?: string[];
	/**
	 * Callback when a target folder is selected
	 */
	onSelectFolder: (targetFolderId: number) => void;
	/**
	 * Current folder ID (used to display "移动" vs "放入")
	 */
	currentFolderId?: number | null;
	/**
	 * Optional original folder name for calculating recommendation match
	 */
	originalFolderName?: string;
	/**
	 * Folder ID to exclude from list (e.g. self when moving a folder)
	 */
	excludeFolderId?: number;
	/**
	 * Label override for the menu item / trigger
	 */
	label?: string;
	/**
	 * Rendering mode:
	 * - "submenu": renders <Dropdown.SubmenuTrigger> inside an existing menu
	 * - "button": renders an independent <Dropdown> with trigger button (for compact list)
	 */
	mode?: "submenu" | "button";
	/**
	 * Trigger button className (only used when mode === "button")
	 */
	triggerClassName?: string;
	/**
	 * Callback when open/close state changes
	 */
	onOpenChange?: (isOpen: boolean) => void;
}

/**
 * Reusable Folder Assignment Component with Category Tab Navigation.
 * Supports both Submenu mode (inside Dropdown) and Button mode (standalone).
 */
export const FolderAssignMenu = memo(function FolderAssignMenu({
	folders = [],
	categories: propCategories,
	onSelectFolder,
	currentFolderId = null,
	originalFolderName,
	excludeFolderId,
	label,
	mode = "submenu",
	triggerClassName,
	onOpenChange,
}: FolderAssignMenuProps) {
	const [isOpen, setIsOpen] = useState(false);

	const handleOpenChange = (open: boolean) => {
		setIsOpen(open);
		onOpenChange?.(open);
	};

	const normalizedOriginalFolder = originalFolderName?.trim().toLowerCase();

	// Filter out excluded folder (e.g. self)
	const validFolders = useMemo(() => {
		if (!excludeFolderId) return folders;
		return folders.filter((f) => f.id !== excludeFolderId);
	}, [folders, excludeFolderId]);

	// Extract unique categories, counts, and determine default Tab
	const { categories, categoryCountMap, defaultTab } = useMemo(() => {
		const map = new Map<string, number>();
		let matchedCategory: string | null = null;

		for (const f of validFolders) {
			const rawCat = f.category?.trim();
			// "未分类" is a pseudo category for bookmarks, fallback to "工作台"
			const cat = !rawCat || rawCat === "未分类" ? "工作台" : rawCat;
			map.set(cat, (map.get(cat) || 0) + 1);
			if (
				normalizedOriginalFolder &&
				f.name.trim().toLowerCase() === normalizedOriginalFolder
			) {
				matchedCategory = cat;
			}
		}

		// Sort categories by top navigation order
		const baseOrder =
			propCategories && propCategories.length > 0 ? propCategories : CATEGORIES;
		const sortedCategories = sortCategoriesByNavOrder(
			Array.from(map.keys()),
			baseOrder,
		);

		const catList = ["全部", ...sortedCategories];
		return {
			categories: catList,
			categoryCountMap: map,
			defaultTab: matchedCategory || "全部",
		};
	}, [validFolders, normalizedOriginalFolder, propCategories]);

	const [activeTab, setActiveTab] = useState<string>(defaultTab);

	// Filter & sort folders based on active tab and item matching
	const displayedFolders = useMemo(() => {
		const targetList =
			activeTab === "全部"
				? validFolders
				: validFolders.filter((f) => {
						const cat =
							!f.category || f.category === "未分类"
								? "工作台"
								: f.category.trim();
						return cat === activeTab;
					});

		const baseOrder =
			propCategories && propCategories.length > 0 ? propCategories : CATEGORIES;
		const orderMap = new Map<string, number>();
		baseOrder.forEach((cat, index) => {
			orderMap.set(cat, index);
		});

		return [...targetList].sort((a, b) => {
			if (normalizedOriginalFolder) {
				const aMatch = a.name.trim().toLowerCase() === normalizedOriginalFolder;
				const bMatch = b.name.trim().toLowerCase() === normalizedOriginalFolder;
				if (aMatch && !bMatch) return -1;
				if (!aMatch && bMatch) return 1;
			}
			const aCat =
				!a.category || a.category === "未分类" ? "工作台" : a.category.trim();
			const bCat =
				!b.category || b.category === "未分类" ? "工作台" : b.category.trim();
			if (aCat !== bCat) {
				const aIdx = orderMap.has(aCat) ? (orderMap.get(aCat) as number) : 9999;
				const bIdx = orderMap.has(bCat) ? (orderMap.get(bCat) as number) : 9999;
				if (aIdx !== bIdx) return aIdx - bIdx;
				return aCat.localeCompare(bCat);
			}
			return a.name.localeCompare(b.name);
		});
	}, [validFolders, activeTab, normalizedOriginalFolder, propCategories]);

	const actionLabel =
		label || (currentFolderId ? "移动至其他文件夹" : "放入文件夹");
	const shortActionLabel = label || (currentFolderId ? "移动" : "放入");

	// Content inside Popover (Tabs + Folder List)
	const popoverContent = (
		<div className="flex flex-col gap-1.5 w-full">
			{/* Top Category Tabs */}
			{categories.length > 1 && (
				<div
					className="flex items-center gap-1 p-1 bg-surface-secondary/70 rounded-xl overflow-x-auto no-scrollbar border border-border/50"
					onPointerDown={(e) => e.stopPropagation()}
				>
					{categories.map((cat) => {
						const isActive = activeTab === cat;
						const count =
							cat === "全部"
								? validFolders.length
								: categoryCountMap.get(cat) || 0;

						return (
							<button
								key={cat}
								type="button"
								onClick={(e) => {
									e.preventDefault();
									e.stopPropagation();
									setActiveTab(cat);
								}}
								className={`px-2 py-1 rounded-lg text-[11px] font-medium whitespace-nowrap transition-all cursor-pointer flex items-center gap-1 shrink-0 ${
									isActive
										? "bg-surface text-accent font-semibold shadow-xs border border-border/60"
										: "text-muted hover:text-foreground hover:bg-surface/50"
								}`}
							>
								<span>{cat}</span>
								<span
									className={`text-[9px] px-1 py-0.2 rounded-full font-mono ${
										isActive
											? "bg-accent/15 text-accent"
											: "bg-surface-secondary text-muted"
									}`}
								>
									{count}
								</span>
							</button>
						);
					})}
				</div>
			)}

			{/* Folder Items List */}
			{displayedFolders.length === 0 ? (
				<div className="py-6 text-center text-xs text-muted">
					该分类下暂无文件夹
				</div>
			) : (
				<Dropdown.Menu
					aria-label="选择目标文件夹"
					className="max-h-64 overflow-y-auto p-0.5"
					onAction={(key) => {
						const targetId = Number(key);
						if (targetId) {
							onSelectFolder(targetId);
						}
					}}
				>
					{displayedFolders.map((of) => {
						const isMatched =
							normalizedOriginalFolder &&
							of.name.trim().toLowerCase() === normalizedOriginalFolder;

						return (
							<Dropdown.Item
								key={String(of.id)}
								id={String(of.id)}
								textValue={of.name}
							>
								<div className="flex items-center gap-2 w-full py-0.5">
									<FolderIconLucide className="w-3.5 h-3.5 text-accent shrink-0" />
									<span className="text-xs font-medium truncate flex-1">
										{of.name}
									</span>
									{isMatched && (
										<span className="text-[9px] px-1.5 py-0.2 rounded bg-accent/15 text-accent font-medium shrink-0">
											推荐
										</span>
									)}
									{activeTab === "全部" && of.category && (
										<span className="text-[10px] text-muted shrink-0">
											({of.category})
										</span>
									)}
								</div>
							</Dropdown.Item>
						);
					})}
				</Dropdown.Menu>
			)}
		</div>
	);

	if (mode === "button") {
		return (
			<Dropdown onOpenChange={handleOpenChange}>
				<Tooltip>
					<Tooltip.Trigger>
						<Dropdown.Trigger
							className={
								triggerClassName
									? `${triggerClassName} ${isOpen ? "text-accent bg-surface shadow-2xs" : ""}`
									: `w-6 h-6 rounded-md flex items-center justify-center cursor-pointer transition-colors ${
											isOpen
												? "text-accent bg-surface shadow-2xs"
												: "text-muted hover:text-foreground hover:bg-surface"
										}`
							}
							aria-label={actionLabel}
						>
							<FolderInput className="w-3 h-3" />
						</Dropdown.Trigger>
					</Tooltip.Trigger>
					<Tooltip.Content className="text-xs py-1 px-2">
						{shortActionLabel}
					</Tooltip.Content>
				</Tooltip>

				<Dropdown.Popover
					aria-label="选择目标文件夹"
					className="w-[300px] p-2 shadow-xl border border-border/80 rounded-2xl bg-surface"
				>
					{popoverContent}
				</Dropdown.Popover>
			</Dropdown>
		);
	}

	// Default: Submenu mode inside existing Dropdown.Menu
	return (
		<Dropdown.SubmenuTrigger>
			<Dropdown.Item id="move-folder" textValue={actionLabel}>
				<div className="flex items-center gap-2 w-full py-0.5">
					<FolderInput className="w-3.5 h-3.5 text-muted shrink-0" />
					<span className="text-xs font-medium flex-1">{actionLabel}</span>
					<Dropdown.SubmenuIndicator />
				</div>
			</Dropdown.Item>

			<Dropdown.Popover className="w-[300px] p-2 shadow-xl border border-border/80 rounded-2xl bg-surface">
				{popoverContent}
			</Dropdown.Popover>
		</Dropdown.SubmenuTrigger>
	);
});
