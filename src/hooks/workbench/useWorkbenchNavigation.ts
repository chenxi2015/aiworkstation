import { useCallback, useMemo, useState } from "react";
import type {
	Category,
	Folder,
	WorkbenchItem,
} from "../../components/workbench/types";
import { ALL_CATEGORY, matchesCategory } from "../../modules/registry";
import {
	getStoredActiveCategory,
	saveActiveCategory,
} from "./useWorkbenchStorageSync";

export interface UseWorkbenchNavigationProps {
	folders: Folder[];
	unclassified: WorkbenchItem[];
	activeCategory: Category;
	setActiveCategory: (cat: Category) => void;
	initialCategory?: Category;
	initialFolders?: Folder[];
	initialUnclassified?: WorkbenchItem[];
}

/**
 * Sub-hook responsible for folder hierarchy navigation, breadcrumbs, search filtering, and category tabs
 */
export function useWorkbenchNavigation({
	folders,
	unclassified,
	activeCategory,
	setActiveCategory,
	initialCategory,
	initialFolders,
	initialUnclassified,
}: UseWorkbenchNavigationProps) {
	// Initialize selectedFolderId to the first folder belonging to activeCategory
	const [selectedFolderId, setSelectedFolderId] = useState<number | null>(
		() => {
			if (!initialFolders || initialFolders.length === 0) return null;
			let initCat: string = initialCategory || "工作台";
			if (typeof window !== "undefined" && !initialCategory) {
				const stored = getStoredActiveCategory();
				if (stored) initCat = stored;
			} else if (
				!initialCategory &&
				initialFolders.length === 0 &&
				initialUnclassified &&
				initialUnclassified.length > 0
			) {
				initCat = "未分类";
			}
			if (initCat === "未分类") return null;
			if (initCat === ALL_CATEGORY) return initialFolders[0]?.id ?? null;
			const firstInCat = initialFolders.find((f) =>
				matchesCategory(f.category, initCat),
			);
			return firstInCat ? firstInCat.id : (initialFolders[0]?.id ?? null);
		},
	);

	const [searchQuery, setSearchQuery] = useState("");
	// Current container being browsed in the folder grid (null = category root)
	const [currentFolderId, setCurrentFolderId] = useState<number | null>(null);
	// Specific item to highlight and scroll into view
	const [highlightItemId, setHighlightItemId] = useState<
		string | number | null
	>(null);

	// Dynamic Category Tabs: '工作台' is root category, others dynamically extracted from database folders
	const dynamicCategories = useMemo(() => {
		const cats = new Set<string>();
		cats.add("工作台");
		for (const f of folders) {
			const cat = f.category?.trim();
			if (cat && cat !== "未分类") {
				cats.add(cat);
			}
		}
		cats.add("未分类");
		return Array.from(cats);
	}, [folders]);

	// All folders in the active category (any nesting depth); 全部 = no filter
	const categoryFolders = useMemo(() => {
		if (activeCategory === ALL_CATEGORY) return folders;
		return folders.filter((f) => matchesCategory(f.category, activeCategory));
	}, [folders, activeCategory]);

	// Filter folders by active category and search query
	const filteredFolders = useMemo(() => {
		let list = categoryFolders;
		if (searchQuery.trim()) {
			const q = searchQuery.toLowerCase();
			list = list.filter(
				(f) =>
					f.name.toLowerCase().includes(q) ||
					f.desc?.toLowerCase().includes(q) ||
					f.items.some(
						(item) =>
							item.name.toLowerCase().includes(q) ||
							item.url?.toLowerCase().includes(q) ||
							item.tags?.some((t) => t.toLowerCase().includes(q)),
					),
			);
		}
		return list;
	}, [categoryFolders, searchQuery]);

	// Folders rendered in the main grid: siblings inside current container or search matches
	const gridFolders = useMemo(() => {
		if (searchQuery.trim()) return filteredFolders;
		return filteredFolders.filter(
			(f) => (f.parentId ?? null) === currentFolderId,
		);
	}, [filteredFolders, currentFolderId, searchQuery]);

	// The folder currently being browsed (grid container)
	const currentFolder = useMemo(() => {
		if (currentFolderId === null) return null;
		return folders.find((f) => f.id === currentFolderId) ?? null;
	}, [folders, currentFolderId]);

	// Breadcrumb path from the category root down to the current folder
	const folderPath = useMemo(() => {
		const path: Folder[] = [];
		let cursor = currentFolder;
		const visited = new Set<number>();
		while (cursor && !visited.has(cursor.id)) {
			visited.add(cursor.id);
			path.unshift(cursor);
			const parentId = cursor.parentId ?? null;
			cursor =
				parentId === null
					? null
					: (folders.find((f) => f.id === parentId) ?? null);
		}
		return path;
	}, [folders, currentFolder]);

	// Subfolder counts per folder id (for card badges)
	const childFolderCounts = useMemo(() => {
		const counts: Record<number, number> = {};
		for (const f of folders) {
			if (f.parentId != null) {
				counts[f.parentId] = (counts[f.parentId] || 0) + 1;
			}
		}
		return counts;
	}, [folders]);

	// Filter unclassified items by search query
	const filteredUnclassified = useMemo(() => {
		if (!searchQuery.trim()) return unclassified;
		const q = searchQuery.toLowerCase();
		return unclassified.filter(
			(item) =>
				item.name.toLowerCase().includes(q) ||
				item.url?.toLowerCase().includes(q) ||
				item.description?.toLowerCase().includes(q) ||
				item.folderName?.toLowerCase().includes(q),
		);
	}, [unclassified, searchQuery]);

	// Selected folder instance
	const selectedFolder = useMemo(() => {
		if (activeCategory === "未分类") {
			return null;
		}
		if (selectedFolderId) {
			const matched = categoryFolders.find((f) => f.id === selectedFolderId);
			if (matched) return matched;
		}
		if (currentFolder) return currentFolder;
		return gridFolders[0] || categoryFolders[0] || null;
	}, [
		selectedFolderId,
		categoryFolders,
		gridFolders,
		currentFolder,
		activeCategory,
	]);

	// Handle category switch
	const handleCategoryChange = useCallback(
		(cat: Category) => {
			setActiveCategory(cat);
			saveActiveCategory(cat);
			setCurrentFolderId(null);
			if (cat === "未分类") {
				setSelectedFolderId(null);
			} else {
				const firstInCat =
					cat === ALL_CATEGORY
						? folders.find((f) => (f.parentId ?? null) === null)
						: folders.find(
								(f) =>
									matchesCategory(f.category, cat) &&
									(f.parentId ?? null) === null,
							);
				setSelectedFolderId(firstInCat ? firstInCat.id : null);
			}
		},
		[folders, setActiveCategory],
	);

	// Enter a folder: the grid switches to its subfolders, detail panel previews it
	const handleEnterFolder = useCallback((folderId: number) => {
		setCurrentFolderId(folderId);
		setSelectedFolderId(folderId);
	}, []);

	// Breadcrumb navigation: null = back to category root
	const handleNavigateToContainer = useCallback((folderId: number | null) => {
		setCurrentFolderId(folderId);
		if (folderId !== null) {
			setSelectedFolderId(folderId);
		}
	}, []);

	// Navigate from search results (optionally targeting a specific item inside the folder)
	const handleNavigateFromSearch = useCallback(
		(
			folderId: number | null,
			category?: Category,
			targetItemId?: string | number,
		) => {
			if (folderId !== null && folderId !== undefined) {
				const target = folders.find((f) => f.id === folderId);
				if (target) {
					setActiveCategory(target.category as Category);
					setSelectedFolderId(target.id);
					// If locating a specific bookmark item, stay in parent folder and highlight it;
					// Otherwise if clicking on a folder chip, directly enter the folder!
					if (targetItemId !== undefined && targetItemId !== null) {
						setCurrentFolderId(target.parentId ?? null);
					} else {
						setCurrentFolderId(target.id);
					}
				} else if (category) {
					setActiveCategory(category);
					setSelectedFolderId(folderId);
					setCurrentFolderId(folderId);
				}
			} else {
				setActiveCategory("未分类");
				setSelectedFolderId(null);
				setCurrentFolderId(null);
			}

			if (targetItemId !== undefined && targetItemId !== null) {
				setHighlightItemId(targetItemId);
			}
		},
		[folders, setActiveCategory],
	);

	const clearHighlightItem = useCallback(() => {
		setHighlightItemId(null);
	}, []);

	return {
		selectedFolderId,
		setSelectedFolderId,
		currentFolderId,
		setCurrentFolderId,
		searchQuery,
		setSearchQuery,
		highlightItemId,
		setHighlightItemId,
		clearHighlightItem,
		dynamicCategories,
		categoryFolders,
		filteredFolders,
		gridFolders,
		currentFolder,
		folderPath,
		childFolderCounts,
		filteredUnclassified,
		selectedFolder,
		handleCategoryChange,
		handleEnterFolder,
		handleNavigateToContainer,
		handleNavigateFromSearch,
	};
}
