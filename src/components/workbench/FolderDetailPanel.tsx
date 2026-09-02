import { EmptyState, ScrollShadow, Separator } from "@heroui/react";
import { Folder as FolderIconLucide, Sparkles } from "lucide-react";
import { useState } from "react";
import { FolderGridPreview } from "./folder/FolderGridPreview";
import { FolderHeader } from "./folder/FolderHeader";
import { FolderItemList } from "./folder/FolderItemList";
import type { Folder, WorkbenchItem } from "./types";

export interface FolderDetailPanelProps {
	folder: Folder | null;
	allFolders?: Folder[];
	onEdit: (folder: Folder) => void;
	onDeleteItem?: (item: WorkbenchItem, folderId: number) => void;
	onMoveItem?: (
		item: WorkbenchItem,
		sourceFolderId: number,
		targetFolderId: number,
	) => void;
	onOpenDossier?: (folder: Folder) => void;
}

/**
 * Right sidebar detail drawer container presenting selected folder's contents and actions
 */
export function FolderDetailPanel({
	folder,
	allFolders = [],
	onEdit,
	onDeleteItem,
	onMoveItem,
	onOpenDossier,
}: FolderDetailPanelProps) {
	const [typeFilter, setTypeFilter] = useState("all");

	// 1. Empty State when no folder is selected
	if (!folder) {
		return (
			<aside className="w-[380px] xl:w-[410px] shrink-0 bg-surface/90 backdrop-blur-md border-l border-border p-7 flex flex-col items-center justify-center text-center h-[calc(100vh-60px)] sticky top-[60px]">
				<EmptyState className="p-0 flex flex-col items-center justify-center text-center max-w-[280px]">
					<div className="w-16 h-16 rounded-3xl bg-gradient-to-b from-accent/15 to-accent/5 border border-accent/20 flex items-center justify-center text-accent mb-4 shadow-xs">
						<FolderIconLucide className="w-8 h-8 opacity-80" />
					</div>
					<h3 className="text-base font-bold text-foreground mb-1.5 tracking-tight">
						选择一个文件夹
					</h3>
					<p className="text-xs text-muted leading-relaxed mb-4">
						点击左侧任意文件夹卡片，查看其中归集的内容、九宫格快捷看板与工具外链
					</p>
					<div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-secondary text-[11px] text-muted border border-border/60">
						<Sparkles className="w-3 h-3 text-accent" />
						<span>支持九宫格预览与快捷外链跳转</span>
					</div>
				</EmptyState>
			</aside>
		);
	}

	return (
		<aside className="w-[380px] xl:w-[410px] shrink-0 bg-surface/95 backdrop-blur-md border-l border-border flex flex-col h-[calc(100vh-60px)] sticky top-[60px] shadow-xs">
			<ScrollShadow className="flex-1 px-5 py-5 overflow-y-auto">
				{/* Top Header Card */}
				<FolderHeader
					folder={folder}
					onEdit={onEdit}
					onOpenDossier={onOpenDossier}
				/>

				{/* 9-Grid Preview Section */}
				<FolderGridPreview
					folder={folder}
					onOpenAll={() => setTypeFilter("all")}
				/>

				<Separator className="my-4 opacity-60" />

				{/* Searchable & Filterable Bookmark List */}
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
}
