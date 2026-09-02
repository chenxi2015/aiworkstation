import { Button, EmptyState, ScrollShadow, Separator } from "@heroui/react";
import { Folder as FolderIconLucide, FolderPlus } from "lucide-react";
import { useState } from "react";
import { FolderGridPreview } from "./folder/FolderGridPreview";
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

/**
 * Compact Left sidebar detail panel presenting selected folder's navigation, contents, and actions
 */
export function FolderDetailPanel({
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
			<aside className="w-[280px] xl:w-[310px] 2xl:w-[330px] shrink-0 bg-surface/90 backdrop-blur-md border-r border-border p-5 flex flex-col items-center justify-center text-center h-[calc(100vh-60px)] sticky top-[60px]">
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
							: "点击上方分类或列表切换文件夹，查看归集的书签"}
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

	return (
		<aside className="w-[280px] xl:w-[310px] 2xl:w-[330px] shrink-0 bg-surface/95 backdrop-blur-md border-r border-border flex flex-col h-[calc(100vh-60px)] sticky top-[60px] shadow-xs">
			<ScrollShadow className="flex-1 px-3.5 py-3.5 overflow-y-auto">
				{/* Category Folders Switcher Strip */}
				{categoryFolders.length > 1 && onSelectFolder && (
					<div className="mb-3 pb-2.5 border-b border-border/60">
						<div className="flex items-center justify-between gap-1 mb-1.5">
							<span className="text-[9px] font-semibold text-muted tracking-wider uppercase">
								分类文件夹 ({categoryFolders.length})
							</span>
							{onCreateFolder && (
								<button
									type="button"
									onClick={onCreateFolder}
									className="text-[9px] text-accent hover:underline flex items-center gap-0.5 cursor-pointer"
								>
									<FolderPlus className="w-2.5 h-2.5" />
									<span>新建</span>
								</button>
							)}
						</div>
						<div className="flex items-center gap-1 overflow-x-auto pb-0.5 scrollbar-none">
							{categoryFolders.map((f) => {
								const isSelected = f.id === folder.id;
								return (
									<button
										key={f.id}
										type="button"
										onClick={() => onSelectFolder(f.id)}
										className={`px-2 py-1 rounded-lg text-[11px] font-medium transition-all shrink-0 flex items-center gap-1 cursor-pointer border ${
											isSelected
												? "bg-accent text-accent-foreground border-accent shadow-2xs font-semibold"
												: "bg-surface-secondary/70 text-muted hover:text-foreground border-border hover:border-accent/40"
										}`}
										title={f.name}
									>
										<FolderIconLucide className="w-2.5 h-2.5 opacity-80" />
										<span className="truncate max-w-[85px]">{f.name}</span>
										<span className="text-[9px] opacity-75 font-mono">
											({f.items.length})
										</span>
									</button>
								);
							})}
						</div>
					</div>
				)}

				{/* Top Header Card */}
				<FolderHeader
					folder={folder}
					onEdit={onEdit}
					onAskAI={onAskAIAboutFolder}
				/>

				{/* 4-Column Micro-Preview Section */}
				<FolderGridPreview
					folder={folder}
					onOpenAll={() => setTypeFilter("all")}
				/>

				<Separator className="my-3 opacity-60" />

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
