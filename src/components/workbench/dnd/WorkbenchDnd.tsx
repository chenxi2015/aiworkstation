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
	useEffect,
	useRef,
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
	MERGE_DWELL_MS,
	MERGE_HOLD_RADIUS_PX,
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
	// 已确认进入合并态的目标文件夹（指示框已亮起，松手即合并）
	const mergeTargetRef = useRef<number | null>(null);
	// 悬停计时：命中目标那一刻锚定指针位置，目标被排序预览挤开也不影响计时
	const dwellRef = useRef<{
		folderId: number | null;
		x: number;
		y: number;
		timer: number | null;
	}>({ folderId: null, x: 0, y: 0, timer: null });

	const clearDwell = useCallback(() => {
		if (dwellRef.current.timer !== null) {
			window.clearTimeout(dwellRef.current.timer);
		}
		dwellRef.current.folderId = null;
		dwellRef.current.timer = null;
		mergeTargetRef.current = null;
	}, []);

	useEffect(() => clearDwell, [clearDwell]);

	const handleDragMove = useCallback(
		(event: DragMoveEvent) => {
			const { operation } = event;
			const data = operation.source?.data as WorkbenchDragData | undefined;
			if (!data) return;

			if (data.kind === "item") {
				// 书签不是 sortable，target 不会被插件劫持，直接读即可
				let overId: string | null = null;
				const target = operation.target;
				if (target) {
					const parsed = parseDropId(target.id);
					if (
						parsed?.type === "folder" &&
						parsed.folderId !== data.sourceFolderId
					) {
						overId = String(target.id);
					}
				}
				setIndicator((prev) =>
					prev.overId === overId
						? prev
						: { overId, mode: overId ? "into" : null },
				);
				return;
			}

			// 文件夹拖拽：dwell 式合并。指针命中卡片后开始计时，停留
			// MERGE_DWELL_MS 进入合并态；目标被排序预览挤开时，
			// 只要指针没有明显移动（仍在锚点半径内）就继续计时。
			const folderId = data.folder.id;
			const position = operation.position.current;
			const hit = hitTestFolderCard(position);
			const hitId = hit && hit.folderId !== folderId ? hit.folderId : null;
			const dwell = dwellRef.current;
			const anchoredId = mergeTargetRef.current ?? dwell.folderId;

			if (anchoredId !== null) {
				const dx = position.x - dwell.x;
				const dy = position.y - dwell.y;
				const held =
					dx * dx + dy * dy <= MERGE_HOLD_RADIUS_PX * MERGE_HOLD_RADIUS_PX;
				if (hitId === anchoredId) {
					// 指针仍在这张卡片上：重新锚定，允许在卡片范围内随意移动
					dwell.x = position.x;
					dwell.y = position.y;
					return;
				}
				// 目标被排序预览挤开：以原锚点判断，指针没明显移动就继续计时。
				// 注意这里不能重新锚定，否则慢速拖走会无限续命
				if (held) return;
				// 指针移开：取消计时与合并态
				clearDwell();
				setIndicator((prev) =>
					prev.overId === null ? prev : { overId: null, mode: null },
				);
			}

			if (hitId === null) return;
			dwell.folderId = hitId;
			dwell.x = position.x;
			dwell.y = position.y;
			dwell.timer = window.setTimeout(() => {
				dwellRef.current.folderId = null;
				dwellRef.current.timer = null;
				mergeTargetRef.current = hitId;
				setIndicator({ overId: folderDropId(hitId), mode: "into" });
			}, MERGE_DWELL_MS);
		},
		[clearDwell],
	);

	const resetDrag = useCallback(() => {
		clearDwell();
		setIndicator((prev) =>
			prev.overId === null ? prev : { overId: null, mode: null },
		);
	}, [clearDwell]);

	const handleDragEnd = useCallback(
		(event: DragEndEvent) => {
			const { source, target } = event.operation;
			const data = source?.data as WorkbenchDragData | undefined;
			// 合并目标要在 resetDrag 清空前取出来
			const mergeTargetId =
				data?.kind === "folder" ? mergeTargetRef.current : null;
			resetDrag();
			if (event.canceled || !data) return;

			if (
				data.kind === "folder" &&
				mergeTargetId !== null &&
				mergeTargetId !== data.folder.id
			) {
				// 合并进文件夹：不再提交排序，乐观排序动过的 DOM 由状态重渲染对齐
				onMoveFolder(data.folder.id, mergeTargetId);
				return;
			}

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
