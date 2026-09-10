import { toast } from "@heroui/react";
import { useRouter } from "@tanstack/react-router";
import { useCallback } from "react";
import type {
	Category,
	Folder,
	FolderViewPrefs,
} from "../../components/workbench/types";
import { WorkbenchStorageService } from "../../services/workbenchStorage";
import { saveActiveCategory } from "./useWorkbenchStorageSync";

export interface SaveFolderPayload {
	id?: number;
	name: string;
	category: string;
	desc: string;
	color?: string;
	parentId?: number | null;
}

export interface UseWorkbenchFolderActionsProps {
	folders: Folder[];
	setFolders: React.Dispatch<React.SetStateAction<Folder[]>>;
	selectedFolderId: number | null;
	setSelectedFolderId: (id: number | null) => void;
	setActiveCategory: (cat: Category) => void;
}

/**
 * Pure helper to check if moving folderId to targetParentId would cause a cycle
 */
function hasDescendantCycle(
	folderId: number,
	targetParentId: number,
	folders: Folder[],
): boolean {
	const byId = new Map(folders.map((f) => [f.id, f]));
	let cursor: number | null = targetParentId;
	const visited = new Set<number>();
	while (cursor !== null && !visited.has(cursor)) {
		if (cursor === folderId) {
			return true;
		}
		visited.add(cursor);
		cursor = byId.get(cursor)?.parentId ?? null;
	}
	return false;
}

/**
 * Pure helper to collect all descendant IDs of a folder
 */
function collectDescendantIds(
	folderId: number,
	folders: Folder[],
): Set<number> {
	const descendantIds = new Set<number>();
	const stack = [folderId];
	while (stack.length > 0) {
		const curr = stack.pop()!;
		for (const f of folders) {
			if (f.parentId === curr) {
				descendantIds.add(f.id);
				stack.push(f.id);
			}
		}
	}
	return descendantIds;
}

/**
 * Sub-hook for handling folder CRUD, reordering, and moving across hierarchies / categories
 */
export function useWorkbenchFolderActions({
	folders,
	setFolders,
	selectedFolderId,
	setSelectedFolderId,
	setActiveCategory,
}: UseWorkbenchFolderActionsProps) {
	// loader 有 30s staleTime 缓存，变更落库后必须 invalidate，
	// 否则切走再切回导航会拿到旧缓存（约定见 src/router.tsx）
	const router = useRouter();

	// Save or edit folder
	const handleSaveFolder = useCallback(
		async (data: SaveFolderPayload) => {
			const updated = await WorkbenchStorageService.saveFolderToDb(data);
			setFolders(updated);
			void router.invalidate();
			setActiveCategory(data.category as Category);
			const createdOrEdited = data.id
				? updated.find((f) => f.id === data.id)
				: updated[updated.length - 1];
			if (createdOrEdited) {
				setSelectedFolderId(createdOrEdited.id);
			}
			toast.success("已保存文件夹至 SQLite 数据库");
		},
		[router, setFolders, setActiveCategory, setSelectedFolderId],
	);

	// Persist per-folder view prefs (card/list, sort, density) with optimistic update
	const handleSaveFolderViewPrefs = useCallback(
		async (folderId: number, prefs: FolderViewPrefs) => {
			const previous = folders;
			setFolders((prev) =>
				prev.map((f) => (f.id === folderId ? { ...f, viewPrefs: prefs } : f)),
			);
			try {
				const updated = await WorkbenchStorageService.saveFolderViewPrefsToDb(
					folderId,
					prefs,
				);
				setFolders(updated);
				void router.invalidate();
			} catch (err) {
				setFolders(previous);
				toast.danger("视图偏好保存失败，已回滚");
				console.warn("[handleSaveFolderViewPrefs] error:", err);
			}
		},
		[folders, router, setFolders],
	);

	// Delete folder
	const handleDeleteFolder = useCallback(
		async (id: number) => {
			const updated = await WorkbenchStorageService.deleteFolderFromDb(id);
			setFolders(updated);
			void router.invalidate();
			if (selectedFolderId === id) {
				setSelectedFolderId(updated[0]?.id || null);
			}
			toast.danger("文件夹已从 SQLite 中删除");
		},
		[router, selectedFolderId, setFolders, setSelectedFolderId],
	);

	// Move folder into another folder (or to top-level), with cycle detection
	const handleMoveFolder = useCallback(
		(folderId: number, targetParentId: number | null) => {
			if (targetParentId !== null) {
				if (hasDescendantCycle(folderId, targetParentId, folders)) {
					toast.danger("无法将文件夹移动到其自身或子文件夹中");
					return;
				}
			}

			const previous = folders;
			// Optimistic update
			setFolders((prev) =>
				prev.map((f) =>
					f.id === folderId ? { ...f, parentId: targetParentId } : f,
				),
			);
			const moved = previous.find((f) => f.id === folderId);
			// 异步落库：乐观更新已生效，失败时回滚
			WorkbenchStorageService.moveFolderInDb(folderId, targetParentId)
				.then(() => {
					void router.invalidate();
					toast.success(
						targetParentId === null
							? `已将「${moved?.name ?? "文件夹"}」移到顶层`
							: `已移动文件夹「${moved?.name ?? ""}」`,
					);
				})
				.catch((err) => {
					setFolders(previous);
					toast.danger(
						err instanceof Error ? err.message : "移动文件夹失败，请重试",
					);
				});
		},
		[folders, router, setFolders],
	);

	// Move folder to top level of a navigation category
	const handleMoveFolderToCategory = useCallback(
		(folderId: number, targetCategory: string) => {
			const targetFolder = folders.find((f) => f.id === folderId);
			if (!targetFolder) return;
			if (
				targetFolder.category === targetCategory &&
				(targetFolder.parentId ?? null) === null
			) {
				return;
			}

			const previous = folders;
			const descendantIds = collectDescendantIds(folderId, folders);

			// Optimistic update: move to target category and root parent
			setFolders((prev) =>
				prev.map((f) => {
					if (f.id === folderId) {
						return { ...f, category: targetCategory, parentId: null };
					}
					if (descendantIds.has(f.id)) {
						return { ...f, category: targetCategory };
					}
					return f;
				}),
			);

			// 异步落库：乐观更新已生效，失败时回滚
			WorkbenchStorageService.moveFolderToCategoryInDb(folderId, targetCategory)
				.then(() => {
					void router.invalidate();
					toast.success(
						`已将「${targetFolder.name}」移动到「${targetCategory}」分类`,
					);
				})
				.catch((err) => {
					setFolders(previous);
					toast.danger(
						err instanceof Error ? err.message : "移动文件夹分类失败，请重试",
					);
				});
		},
		[folders, router, setFolders],
	);

	// Persist sibling folder order (optimistic, rolls back on failure)
	const handleReorderFolders = useCallback(
		(orderedIds: number[]) => {
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
			// 异步落库：乐观顺序已与服务端一致，无需再用响应覆盖本地状态；
			// 落库成功后失效路由缓存，保证切换导航再回来能拿到最新顺序
			WorkbenchStorageService.reorderFoldersInDb(orderedIds)
				.then(() => {
					void router.invalidate();
				})
				.catch(() => {
					setFolders(previous);
					toast.danger("文件夹排序保存失败，请重试");
				});
		},
		[folders, router, setFolders],
	);

	// Batch rename category
	const handleRenameCategory = useCallback(
		async (oldCategory: string, newCategory: string) => {
			try {
				const { folders: updated, count } =
					await WorkbenchStorageService.renameCategory(
						oldCategory,
						newCategory,
					);
				setFolders(updated);
				void router.invalidate();
				setActiveCategory(newCategory as Category);
				saveActiveCategory(newCategory);
				toast.success(
					`已成功重命名分类为「${newCategory}」(${count} 个文件夹)`,
				);
			} catch (error) {
				console.error("Failed to rename category:", error);
				toast.danger("重命名分类失败，请重试");
			}
		},
		[router, setFolders, setActiveCategory],
	);

	return {
		handleSaveFolder,
		handleSaveFolderViewPrefs,
		handleDeleteFolder,
		handleMoveFolder,
		handleMoveFolderToCategory,
		handleReorderFolders,
		handleRenameCategory,
	};
}
