import { useCallback } from "react";
import type {
	Category,
	Folder,
	WorkbenchItem,
	WorkbenchSettings,
} from "../components/workbench/types";
import {
	type SaveFolderPayload,
	useWorkbenchFolderActions,
} from "./workbench/useWorkbenchFolderActions";
import { useWorkbenchItemActions } from "./workbench/useWorkbenchItemActions";
import { useWorkbenchNavigation } from "./workbench/useWorkbenchNavigation";
import {
	type InitialWorkbenchData,
	useWorkbenchStorageSync,
} from "./workbench/useWorkbenchStorageSync";

export type { SaveFolderPayload };
export type { InitialWorkbenchData };

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
	handleMoveFolderToCategory: (
		folderId: number,
		targetCategory: string,
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

/**
 * Facade Hook to manage workbench core state, database synchronization, polling, and CRUD operations
 */
export function useWorkbenchData(
	initialData?: InitialWorkbenchData,
): UseWorkbenchDataReturn {
	// 1. Data synchronization & persistence
	const {
		folders,
		setFolders,
		unclassified,
		setUnclassified,
		settings,
		setSettings,
		activeCategory,
		setActiveCategory,
		activeCategoryRef,
		isInitialLoading,
		reloadFromDb: baseReloadFromDb,
	} = useWorkbenchStorageSync(initialData);

	// 2. Navigation, filtering, and breadcrumbs
	const {
		selectedFolderId,
		setSelectedFolderId,
		currentFolderId,
		searchQuery,
		setSearchQuery,
		dynamicCategories,
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
	} = useWorkbenchNavigation({
		folders,
		unclassified,
		activeCategory,
		setActiveCategory,
		initialCategory: initialData?.initialCategory,
		initialFolders: initialData?.folders,
		initialUnclassified: initialData?.unclassified,
	});

	// Re-synchronize selectedFolderId on DB reload
	const reloadFromDb = useCallback(async () => {
		const res = await baseReloadFromDb();
		if (!res) return;
		const { loadedFolders, loadedUnclassified } = res;

		if (loadedFolders.length === 0 && loadedUnclassified.length > 0) {
			setSelectedFolderId(null);
		} else if (loadedFolders.length > 0) {
			const currentCat = activeCategoryRef.current;
			setSelectedFolderId((prev) => {
				if (prev !== null) {
					const existing = loadedFolders.find(
						(f) => f.id === prev && f.category === currentCat,
					);
					if (existing) return prev;
				}
				const firstInCat = loadedFolders.find((f) => f.category === currentCat);
				return firstInCat ? firstInCat.id : (loadedFolders[0]?.id ?? null);
			});
		}
	}, [baseReloadFromDb, activeCategoryRef, setSelectedFolderId]);

	// 3. Folder operations
	const {
		handleSaveFolder,
		handleDeleteFolder,
		handleMoveFolder,
		handleMoveFolderToCategory,
		handleReorderFolders,
	} = useWorkbenchFolderActions({
		folders,
		setFolders,
		selectedFolderId,
		setSelectedFolderId,
		setActiveCategory,
	});

	// 4. Bookmark item operations & callbacks
	const {
		handleAddLink,
		handleDeleteItemFromFolder,
		handleMoveItem,
		handleDeleteUnclassifiedItem,
		handleClassificationComplete,
		handleBookmarksImported,
	} = useWorkbenchItemActions({
		setFolders,
		setUnclassified,
		setActiveCategory,
		setSelectedFolderId,
	});

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
		handleMoveFolderToCategory,
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
