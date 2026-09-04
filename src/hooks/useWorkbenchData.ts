import { toast } from "@heroui/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	type Category,
	CATEGORIES as DEFAULT_CATEGORIES,
	type Folder,
	type WorkbenchItem,
	type WorkbenchSettings,
} from "../components/workbench/types";
import {
	DEFAULT_SETTINGS,
	WorkbenchStorageService,
} from "../services/workbenchStorage";

export interface SaveFolderPayload {
	id?: number;
	name: string;
	category: string;
	desc: string;
	color?: string;
	parentId?: number | null;
}

export interface UseWorkbenchDataReturn {
	folders: Folder[];
	unclassified: WorkbenchItem[];
	settings: WorkbenchSettings;
	activeCategory: Category;
	selectedFolderId: number | null;
	selectedFolder: Folder | null;
	currentFolderId: number | null;
	currentFolder: Folder | null;
	folderPath: Folder[];
	gridFolders: Folder[];
	childFolderCounts: Record<number, number>;
	dynamicCategories: string[];
	filteredFolders: Folder[];
	filteredUnclassified: WorkbenchItem[];
	searchQuery: string;
	isInitialLoading: boolean;
	setSearchQuery: (query: string) => void;
	setActiveCategory: (cat: Category) => void;
	setSelectedFolderId: (id: number | null) => void;
	setSettings: (settings: WorkbenchSettings) => void;
	handleCategoryChange: (cat: Category) => void;
	handleSaveFolder: (data: SaveFolderPayload) => Promise<void>;
	handleDeleteFolder: (id: number) => Promise<void>;
	handleAddLink: (
		folderId: number,
		data: { url: string; title?: string; description?: string },
	) => Promise<void>;
	handleDeleteItemFromFolder: (
		item: WorkbenchItem,
		folderId: number,
	) => Promise<void>;
	handleMoveItem: (
		item: WorkbenchItem,
		sourceFolderId: number | null,
		targetFolderId: number,
	) => Promise<void>;
	handleMoveFolder: (
		folderId: number,
		targetParentId: number | null,
	) => Promise<void>;
	handleReorderFolders: (orderedIds: number[]) => Promise<void>;
	handleEnterFolder: (folderId: number) => void;
	handleNavigateToContainer: (folderId: number | null) => void;
	handleDeleteUnclassifiedItem: (item: WorkbenchItem) => Promise<void>;
	handleClassificationComplete: (
		updatedFolders: Folder[],
		updatedUnclassified: WorkbenchItem[],
	) => void;
	handleBookmarksImported: (
		newUnclassified: WorkbenchItem[],
		onTriggerAI?: () => void,
	) => void;
	handleNavigateFromSearch: (
		folderId: number | null,
		category?: Category,
	) => void;
	reloadFromDb: () => Promise<void>;
}

export interface InitialWorkbenchData {
	folders?: Folder[];
	unclassified?: WorkbenchItem[];
	settings?: WorkbenchSettings;
}

/**
 * Hook to manage workbench core state, database synchronization, polling, and CRUD operations
 */
export function useWorkbenchData(
	initialData?: InitialWorkbenchData,
): UseWorkbenchDataReturn {
	const [folders, setFolders] = useState<Folder[]>(
		() => initialData?.folders ?? [],
	);
	const [unclassified, setUnclassified] = useState<WorkbenchItem[]>(
		() => initialData?.unclassified ?? [],
	);
	const [settings, setSettings] = useState<WorkbenchSettings>(
		() => initialData?.settings ?? DEFAULT_SETTINGS,
	);
	const [activeCategory, setActiveCategory] = useState<Category>(() => {
		if (
			initialData?.folders &&
			initialData.folders.length === 0 &&
			initialData.unclassified &&
			initialData.unclassified.length > 0
		) {
			return "未分类";
		}
		return "工作台";
	});

	// Keep a ref to the latest activeCategory to avoid stale closures in reloadFromDb
	const activeCategoryRef = useRef(activeCategory);
	useEffect(() => {
		activeCategoryRef.current = activeCategory;
	}, [activeCategory]);

	// Initialize selectedFolderId to the first folder belonging to activeCategory
	const [selectedFolderId, setSelectedFolderId] = useState<number | null>(
		() => {
			if (!initialData?.folders || initialData.folders.length === 0)
				return null;
			const initCat =
				initialData.folders.length === 0 &&
				initialData.unclassified &&
				initialData.unclassified.length > 0
					? "未分类"
					: "工作台";
			if (initCat === "未分类") return null;
			const firstInCat = initialData.folders.find(
				(f) => f.category === initCat,
			);
			return firstInCat ? firstInCat.id : (initialData.folders[0]?.id ?? null);
		},
	);
	const [searchQuery, setSearchQuery] = useState("");
	const [isInitialLoading, setIsInitialLoading] = useState(() => !initialData);

	// Current container being browsed in the folder grid (null = category root)
	const [currentFolderId, setCurrentFolderId] = useState<number | null>(null);

	// Load initial data from SQLite
	const reloadFromDb = useCallback(async () => {
		try {
			const { folders: loadedFolders, unclassified: loadedUnclassified } =
				await WorkbenchStorageService.fetchAllFromDb();
			const loadedSettings = WorkbenchStorageService.getSettings();

			setFolders(loadedFolders);
			setUnclassified(loadedUnclassified);
			setSettings(loadedSettings);

			// If no folders exist but there are unclassified items, switch to unclassified view
			if (loadedFolders.length === 0 && loadedUnclassified.length > 0) {
				setActiveCategory("未分类");
				setSelectedFolderId(null);
			} else if (loadedFolders.length > 0) {
				const currentCat = activeCategoryRef.current;
				setSelectedFolderId((prev) => {
					// Retain current selection if it still exists and belongs to the active category
					if (prev !== null) {
						const existing = loadedFolders.find(
							(f) => f.id === prev && f.category === currentCat,
						);
						if (existing) return prev;
					}
					// Default to the first folder in the active category
					const firstInCat = loadedFolders.find(
						(f) => f.category === currentCat,
					);
					return firstInCat ? firstInCat.id : (loadedFolders[0]?.id ?? null);
				});
			}
		} finally {
			setIsInitialLoading(false);
		}
	}, []);

	useEffect(() => {
		if (!initialData) {
			reloadFromDb();
		}
	}, [initialData, reloadFromDb]);

	// Sync data on window focus / visibility change, and listen for broadcast / postMessage events
	useEffect(() => {
		const handleVisibilityOrFocus = () => {
			if (document.visibilityState === "visible") {
				reloadFromDb();
			}
		};

		// Listen for message events from extension or other tabs
		const handleMessage = (event: MessageEvent) => {
			if (
				event.data?.type === "WORKBENCH_RELOAD" ||
				event.data?.type === "BOOKMARK_COLLECTED"
			) {
				reloadFromDb();
			}
		};

		// BroadcastChannel for cross-tab or cross-window instant notification
		let channel: BroadcastChannel | null = null;
		try {
			channel = new BroadcastChannel("aiworkstation_sync");
			channel.onmessage = (event) => {
				if (
					event.data?.type === "WORKBENCH_RELOAD" ||
					event.data?.type === "BOOKMARK_COLLECTED"
				) {
					reloadFromDb();
				}
			};
		} catch {
			// BroadcastChannel might not be supported in some environments
		}

		window.addEventListener("focus", handleVisibilityOrFocus);
		document.addEventListener("visibilitychange", handleVisibilityOrFocus);
		window.addEventListener("message", handleMessage);

		return () => {
			window.removeEventListener("focus", handleVisibilityOrFocus);
			document.removeEventListener("visibilitychange", handleVisibilityOrFocus);
			window.removeEventListener("message", handleMessage);
			channel?.close();
		};
	}, [reloadFromDb]);

	// Dynamic Category Tabs: Merge predefined categories with custom ones from folders
	const dynamicCategories = useMemo(() => {
		const cats = new Set<string>();
		for (const c of DEFAULT_CATEGORIES) {
			cats.add(c);
		}
		for (const f of folders) {
			if (f.category) cats.add(f.category);
		}
		return Array.from(cats);
	}, [folders]);

	// All folders in the active category (any nesting depth)
	const categoryFolders = useMemo(() => {
		return folders.filter((f) => f.category === activeCategory);
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

	// Folders rendered in the main grid: siblings inside the current container.
	// While searching, show matches across the whole category instead.
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
			setCurrentFolderId(null);
			if (cat === "未分类") {
				setSelectedFolderId(null);
			} else {
				const firstInCat = folders.find(
					(f) => f.category === cat && (f.parentId ?? null) === null,
				);
				setSelectedFolderId(firstInCat ? firstInCat.id : null);
			}
		},
		[folders],
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

	// Navigate from search results
	const handleNavigateFromSearch = useCallback(
		(folderId: number | null, category?: Category) => {
			if (folderId !== null && folderId !== undefined) {
				const target = folders.find((f) => f.id === folderId);
				if (target) {
					setActiveCategory(target.category as Category);
					setSelectedFolderId(target.id);
					setCurrentFolderId(target.parentId ?? null);
				} else if (category) {
					setActiveCategory(category);
					setSelectedFolderId(folderId);
				}
			} else {
				setActiveCategory("未分类");
				setSelectedFolderId(null);
			}
		},
		[folders],
	);

	// Save or edit folder
	const handleSaveFolder = useCallback(async (data: SaveFolderPayload) => {
		const updated = await WorkbenchStorageService.saveFolderToDb(data);
		setFolders(updated);
		setActiveCategory(data.category as Category);
		const createdOrEdited = data.id
			? updated.find((f) => f.id === data.id)
			: updated[updated.length - 1];
		if (createdOrEdited) {
			setSelectedFolderId(createdOrEdited.id);
		}
		toast.success("已保存文件夹至 SQLite 数据库");
	}, []);

	// Delete folder
	const handleDeleteFolder = useCallback(
		async (id: number) => {
			const updated = await WorkbenchStorageService.deleteFolderFromDb(id);
			setFolders(updated);
			if (selectedFolderId === id) {
				setSelectedFolderId(updated[0]?.id || null);
			}
			toast.danger("文件夹已从 SQLite 中删除");
		},
		[selectedFolderId],
	);

	// Manually add a link into a folder
	const handleAddLink = useCallback(
		async (
			folderId: number,
			data: { url: string; title?: string; description?: string },
		) => {
			const updated = await WorkbenchStorageService.addLinkToFolder({
				folderId,
				...data,
			});
			setFolders(updated);
			toast.success("已将链接保存至文件夹");
		},
		[],
	);

	// Delete item from folder
	const handleDeleteItemFromFolder = useCallback(
		async (item: WorkbenchItem, folderId: number) => {
			const { folders: updatedFolders, unclassified: updatedUnclassified } =
				await WorkbenchStorageService.deleteItemInDb(item.id || "", folderId);
			setFolders(updatedFolders);
			setUnclassified(updatedUnclassified);
			toast.success(`已从文件夹中移除「${item.name}」`);
		},
		[],
	);

	// Move item between folders (or from unclassified pool)
	const handleMoveItem = useCallback(
		async (
			item: WorkbenchItem,
			sourceFolderId: number | null,
			targetFolderId: number,
		) => {
			const { folders: updatedFolders, unclassified: updatedUnclassified } =
				await WorkbenchStorageService.moveItemInDb(
					item.id || "",
					sourceFolderId,
					targetFolderId,
				);
			setFolders(updatedFolders);
			setUnclassified(updatedUnclassified);
			toast.success(
				sourceFolderId === null
					? `已将「${item.name}」放入目标文件夹`
					: `已将「${item.name}」移动到目标文件夹`,
			);
		},
		[],
	);

	// Move folder into another folder (or to top-level), with client-side cycle guard
	const handleMoveFolder = useCallback(
		async (folderId: number, targetParentId: number | null) => {
			if (targetParentId !== null) {
				// Reject moving into itself or its own descendant
				const byId = new Map(folders.map((f) => [f.id, f]));
				let cursor: number | null = targetParentId;
				const visited = new Set<number>();
				while (cursor !== null && !visited.has(cursor)) {
					if (cursor === folderId) {
						toast.danger("无法将文件夹移动到其自身或子文件夹中");
						return;
					}
					visited.add(cursor);
					cursor = byId.get(cursor)?.parentId ?? null;
				}
			}

			const previous = folders;
			// Optimistic update
			setFolders((prev) =>
				prev.map((f) =>
					f.id === folderId ? { ...f, parentId: targetParentId } : f,
				),
			);
			try {
				const updated = await WorkbenchStorageService.moveFolderInDb(
					folderId,
					targetParentId,
				);
				setFolders(updated);
				const moved = previous.find((f) => f.id === folderId);
				toast.success(
					targetParentId === null
						? `已将「${moved?.name ?? "文件夹"}」移到顶层`
						: `已移动文件夹「${moved?.name ?? ""}」`,
				);
			} catch (err) {
				setFolders(previous);
				toast.danger(
					err instanceof Error ? err.message : "移动文件夹失败，请重试",
				);
			}
		},
		[folders],
	);

	// Persist sibling folder order (optimistic, rolls back on failure)
	const handleReorderFolders = useCallback(
		async (orderedIds: number[]) => {
			const previous = folders;
			const queue = [...orderedIds];
			const inScope = new Set(orderedIds);
			const byId = new Map(folders.map((f) => [f.id, f]));
			// Optimistic update: re-thread sibling order in place
			setFolders(
				folders.map((f) => {
					if (!inScope.has(f.id)) return f;
					const nextId = queue.shift();
					return nextId !== undefined ? (byId.get(nextId) ?? f) : f;
				}),
			);
			try {
				const updated =
					await WorkbenchStorageService.reorderFoldersInDb(orderedIds);
				setFolders(updated);
			} catch {
				setFolders(previous);
				toast.danger("文件夹排序保存失败，请重试");
			}
		},
		[folders],
	);

	// Delete item from unclassified pool
	const handleDeleteUnclassifiedItem = useCallback(
		async (item: WorkbenchItem) => {
			const { unclassified: updatedUnclassified } =
				await WorkbenchStorageService.deleteItemInDb(item.id || "", null);
			setUnclassified(updatedUnclassified);
			toast.success(`已从未分类池中移除「${item.name}」`);
		},
		[],
	);

	// Handle AI classification completion
	const handleClassificationComplete = useCallback(
		(updatedFolders: Folder[], updatedUnclassified: WorkbenchItem[]) => {
			setFolders(updatedFolders);
			setUnclassified(updatedUnclassified);
			if (updatedFolders.length > 0) {
				setActiveCategory(updatedFolders[0].category || "工作台");
				setSelectedFolderId(updatedFolders[0].id);
			}
		},
		[],
	);

	// Handle bookmark import completion
	const handleBookmarksImported = useCallback(
		(newUnclassified: WorkbenchItem[], onTriggerAI?: () => void) => {
			setUnclassified(newUnclassified);
			setActiveCategory("未分类");
			if (onTriggerAI) {
				onTriggerAI();
			}
		},
		[],
	);

	return {
		folders,
		unclassified,
		settings,
		activeCategory,
		selectedFolderId,
		selectedFolder,
		currentFolderId,
		currentFolder,
		folderPath,
		gridFolders,
		childFolderCounts,
		dynamicCategories,
		filteredFolders,
		filteredUnclassified,
		searchQuery,
		isInitialLoading,
		setSearchQuery,
		setActiveCategory,
		setSelectedFolderId,
		setSettings,
		handleCategoryChange,
		handleSaveFolder,
		handleDeleteFolder,
		handleAddLink,
		handleDeleteItemFromFolder,
		handleMoveItem,
		handleMoveFolder,
		handleReorderFolders,
		handleEnterFolder,
		handleNavigateToContainer,
		handleDeleteUnclassifiedItem,
		handleClassificationComplete,
		handleBookmarksImported,
		handleNavigateFromSearch,
		reloadFromDb,
	};
}
