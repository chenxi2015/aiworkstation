import { toast } from "@heroui/react";
import { useCallback } from "react";
import type { Category, Folder } from "../../components/workbench/types";
import { WorkbenchStorageService } from "../../services/workbenchStorage";

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
	// Save or edit folder
	const handleSaveFolder = useCallback(
		async (data: SaveFolderPayload) => {
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
		},
		[setFolders, setActiveCategory, setSelectedFolderId],
	);

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
		[selectedFolderId, setFolders, setSelectedFolderId],
	);

	// Move folder into another folder (or to top-level), with cycle detection
	const handleMoveFolder = useCallback(
		async (folderId: number, targetParentId: number | null) => {
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
		[folders, setFolders],
	);

	// Move folder to top level of a navigation category
	const handleMoveFolderToCategory = useCallback(
		async (folderId: number, targetCategory: string) => {
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

			try {
				const updated = await WorkbenchStorageService.moveFolderToCategoryInDb(
					folderId,
					targetCategory,
				);
				setFolders(updated);
				toast.success(
					`已将「${targetFolder.name}」移动到「${targetCategory}」分类`,
				);
			} catch (err) {
				setFolders(previous);
				toast.danger(
					err instanceof Error ? err.message : "移动文件夹分类失败，请重试",
				);
			}
		},
		[folders, setFolders],
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
		[folders, setFolders],
	);

	return {
		handleSaveFolder,
		handleDeleteFolder,
		handleMoveFolder,
		handleMoveFolderToCategory,
		handleReorderFolders,
	};
}
