import {
	DndContext,
	type DragEndEvent,
	type DragMoveEvent,
	DragOverlay,
	type DragStartEvent,
	PointerSensor,
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
import {
	type DropIndicator,
	type DropMode,
	type FolderDragData,
	GRID_DROP_ID,
	INTO_ZONE_MAX,
	INTO_ZONE_MIN,
	type ItemDragData,
	parseDropId,
	preferSpecificTargets,
	type WorkbenchDragData,
	folderDropId,
	itemDragId,
} from "./dndUtils";

export type {
	ItemDragData,
	FolderDragData,
	WorkbenchDragData,
	DropMode,
	DropIndicator,
};

// ================= Drop indicator context =================

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
	onMoveFolderToCategory?: (folderId: number, targetCategory: string) => void;
	onReorderFolders: (orderedIds: number[]) => void;
	children: ReactNode;
}

export function WorkbenchDndProvider({
	gridFolderIds,
	onMoveItemToFolder,
	onMoveFolder,
	onMoveFolderToCategory,
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
			if (target.type === "category") return "into";
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
			if (target.type === "category") {
				if (target.category !== "未分类") {
					onMoveFolderToCategory?.(folderId, target.category);
				}
				return;
			}
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
			onMoveFolderToCategory,
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
				id="workbench-dnd"
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
