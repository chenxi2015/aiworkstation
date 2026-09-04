import {
	type CollisionDetection,
	DndContext,
	type DragEndEvent,
	type DragMoveEvent,
	DragOverlay,
	type DragStartEvent,
	PointerSensor,
	pointerWithin,
	useDraggable,
	useDroppable,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import { snapCenterToCursor } from "@dnd-kit/modifiers";
import { Folder as FolderIconLucide } from "lucide-react";
import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useMemo,
	useState,
} from "react";
import { ItemFavicon } from "../ItemFavicon";
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
export const itemDragId = (
	itemId: string | number,
	sourceFolderId: number | null,
) => `item:${sourceFolderId ?? "pool"}:${String(itemId)}`;

/**
 * pointerWithin returns every droppable under the cursor, including the grid
 * background behind cards. Prefer specific targets (cards / breadcrumbs).
 */
const preferSpecificTargets: CollisionDetection = (args) => {
	const collisions = pointerWithin(args);
	const specific = collisions.filter((c) => String(c.id) !== GRID_DROP_ID);
	return specific.length > 0 ? specific : collisions;
};

/** Parse a droppable id back into a structured target */
function parseDropId(
	id: string | number,
):
	| { type: "folder"; folderId: number }
	| { type: "crumb"; folderId: number }
	| { type: "crumb-root" }
	| { type: "grid" }
	| null {
	const raw = String(id);
	if (raw === GRID_DROP_ID) return { type: "grid" };
	if (raw === ROOT_CRUMB_DROP_ID) return { type: "crumb-root" };
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

// ================= Drop indicator context =================

export type DropMode = "into" | "before" | "after";

interface DropIndicator {
	overId: string | null;
	mode: DropMode | null;
}

const DropIndicatorContext = createContext<DropIndicator>({
	overId: null,
	mode: null,
});

/** Read the current drop highlight for a folder card (null-safe outside provider) */
export function useFolderDropIndicator(folderId: number): DropMode | null {
	const indicator = useContext(DropIndicatorContext);
	return indicator.overId === folderDropId(folderId) ? indicator.mode : null;
}

// ================= Provider =================

export interface WorkbenchDndProviderProps {
	/** Ids of the folders currently rendered in the grid, in display order */
	gridFolderIds: number[];
	onMoveItemToFolder: (
		item: WorkbenchItem,
		sourceFolderId: number | null,
		targetFolderId: number,
	) => void;
	onMoveFolder: (folderId: number, targetParentId: number | null) => void;
	onReorderFolders: (orderedIds: number[]) => void;
	children: ReactNode;
}

/** Central zone ratio of a folder card that means "drop INTO" instead of reorder */
const INTO_ZONE_MIN = 0.3;
const INTO_ZONE_MAX = 0.7;

export function WorkbenchDndProvider({
	gridFolderIds,
	onMoveItemToFolder,
	onMoveFolder,
	onReorderFolders,
	children,
}: WorkbenchDndProviderProps) {
	const [activeDrag, setActiveDrag] = useState<WorkbenchDragData | null>(null);
	const [indicator, setIndicator] = useState<DropIndicator>({
		overId: null,
		mode: null,
	});

	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
	);

	// Compute pointer position relative to the hovered droppable rect
	const resolveMode = useCallback(
		(event: DragMoveEvent, overId: string): DropMode | null => {
			const data = event.active.data.current as WorkbenchDragData | undefined;
			const target = parseDropId(overId);
			if (!data || !target) return null;

			if (target.type === "crumb" || target.type === "crumb-root") {
				// Items cannot live at category root
				if (data.kind === "item" && target.type === "crumb-root") return null;
				return "into";
			}
			if (target.type === "grid") return null;

			// Hovering a folder card
			if (data.kind === "item") return "into";
			if (data.folder.id === target.folderId) return null;

			// Folder over folder: pointer zone decides reorder vs nest
			const overRect = event.over?.rect;
			const activator = event.activatorEvent as Partial<PointerEvent>;
			if (!overRect || typeof activator.clientX !== "number") return "into";
			const pointerX = activator.clientX + event.delta.x;
			const relX = (pointerX - overRect.left) / overRect.width;
			if (relX >= INTO_ZONE_MIN && relX <= INTO_ZONE_MAX) return "into";
			return relX < INTO_ZONE_MIN ? "before" : "after";
		},
		[],
	);

	const handleDragStart = useCallback((event: DragStartEvent) => {
		setActiveDrag(
			(event.active.data.current as WorkbenchDragData | undefined) ?? null,
		);
	}, []);

	const handleDragMove = useCallback(
		(event: DragMoveEvent) => {
			const overId = event.over ? String(event.over.id) : null;
			if (!overId) {
				setIndicator({ overId: null, mode: null });
				return;
			}
			setIndicator({ overId, mode: resolveMode(event, overId) });
		},
		[resolveMode],
	);

	const resetDrag = useCallback(() => {
		setActiveDrag(null);
		setIndicator({ overId: null, mode: null });
	}, []);

	const handleDragEnd = useCallback(
		(event: DragEndEvent) => {
			const data = event.active.data.current as WorkbenchDragData | undefined;
			const overId = event.over ? String(event.over.id) : null;
			const mode = overId ? resolveMode(event, overId) : null;
			resetDrag();
			if (!data || !overId) return;
			const target = parseDropId(overId);
			if (!target) return;

			if (data.kind === "item") {
				if (
					target.type === "folder" &&
					target.folderId !== data.sourceFolderId
				) {
					onMoveItemToFolder(data.item, data.sourceFolderId, target.folderId);
				} else if (target.type === "crumb") {
					onMoveItemToFolder(data.item, data.sourceFolderId, target.folderId);
				}
				return;
			}

			// Folder drags
			const folderId = data.folder.id;
			if (target.type === "crumb") {
				if (target.folderId !== folderId)
					onMoveFolder(folderId, target.folderId);
				return;
			}
			if (target.type === "crumb-root") {
				onMoveFolder(folderId, null);
				return;
			}
			if (target.type === "folder" && target.folderId !== folderId) {
				if (mode === "into") {
					onMoveFolder(folderId, target.folderId);
				} else if (mode === "before" || mode === "after") {
					const next = gridFolderIds.filter((id) => id !== folderId);
					const targetIndex = next.indexOf(target.folderId);
					if (targetIndex === -1) return;
					next.splice(
						mode === "before" ? targetIndex : targetIndex + 1,
						0,
						folderId,
					);
					if (next.join(",") !== gridFolderIds.join(",")) {
						onReorderFolders(next);
					}
				}
				return;
			}
			if (target.type === "grid") {
				// Drop on empty grid area: move to the end
				const next = gridFolderIds.filter((id) => id !== folderId);
				next.push(folderId);
				if (next.join(",") !== gridFolderIds.join(",")) {
					onReorderFolders(next);
				}
			}
		},
		[
			gridFolderIds,
			onMoveFolder,
			onMoveItemToFolder,
			onReorderFolders,
			resetDrag,
			resolveMode,
		],
	);

	const indicatorValue = useMemo(() => indicator, [indicator]);

	return (
		<DropIndicatorContext.Provider value={indicatorValue}>
			<DndContext
				sensors={sensors}
				collisionDetection={preferSpecificTargets}
				onDragStart={handleDragStart}
				onDragMove={handleDragMove}
				onDragEnd={handleDragEnd}
				onDragCancel={resetDrag}
			>
				{children}
				<DragOverlay dropAnimation={null} modifiers={[snapCenterToCursor]}>
					{activeDrag?.kind === "item" ? (
						<div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-surface border border-accent/50 shadow-lg max-w-[260px]">
							<ItemFavicon
								url={activeDrag.item.url}
								favicon={activeDrag.item.favicon}
								type={activeDrag.item.type}
								name={activeDrag.item.name}
								size="xs"
							/>
							<span className="text-xs font-medium text-foreground truncate">
								{activeDrag.item.name}
							</span>
						</div>
					) : activeDrag?.kind === "folder" ? (
						<div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-surface border border-accent/50 shadow-lg max-w-[260px]">
							<FolderIconLucide className="w-4 h-4 text-accent shrink-0" />
							<span className="text-xs font-medium text-foreground truncate">
								{activeDrag.folder.name}
							</span>
						</div>
					) : null}
				</DragOverlay>
			</DndContext>
		</DropIndicatorContext.Provider>
	);
}

// ================= Draggable item row =================

export interface DraggableItemProps {
	item: WorkbenchItem;
	sourceFolderId: number | null;
	children: ReactNode;
	className?: string;
}

/** Wraps a bookmark row so it can be dragged onto folder cards / breadcrumbs */
export function DraggableItem({
	item,
	sourceFolderId,
	children,
	className,
}: DraggableItemProps) {
	const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
		id: itemDragId(item.id ?? item.name, sourceFolderId),
		data: { kind: "item", item, sourceFolderId } satisfies ItemDragData,
	});

	return (
		<div
			ref={setNodeRef}
			{...listeners}
			{...attributes}
			className={`min-w-0 ${isDragging ? "opacity-40" : ""} ${className || ""}`.trim()}
		>
			{children}
		</div>
	);
}

// ================= Folder card slot (draggable + droppable) =================

export interface FolderCardSlotProps {
	folder: Folder;
	children: ReactNode;
}

/** Makes a folder card both draggable (reorder / nest) and a drop target */
export function FolderCardSlot({ folder, children }: FolderCardSlotProps) {
	const {
		attributes,
		listeners,
		setNodeRef: setDragRef,
		isDragging,
	} = useDraggable({
		id: folderDropId(folder.id),
		data: { kind: "folder", folder } satisfies FolderDragData,
	});
	const { setNodeRef: setDropRef } = useDroppable({
		id: folderDropId(folder.id),
	});

	return (
		<div
			ref={(node) => {
				setDragRef(node);
				setDropRef(node);
			}}
			{...listeners}
			{...attributes}
			className={isDragging ? "opacity-40" : undefined}
		>
			{children}
		</div>
	);
}

// ================= Grid background drop zone =================

export function FolderGridDropZone({ children }: { children: ReactNode }) {
	const { setNodeRef } = useDroppable({ id: GRID_DROP_ID });
	return <div ref={setNodeRef}>{children}</div>;
}
