import { toast } from "@heroui/react";
import { useCallback } from "react";
import type {
	Category,
	Folder,
	WorkbenchItem,
} from "../../components/workbench/types";
import { WorkbenchStorageService } from "../../services/workbenchStorage";

export interface UseWorkbenchItemActionsProps {
	setFolders: React.Dispatch<React.SetStateAction<Folder[]>>;
	setUnclassified: React.Dispatch<React.SetStateAction<WorkbenchItem[]>>;
	setActiveCategory: (cat: Category) => void;
	setSelectedFolderId: (id: number | null) => void;
}

/**
 * Sub-hook for handling bookmark item actions (adding links, deleting, moving, import callbacks)
 */
export function useWorkbenchItemActions({
	setFolders,
	setUnclassified,
	setActiveCategory,
	setSelectedFolderId,
}: UseWorkbenchItemActionsProps) {
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
		[setFolders],
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
		[setFolders, setUnclassified],
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
		[setFolders, setUnclassified],
	);

	// Delete item from unclassified pool
	const handleDeleteUnclassifiedItem = useCallback(
		async (item: WorkbenchItem) => {
			const { unclassified: updatedUnclassified } =
				await WorkbenchStorageService.deleteItemInDb(item.id || "", null);
			setUnclassified(updatedUnclassified);
			toast.success(`已从未分类池中移除「${item.name}」`);
		},
		[setUnclassified],
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
		[setFolders, setUnclassified, setActiveCategory, setSelectedFolderId],
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
		[setUnclassified, setActiveCategory],
	);

	return {
		handleAddLink,
		handleDeleteItemFromFolder,
		handleMoveItem,
		handleDeleteUnclassifiedItem,
		handleClassificationComplete,
		handleBookmarksImported,
	};
}
