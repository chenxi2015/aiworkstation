import { toast } from "@heroui/react";
import { useCallback, useState } from "react";
import type {
	Folder,
	SearchResultItem,
} from "../../components/workbench/types";
import { WorkbenchStorageService } from "../../services/workbenchStorage";

export interface UseItemFolderAssignOptions {
	onDataChanged?: () => void;
}

/**
 * Custom hook to handle bookmark-to-folder assignment, quick folder creation, and batch selection
 */
export function useItemFolderAssign(options?: UseItemFolderAssignOptions) {
	const [assigningItems, setAssigningItems] = useState<
		SearchResultItem[] | null
	>(null);
	const [selectedItemKeys, setSelectedItemKeys] = useState<
		Set<string | number>
	>(new Set());
	const [isCreateMode, setIsCreateMode] = useState<boolean>(false);
	const [newFolderName, setNewFolderName] = useState<string>("");
	const [newFolderCategory, setNewFolderCategory] = useState<string>("工作台");
	const [folderFilterQuery, setFolderFilterQuery] = useState<string>("");
	const [isProcessingMove, setIsProcessingMove] = useState<boolean>(false);

	// Toggle selection for a single item in search results or reference cards
	const toggleSelectItem = useCallback((idOrUrl: string | number) => {
		setSelectedItemKeys((prev) => {
			const next = new Set(prev);
			if (next.has(idOrUrl)) {
				next.delete(idOrUrl);
			} else {
				next.add(idOrUrl);
			}
			return next;
		});
	}, []);

	// Select all given items
	const selectAll = useCallback((items: SearchResultItem[]) => {
		const next = new Set<string | number>();
		for (const it of items) {
			const key = it.id || it.url;
			if (key !== undefined) {
				next.add(key);
			}
		}
		setSelectedItemKeys(next);
	}, []);

	// Clear current selection
	const clearSelection = useCallback(() => {
		setSelectedItemKeys(new Set());
	}, []);

	// Toggle select all or clear all for a specific list/group of items
	const toggleSelectGroup = useCallback((items: SearchResultItem[]) => {
		setSelectedItemKeys((prev) => {
			const next = new Set(prev);
			const validKeys = items
				.map((it) => it.id || it.url)
				.filter((k): k is string | number => k !== undefined && k !== "");
			if (validKeys.length === 0) return prev;

			const isAllSelected = validKeys.every((k) => next.has(k));
			if (isAllSelected) {
				for (const k of validKeys) {
					next.delete(k);
				}
			} else {
				for (const k of validKeys) {
					next.add(k);
				}
			}
			return next;
		});
	}, []);

	// Open assignment popover for a single item
	const openAssignSingle = useCallback(
		(item: SearchResultItem, e?: React.MouseEvent) => {
			if (e) {
				e.stopPropagation();
			}
			setAssigningItems([item]);
			setIsCreateMode(false);
			setNewFolderName("");
			setFolderFilterQuery("");
		},
		[],
	);

	// Open assignment popover for multiple items
	const openAssignMultiple = useCallback(
		(items: SearchResultItem[], createMode = false) => {
			if (items.length === 0) return;
			setAssigningItems(items);
			setIsCreateMode(createMode);
			setNewFolderName("");
			setFolderFilterQuery("");
		},
		[],
	);

	// Close assignment popover
	const closeAssign = useCallback(() => {
		setAssigningItems(null);
		setIsCreateMode(false);
		setNewFolderName("");
		setFolderFilterQuery("");
	}, []);

	// Move assigningItems to an existing folder
	const moveToExistingFolder = useCallback(
		async (
			targetFolder: Folder,
			onSuccess?: (movedItems: SearchResultItem[], folder: Folder) => void,
		) => {
			if (!assigningItems || assigningItems.length === 0) return;
			setIsProcessingMove(true);

			try {
				for (const item of assigningItems) {
					await WorkbenchStorageService.moveItemInDb(
						item.id || "",
						item.folderId ?? null,
						targetFolder.id,
					);
				}

				toast.success(
					`已将 ${assigningItems.length} 项移入「${targetFolder.name}」`,
				);
				onSuccess?.(assigningItems, targetFolder);
				closeAssign();
				clearSelection();
				options?.onDataChanged?.();
			} catch (err: any) {
				console.error("[useItemFolderAssign] Move items error:", err);
				toast.danger(`移动失败: ${err.message || err}`);
			} finally {
				setIsProcessingMove(false);
			}
		},
		[assigningItems, closeAssign, clearSelection, options],
	);

	// Create a new folder and move assigningItems into it
	const createFolderAndMove = useCallback(
		async (
			onSuccess?: (newFolder: Folder, movedItems: SearchResultItem[]) => void,
		) => {
			const trimmedName = newFolderName.trim();
			if (!trimmedName) {
				toast.warning("请输入新文件夹名称");
				return;
			}
			if (!assigningItems || assigningItems.length === 0) return;

			setIsProcessingMove(true);
			try {
				// 1. Create new folder in DB
				const updatedFolders = await WorkbenchStorageService.saveFolderToDb({
					name: trimmedName,
					category: newFolderCategory || "工作台",
					desc: `由 AI 问答/搜索结果快捷归类创建，包含 ${assigningItems.length} 个书签`,
				});

				const createdFolder = updatedFolders.find(
					(f) => f.name === trimmedName,
				) || {
					id: Date.now(),
					name: trimmedName,
					category: newFolderCategory,
					createdAt: "刚刚",
					items: [],
				};

				// 2. Move items into newly created folder
				for (const item of assigningItems) {
					await WorkbenchStorageService.moveItemInDb(
						item.id || "",
						item.folderId ?? null,
						createdFolder.id,
					);
				}

				toast.success(
					`已创建「${trimmedName}」并移入 ${assigningItems.length} 项`,
				);
				onSuccess?.(createdFolder, assigningItems);
				closeAssign();
				clearSelection();
				options?.onDataChanged?.();
			} catch (err: any) {
				console.error(
					"[useItemFolderAssign] Create folder and move error:",
					err,
				);
				toast.danger(`创建并移动失败: ${err.message || err}`);
			} finally {
				setIsProcessingMove(false);
			}
		},
		[
			assigningItems,
			newFolderName,
			newFolderCategory,
			closeAssign,
			clearSelection,
			options,
		],
	);

	return {
		assigningItems,
		selectedItemKeys,
		isCreateMode,
		newFolderName,
		newFolderCategory,
		folderFilterQuery,
		isProcessingMove,
		setIsCreateMode,
		setNewFolderName,
		setNewFolderCategory,
		setFolderFilterQuery,
		toggleSelectItem,
		toggleSelectGroup,
		selectAll,
		clearSelection,
		openAssignSingle,
		openAssignMultiple,
		closeAssign,
		moveToExistingFolder,
		createFolderAndMove,
	};
}
