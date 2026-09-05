import { type CollisionDetection, pointerWithin } from "@dnd-kit/core";
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

export const GRID_DROP_ID = "folder-grid";
export const ROOT_CRUMB_DROP_ID = "crumb:root";

export const folderDropId = (folderId: number) => `folder:${folderId}`;
export const folderRowDropId = (folderId: number) => `folder-row:${folderId}`;
export const crumbDropId = (folderId: number) => `crumb:${folderId}`;
export const categoryDropId = (category: string) => `category:${category}`;
export const itemDragId = (
	itemId: string | number,
	sourceFolderId: number | null,
) => `item:${sourceFolderId ?? "pool"}:${String(itemId)}`;

/**
 * pointerWithin returns every droppable under the cursor, including the grid
 * background behind cards. Prefer specific targets (cards / breadcrumbs).
 */
export const preferSpecificTargets: CollisionDetection = (args) => {
	const collisions = pointerWithin(args);
	const specific = collisions.filter((c) => String(c.id) !== GRID_DROP_ID);
	return specific.length > 0 ? specific : collisions;
};

/** Parse a droppable id back into a structured target */
export function parseDropId(
	id: string | number,
):
	| { type: "folder"; folderId: number }
	| { type: "crumb"; folderId: number }
	| { type: "crumb-root" }
	| { type: "category"; category: string }
	| { type: "grid" }
	| null {
	const raw = String(id);
	if (raw === GRID_DROP_ID) return { type: "grid" };
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

export type DropMode = "into" | "before" | "after";

export interface DropIndicator {
	overId: string | null;
	mode: DropMode | null;
}

/** Central zone ratio of a folder card that means "drop INTO" instead of reorder */
export const INTO_ZONE_MIN = 0.3;
export const INTO_ZONE_MAX = 0.7;
