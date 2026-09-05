import { useDroppable } from "@dnd-kit/core";
import { Button, EmptyState, ScrollShadow } from "@heroui/react";
import {
	ChevronRight,
	CornerUpLeft,
	Folder as FolderIconLucide,
	FolderPlus,
} from "lucide-react";
import { memo, useState } from "react";
import { folderRowDropId } from "./dnd/dndUtils";
import { FolderHeader } from "./folder/FolderHeader";
import { FolderItemList } from "./folder/FolderItemList";
import type { Folder, WorkbenchItem } from "./types";

export interface FolderDetailPanelProps {
	folder: Folder | null;
	categoryFolders?: Folder[];
	allFolders?: Folder[];
	onSelectFolder?: (id: number) => void;
	onCreateFolder?: () => void;
	onEdit: (folder: Folder) => void;
	onDeleteItem?: (item: WorkbenchItem, folderId: number) => void;
	onMoveItem?: (
		item: WorkbenchItem,
		sourceFolderId: number,
		targetFolderId: number,
	) => void;
	onAskAIAboutFolder?: (prompt: string) => void;
}

interface SubfolderRowProps {
	folder: Folder;
	onSelect: (id: number) => void;
}

/** Subfolder row inside the detail panel: click to drill in, also a drop target */
function SubfolderRow({ folder, onSelect }: SubfolderRowProps) {
	const { setNodeRef, isOver } = useDroppable({
		id: folderRowDropId(folder.id),
	});

	return (
		<button
			ref={setNodeRef}
			type="button"
			onClick={() => onSelect(folder.id)}
			className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl border text-left transition-all cursor-pointer group/row ${
				isOver
					? "bg-accent-soft border-accent/50 ring-1 ring-accent/40"
					: "border-transparent hover:bg-surface-secondary/70 hover:border-border/60"
			}`}
			title={`进入「${folder.name}」`}
		>
			<div className="w-5 h-5 rounded-md bg-accent/10 flex items-center justify-center shrink-0 text-accent">
				<FolderIconLucide className="w-3 h-3" />
			</div>
			<span className="text-xs font-medium text-foreground truncate flex-1">
				{folder.name}
			</span>
			<span className="text-[10px] text-muted shrink-0">
				{folder.items.length} 项
			</span>
			<ChevronRight className="w-3 h-3 text-muted/50 shrink-0 group-hover/row:text-accent transition-colors" />
		</button>
	);
}

/**
 * Clean & compact Left sidebar detail panel presenting selected folder's contents and quick actions
 */
export const FolderDetailPanel = memo(function FolderDetailPanel({
	folder,
	categoryFolders = [],
	allFolders = [],
	onSelectFolder,
	onCreateFolder,
	onEdit,
	onDeleteItem,
	onMoveItem,
	onAskAIAboutFolder,
}: FolderDetailPanelProps) {
	const [typeFilter, setTypeFilter] = useState("all");

	// 1. Empty State when no folder is selected or no folders in category
	if (!folder) {
		return (
			<aside className="w-[280px] xl:w-[310px] 2xl:w-[330px] shrink-0 bg-surface/90 backdrop-blur-md border-r border-border p-5 flex flex-col items-center justify-center text-center h-full">
				<EmptyState className="p-0 flex flex-col items-center justify-center text-center max-w-[240px]">
					<div className="w-12 h-12 rounded-2xl bg-gradient-to-b from-accent/15 to-accent/5 border border-accent/20 flex items-center justify-center text-accent mb-3 shadow-xs">
						<FolderIconLucide className="w-6 h-6 opacity-80" />
					</div>
					<h3 className="text-sm font-bold text-foreground mb-1 tracking-tight">
						{categoryFolders.length === 0
							? "该分类下暂无文件夹"
							: "选择一个文件夹"}
					</h3>
					<p className="text-[11px] text-muted leading-relaxed mb-3">
						{categoryFolders.length === 0
							? "点击新建文件夹或在未分类中通过 AI 归类。"
							: "点击主视图中的文件夹卡片查看归集内容"}
					</p>
					{onCreateFolder && (
						<Button
							variant="primary"
							size="sm"
							className="rounded-full shadow-xs flex items-center gap-1.5 cursor-pointer text-xs h-7 px-3"
							onPress={onCreateFolder}
						>
							<FolderPlus className="w-3 h-3" />
							<span>新建文件夹</span>
						</Button>
					)}
				</EmptyState>
			</aside>
		);
	}

	// Subfolders of the selected folder and its parent (for back navigation)
	const childFolders = allFolders.filter(
		(f) => (f.parentId ?? null) === folder.id,
	);
	const parentFolder =
		folder.parentId != null
			? (allFolders.find((f) => f.id === folder.parentId) ?? null)
			: null;

	return (
		<aside className="w-[280px] xl:w-[310px] 2xl:w-[330px] shrink-0 bg-surface/95 backdrop-blur-md border-r border-border flex flex-col h-full shadow-xs">
			<ScrollShadow className="flex-1 px-3 py-3 overflow-y-auto">
				{/* Back to parent folder */}
				{parentFolder && onSelectFolder && (
					<button
						type="button"
						onClick={() => onSelectFolder(parentFolder.id)}
						className="w-full flex items-center gap-1.5 px-2 py-1 mb-1.5 rounded-lg text-[11px] font-medium text-muted hover:text-foreground hover:bg-surface-secondary/70 transition-colors cursor-pointer"
						title={`返回「${parentFolder.name}」`}
					>
						<CornerUpLeft className="w-3 h-3 shrink-0" />
						<span className="truncate">返回 {parentFolder.name}</span>
					</button>
				)}

				{/* Streamlined Folder Header */}
				<FolderHeader
					folder={folder}
					onEdit={onEdit}
					onAskAI={onAskAIAboutFolder}
				/>

				{/* Subfolder list */}
				{childFolders.length > 0 && onSelectFolder && (
					<div className="my-3 space-y-1">
						<div className="flex items-center gap-1.5 px-0.5 pb-1 text-xs font-semibold text-foreground tracking-tight">
							<span>子文件夹</span>
							<span className="text-[10px] text-muted font-mono bg-surface-secondary px-1.5 py-0.2 rounded-md">
								{childFolders.length}
							</span>
						</div>
						{childFolders.map((child) => (
							<SubfolderRow
								key={child.id}
								folder={child}
								onSelect={onSelectFolder}
							/>
						))}
					</div>
				)}

				{/* Searchable, Filterable & Toggleable Bookmark List */}
				<FolderItemList
					folder={folder}
					allFolders={allFolders}
					onDeleteItem={onDeleteItem}
					onMoveItem={onMoveItem}
					selectedTypeFilter={typeFilter}
					onSelectTypeFilter={setTypeFilter}
				/>
			</ScrollShadow>
		</aside>
	);
});
