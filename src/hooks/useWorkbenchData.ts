import { toast } from "@heroui/react";
import { useCallback, useEffect, useMemo, useState } from "react";
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
}

export interface UseWorkbenchDataReturn {
	folders: Folder[];
	unclassified: WorkbenchItem[];
	settings: WorkbenchSettings;
	activeCategory: Category;
	selectedFolderId: number | null;
	selectedFolder: Folder | null;
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
	handleDeleteItemFromFolder: (
		item: WorkbenchItem,
		folderId: number,
	) => Promise<void>;
	handleMoveItem: (
		item: WorkbenchItem,
		sourceFolderId: number | null,
		targetFolderId: number,
	) => Promise<void>;
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
	const [selectedFolderId, setSelectedFolderId] = useState<number | null>(
		() => initialData?.folders?.[0]?.id ?? null,
	);
	const [searchQuery, setSearchQuery] = useState("");
	const [isInitialLoading, setIsInitialLoading] = useState(() => !initialData);

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
			} else if (loadedFolders.length > 0) {
				setSelectedFolderId((prev) =>
					prev === null ? loadedFolders[0].id : prev,
				);
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

	// Filter folders by active category and search query
	const filteredFolders = useMemo(() => {
		let list = folders.filter((f) => f.category === activeCategory);
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
	}, [folders, activeCategory, searchQuery]);

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
		if (!selectedFolderId) {
			return filteredFolders[0] || null;
		}
		return (
			folders.find((f) => f.id === selectedFolderId) ||
			filteredFolders[0] ||
			null
		);
	}, [folders, selectedFolderId, filteredFolders]);

	// Handle category switch
	const handleCategoryChange = useCallback(
		(cat: Category) => {
			setActiveCategory(cat);
			if (cat === "未分类") {
				setSelectedFolderId(null);
			} else {
				const firstInCat = folders.find((f) => f.category === cat);
				setSelectedFolderId(firstInCat ? firstInCat.id : null);
			}
		},
		[folders],
	);

	// Navigate from search results
	const handleNavigateFromSearch = useCallback(
		(folderId: number | null, category?: Category) => {
			if (folderId !== null && folderId !== undefined) {
				const target = folders.find((f) => f.id === folderId);
				if (target) {
					setActiveCategory(target.category as Category);
					setSelectedFolderId(target.id);
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
		handleDeleteItemFromFolder,
		handleMoveItem,
		handleDeleteUnclassifiedItem,
		handleClassificationComplete,
		handleBookmarksImported,
		handleNavigateFromSearch,
		reloadFromDb,
	};
}
