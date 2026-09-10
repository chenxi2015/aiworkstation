import { toast } from "@heroui/react";
import { useRouter } from "@tanstack/react-router";
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
	// loader 有 30s staleTime 缓存，变更落库后必须 invalidate，
	// 否则切走再切回导航会拿到旧缓存（约定见 src/router.tsx）
	const router = useRouter();

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
			void router.invalidate();
			toast.success("已将链接保存至文件夹");
		},
		[router, setFolders],
	);

	// Delete item from folder
	const handleDeleteItemFromFolder = useCallback(
		async (item: WorkbenchItem, folderId: number) => {
			const { folders: updatedFolders, unclassified: updatedUnclassified } =
				await WorkbenchStorageService.deleteItemInDb(item.id || "", folderId);
			setFolders(updatedFolders);
			setUnclassified(updatedUnclassified);
			void router.invalidate();
			toast.success(`已从文件夹中移除「${item.name}」`);
		},
		[router, setFolders, setUnclassified],
	);

	// Move item between folders (or from unclassified pool)
	const handleMoveItem = useCallback(
		(
			item: WorkbenchItem,
			sourceFolderId: number | null,
			targetFolderId: number,
		) => {
			// 乐观更新：先从源位置移除，再追加到目标文件夹
			let previousFolders: Folder[] | null = null;
			let previousUnclassified: WorkbenchItem[] | null = null;
			if (sourceFolderId === null) {
				setUnclassified((prev) => {
					previousUnclassified = prev;
					return prev.filter((i) => i.id !== item.id);
				});
			}
			setFolders((prev) => {
				previousFolders = prev;
				return prev.map((f) => {
					if (sourceFolderId !== null && f.id === sourceFolderId) {
						return { ...f, items: f.items.filter((i) => i.id !== item.id) };
					}
					if (f.id === targetFolderId) {
						return { ...f, items: [...f.items, item] };
					}
					return f;
				});
			});
			// 异步落库：失败时回滚
			WorkbenchStorageService.moveItemInDb(
				item.id || "",
				sourceFolderId,
				targetFolderId,
			)
				.then(() => {
					void router.invalidate();
					toast.success(
						sourceFolderId === null
							? `已将「${item.name}」放入目标文件夹`
							: `已将「${item.name}」移动到目标文件夹`,
					);
				})
				.catch(() => {
					if (previousFolders) setFolders(previousFolders);
					if (previousUnclassified) setUnclassified(previousUnclassified);
					toast.danger("移动书签失败，请重试");
				});
		},
		[router, setFolders, setUnclassified],
	);

	// Delete item from unclassified pool
	const handleDeleteUnclassifiedItem = useCallback(
		async (item: WorkbenchItem) => {
			const { unclassified: updatedUnclassified } =
				await WorkbenchStorageService.deleteItemInDb(item.id || "", null);
			setUnclassified(updatedUnclassified);
			void router.invalidate();
			toast.success(`已从未分类池中移除「${item.name}」`);
		},
		[router, setUnclassified],
	);

	// Clear all items from unclassified pool
	const handleClearUnclassified = useCallback(async () => {
		const { deleted, unclassified: updatedUnclassified } =
			await WorkbenchStorageService.clearUnclassifiedInDb();
		setUnclassified(updatedUnclassified);
		void router.invalidate();
		toast.success(`已清空未分类池 (${deleted} 条书签)`);
	}, [router, setUnclassified]);

	// Handle AI classification completion
	const handleClassificationComplete = useCallback(
		(updatedFolders: Folder[], updatedUnclassified: WorkbenchItem[]) => {
			setFolders(updatedFolders);
			setUnclassified(updatedUnclassified);
			void router.invalidate();
			if (updatedFolders.length > 0) {
				setActiveCategory(updatedFolders[0].category || "工作台");
				setSelectedFolderId(updatedFolders[0].id);
			}
		},
		[
			router,
			setFolders,
			setUnclassified,
			setActiveCategory,
			setSelectedFolderId,
		],
	);

	// Handle bookmark import completion
	const handleBookmarksImported = useCallback(
		(newUnclassified: WorkbenchItem[], onTriggerAI?: () => void) => {
			setUnclassified(newUnclassified);
			void router.invalidate();
			setActiveCategory("未分类");
			if (onTriggerAI) {
				onTriggerAI();
			}
		},
		[router, setUnclassified, setActiveCategory],
	);

	return {
		handleAddLink,
		handleDeleteItemFromFolder,
		handleMoveItem,
		handleDeleteUnclassifiedItem,
		handleClearUnclassified,
		handleClassificationComplete,
		handleBookmarksImported,
	};
}
