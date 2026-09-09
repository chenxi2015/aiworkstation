import type { Folder, WorkbenchItem } from "../types";

// ================= Drag payload & drop target ids =================

export type ItemDragData = {
	kind: "item";
	item: WorkbenchItem;
	sourceFolderId: number | null;
};

export type FolderDragData = {
	kind: "folder";
	folder: Folder;
};

export type WorkbenchDragData = ItemDragData | FolderDragData;

export const ROOT_CRUMB_DROP_ID = "crumb:root";
export const CHAT_INPUT_DROP_ID = "chat-input-dropzone";

export const folderDropId = (folderId: number) => `folder:${folderId}`;
export const folderRowDropId = (folderId: number) => `folder-row:${folderId}`;
export const crumbDropId = (folderId: number) => `crumb:${folderId}`;
export const categoryDropId = (category: string) => `category:${category}`;
export const itemDragId = (
	itemId: string | number,
	sourceFolderId: number | null,
) => `item:${sourceFolderId ?? "pool"}:${String(itemId)}`;

/** Parse a droppable id back into a structured target */
export function parseDropId(
	id: string | number,
):
	| { type: "folder"; folderId: number }
	| { type: "crumb"; folderId: number }
	| { type: "crumb-root" }
	| { type: "category"; category: string }
	| { type: "chat-input" }
	| null {
	const raw = String(id);
	if (raw === CHAT_INPUT_DROP_ID) return { type: "chat-input" };
	if (raw === ROOT_CRUMB_DROP_ID) return { type: "crumb-root" };
	if (raw.startsWith("category:")) {
		const category = raw.slice(9);
		return category ? { type: "category", category } : null;
	}
	if (raw.startsWith("folder:")) {
		const folderId = Number(raw.slice(7));
		return Number.isFinite(folderId) ? { type: "folder", folderId } : null;
	}
	if (raw.startsWith("folder-row:")) {
		const folderId = Number(raw.slice(11));
		return Number.isFinite(folderId) ? { type: "folder", folderId } : null;
	}
	if (raw.startsWith("crumb:")) {
		const folderId = Number(raw.slice(6));
		return Number.isFinite(folderId) ? { type: "crumb", folderId } : null;
	}
	return null;
}

// ================= Drop indicator types =================

/** 排序位移动画交给 @dnd-kit/react 的 sortable，这里只需标记「合并进文件夹」 */
export type DropMode = "into";

export interface DropIndicator {
	overId: string | null;
	mode: DropMode | null;
}

/**
 * 文件夹拖到文件夹上的合并触发方式：在目标卡片上悬停停留该时长即进入合并态
 *（iOS 主屏幕建文件夹的同款交互）。用停留时间而不是面积/位置阈值，
 * 是因为排序预览会把目标卡片挤开，任何几何阈值都会陷入「追逐目标」的死循环。
 */
export const MERGE_DWELL_MS = 450;

/**
 * 目标卡片被排序预览挤开后，只要指针没有移出该半径，就视为仍在原目标上悬停
 *（以命中目标那一刻的指针位置为锚点，不再依赖目标卡片的实时位置）
 */
export const MERGE_HOLD_RADIUS_PX = 32;

/** Move an item from one index to another (dnd-kit sortable commit 用) */
export function arrayMove<T>(list: T[], from: number, to: number): T[] {
	const next = list.slice();
	const [moved] = next.splice(from, 1);
	next.splice(to, 0, moved);
	return next;
}
