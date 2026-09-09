import {
	DragDropProvider,
	type DragEndEvent,
	type DragMoveEvent,
	useDraggable,
} from "@dnd-kit/react";
import { isSortable, useSortable } from "@dnd-kit/react/sortable";
import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useState,
} from "react";
import type { Folder, WorkbenchItem } from "../types";
import {
	arrayMove,
	type DropIndicator,
	type DropMode,
	type FolderDragData,
	folderDropId,
	type ItemDragData,
	itemDragId,
	MERGE_COVER_RATIO,
	parseDropId,
	type WorkbenchDragData,
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

/**
 * 指针位置下最近的文件夹卡片。
 * 拖拽中的元素是 pointer-events:none 的，会被 elementFromPoint 自然跳过；
 * 隐形占位 clone 是 visibility:hidden，同样不会被命中。
 *
 * 为什么不读 operation.target：sortable 的乐观排序插件在每次重排后会把
 * drop target 重置为拖拽源本身，拖文件夹时 target 大部分时间是错的。
 */
function hitTestFolderCard(point: {
	x: number;
	y: number;
}): { folderId: number; rect: DOMRect } | null {
	const el = document.elementFromPoint(point.x, point.y);
	const card = el instanceof Element ? el.closest("[data-folder-id]") : null;
	if (!card) return null;
	const folderId = Number(card.getAttribute("data-folder-id"));
	return Number.isFinite(folderId)
		? { folderId, rect: card.getBoundingClientRect() }
		: null;
}

interface RectLike {
	left: number;
	top: number;
	width: number;
	height: number;
}

/** 两个矩形的交集面积 */
function intersectionArea(a: RectLike, b: RectLike): number {
	const w = Math.max(
		0,
		Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left),
	);
	const h = Math.max(
		0,
		Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top),
	);
	return w * h;
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
	onAttachToChat?: (data: WorkbenchDragData) => void;
	children: ReactNode;
}

export function WorkbenchDndProvider({
	gridFolderIds,
	onMoveItemToFolder,
	onMoveFolder,
	onMoveFolderToCategory,
	onReorderFolders,
	onAttachToChat,
	children,
}: WorkbenchDndProviderProps) {
	const [indicator, setIndicator] = useState<DropIndicator>({
		overId: null,
		mode: null,
	});

	/**
	 * 当前拖拽是否命中某个文件夹卡片的「合并区」，命中返回该卡片的 droppable id。
	 * 书签拖到卡片上整卡都是放入目标；文件夹拖到文件夹按覆盖面积判定：
	 * 拖拽卡片盖住目标卡片超过 MERGE_COVER_RATIO 才算合并，其余交给排序位移。
	 */
	const resolveIntoTarget = useCallback(
		(operation: DragMoveEvent["operation"]): string | null => {
			const { source } = operation;
			const data = source?.data as WorkbenchDragData | undefined;
			if (!data) return null;
			if (data.kind === "item") {
				// 书签不是 sortable，target 不会被插件劫持，直接读即可
				const target = operation.target;
				if (!target) return null;
				const parsed = parseDropId(target.id);
				if (!parsed || parsed.type !== "folder") return null;
				return data.sourceFolderId === parsed.folderId
					? null
					: String(target.id);
			}
			// 文件夹拖拽：shape.current 是拖拽卡片的实时位置，
			// 用其中心点命中目标卡片，再按覆盖面积比例判定合并
			const draggedRect = operation.shape?.current.boundingRectangle;
			if (!draggedRect) return null;
			const hit = hitTestFolderCard({
				x: draggedRect.left + draggedRect.width / 2,
				y: draggedRect.top + draggedRect.height / 2,
			});
			if (!hit || hit.folderId === data.folder.id) return null;
			const cover =
				intersectionArea(draggedRect, hit.rect) /
				(hit.rect.width * hit.rect.height);
			return cover >= MERGE_COVER_RATIO ? folderDropId(hit.folderId) : null;
		},
		[],
	);

	const handleDragMove = useCallback(
		(event: DragMoveEvent) => {
			const overId = resolveIntoTarget(event.operation);
			setIndicator((prev) =>
				prev.overId === overId
					? prev
					: { overId, mode: overId ? "into" : null },
			);
		},
		[resolveIntoTarget],
	);

	const resetDrag = useCallback(() => {
		setIndicator((prev) =>
			prev.overId === null ? prev : { overId: null, mode: null },
		);
	}, []);

	const handleDragEnd = useCallback(
		(event: DragEndEvent) => {
			const { source, target } = event.operation;
			const data = source?.data as WorkbenchDragData | undefined;
			resetDrag();
			if (event.canceled || !data) return;

			// sortable 的乐观排序在拖拽过程中已移动 DOM，这里统一提交顺序，
			// 保证 DOM 与状态一致（书签拖拽不是 sortable，自动跳过）
			if (source && isSortable(source)) {
				const { initialIndex, index } = source.sortable;
				if (
					initialIndex !== index &&
					initialIndex >= 0 &&
					index >= 0 &&
					index < gridFolderIds.length
				) {
					onReorderFolders(arrayMove(gridFolderIds, initialIndex, index));
				}
			}
			if (!target) return;
			const parsed = parseDropId(target.id);
			if (!parsed) return;

			if (parsed.type === "chat-input") {
				onAttachToChat?.(data);
				return;
			}

			if (data.kind === "item") {
				if (
					(parsed.type === "folder" &&
						parsed.folderId !== data.sourceFolderId) ||
					parsed.type === "crumb"
				) {
					onMoveItemToFolder(data.item, data.sourceFolderId, parsed.folderId);
				}
				return;
			}

			const folderId = data.folder.id;
			// 合并判定用指针命中：sortable 插件会把 operation.target 重置为拖拽源，
			// 这里直接看指针落在哪张卡片的中间区域
			const intoId = resolveIntoTarget(event.operation);
			if (intoId) {
				const parsedInto = parseDropId(intoId);
				if (parsedInto?.type === "folder" && parsedInto.folderId !== folderId) {
					onMoveFolder(folderId, parsedInto.folderId);
					return;
				}
			}
			if (parsed.type === "category") {
				if (parsed.category !== "未分类") {
					onMoveFolderToCategory?.(folderId, parsed.category);
				}
			} else if (parsed.type === "crumb") {
				if (parsed.folderId !== folderId)
					onMoveFolder(folderId, parsed.folderId);
			} else if (parsed.type === "crumb-root") {
				onMoveFolder(folderId, null);
			}
		},
		[
			gridFolderIds,
			onAttachToChat,
			onMoveFolder,
			onMoveFolderToCategory,
			onMoveItemToFolder,
			onReorderFolders,
			resetDrag,
			resolveIntoTarget,
		],
	);

	return (
		<DropIndicatorContext.Provider value={indicator}>
			<DragDropProvider onDragMove={handleDragMove} onDragEnd={handleDragEnd}>
				{children}
			</DragDropProvider>
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
	const { ref } = useDraggable({
		id: itemDragId(item.id ?? item.name, sourceFolderId),
		data: { kind: "item", item, sourceFolderId } satisfies ItemDragData,
	});

	return (
		<div ref={ref} className={`min-w-0 ${className || ""}`.trim()}>
			{children}
		</div>
	);
}

// ================= Folder card slot (sortable: drag to reorder / nest) =================

export interface FolderCardSlotProps {
	folder: Folder;
	/** 在当前的展示顺序中的下标，驱动 sortable 的位移动画 */
	index: number;
	children: ReactNode;
}

/**
 * Makes a folder card sortable: smooth reorder animation + drop target for nesting.
 * 注意：该 div 必须是网格/列表容器的直接子元素，乐观排序会物理移动它，
 * 中间再包一层会导致 DOM 被移出原位（网格错位、列表间距异常）。
 */
export function FolderCardSlot({
	folder,
	index,
	children,
}: FolderCardSlotProps) {
	const { ref } = useSortable({
		id: folderDropId(folder.id),
		index,
		data: { kind: "folder", folder } satisfies FolderDragData,
	});

	return (
		<div ref={ref} data-folder-id={folder.id} className="min-w-0 w-full">
			{children}
		</div>
	);
}
