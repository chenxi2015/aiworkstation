import { Button } from "@heroui/react";
import { LayoutGrid, List, Pencil, RefreshCw } from "lucide-react";
import type { Folder, FolderGridView } from "../types";
import { CategoryView } from "./CategoryView";

export interface CategoryMainViewProps {
	displayTitle: string;
	currentFolder: Folder | null;
	gridFolders: Folder[];
	allFolders: Folder[];
	selectedFolderId: number | null;
	activeCategory: string;
	folderPath: Folder[];
	childFolderCounts: Record<number, number>;
	folderGridView: FolderGridView;
	canEditTitle: boolean;
	isRefreshing: boolean;
	onEditTitle: () => void;
	onFolderGridViewChange: (mode: FolderGridView) => void;
	onRefresh: () => void;
	onSelectFolder: (id: number) => void;
	onCreateFolder: (parentFolder?: Folder) => void;
	onEnterFolder: (id: number) => void;
	onNavigateBreadcrumb: (id: number | null) => void;
	onEditFolder: (folder: Folder) => void;
	onDeleteFolder: (folder: Folder) => void;
	onMoveFolder: (folderId: number, targetParentId: number | null) => void;
	onCreateLink: (folder: Folder) => void;
	onAskAIAboutFolder: (folder: Folder) => void;
}

/**
 * Main workspace column displaying category/folder header and folders grid/list view.
 */
export function CategoryMainView({
	displayTitle,
	currentFolder,
	gridFolders,
	allFolders,
	selectedFolderId,
	activeCategory,
	folderPath,
	childFolderCounts,
	folderGridView,
	canEditTitle,
	isRefreshing,
	onEditTitle,
	onFolderGridViewChange,
	onRefresh,
	onSelectFolder,
	onCreateFolder,
	onEnterFolder,
	onNavigateBreadcrumb,
	onEditFolder,
	onDeleteFolder,
	onMoveFolder,
	onCreateLink,
	onAskAIAboutFolder,
}: CategoryMainViewProps) {
	return (
		<main className="flex-1 min-w-0 flex flex-col h-full overflow-hidden">
			{/* Workspace Title */}
			<div className="shrink-0 px-6 lg:px-7 pt-6 lg:pt-7 pb-5 border-b border-border/60 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
				<div>
					<div className="flex items-center gap-2">
						<h1 className="text-2xl font-bold tracking-tight text-foreground">
							{displayTitle}
						</h1>
						<span className="text-xs font-medium text-muted">
							{gridFolders.length} 个{currentFolder ? "子文件夹" : "文件夹"}
						</span>
						{canEditTitle && (
							<Button
								variant="ghost"
								size="sm"
								className="rounded-full h-7 w-7 p-0 min-w-0 cursor-pointer text-muted hover:text-foreground hover:bg-surface-secondary/80 transition-colors"
								onPress={onEditTitle}
								aria-label={currentFolder ? "编辑当前文件夹" : "编辑分类名称"}
							>
								<Pencil className="w-3.5 h-3.5" />
							</Button>
						)}
					</div>
					<p className="text-xs text-muted mt-1 leading-relaxed max-w-2xl">
						{currentFolder
							? currentFolder.desc?.trim() ||
								`当前位于「${currentFolder.name}」文件夹，可在此浏览子文件夹与归集书签。`
							: "点击文件夹卡片可在左侧查看书签与快捷看板，支持自由拖拽排序与移动归类；右侧随时进行 AI 搜索与知识问答。"}
					</p>
				</div>

				{/* Action buttons: view toggle + refresh folder list */}
				<div className="flex items-center gap-2 shrink-0">
					<div className="flex items-center rounded-full border border-border/70 bg-surface-secondary/60 p-0.5">
						<button
							type="button"
							onClick={() => onFolderGridViewChange("grid")}
							className={`w-7 h-6 rounded-full flex items-center justify-center cursor-pointer transition-colors ${
								folderGridView === "grid"
									? "bg-surface text-foreground shadow-2xs"
									: "text-muted/70 hover:text-foreground"
							}`}
							title="网格视图"
							aria-label="网格视图"
							aria-pressed={folderGridView === "grid"}
						>
							<LayoutGrid className="w-3.5 h-3.5" />
						</button>
						<button
							type="button"
							onClick={() => onFolderGridViewChange("list")}
							className={`w-7 h-6 rounded-full flex items-center justify-center cursor-pointer transition-colors ${
								folderGridView === "list"
									? "bg-surface text-foreground shadow-2xs"
									: "text-muted/70 hover:text-foreground"
							}`}
							title="列表视图"
							aria-label="列表视图"
							aria-pressed={folderGridView === "list"}
						>
							<List className="w-3.5 h-3.5" />
						</button>
					</div>
					<Button
						variant="secondary"
						size="sm"
						className="rounded-full flex items-center gap-1.5 cursor-pointer text-xs"
						isDisabled={isRefreshing}
						onPress={onRefresh}
					>
						<RefreshCw
							className={`w-3.5 h-3.5 ${
								isRefreshing ? "animate-spin text-accent" : "text-muted"
							}`}
						/>
						<span>刷新列表</span>
					</Button>
				</div>
			</div>

			{/* Folders Grid View（独立滚动，标题栏固定） */}
			<div className="flex-1 min-h-0 overflow-y-auto px-6 lg:px-7 pt-5 pb-6 flex flex-col">
				<CategoryView
					folders={gridFolders}
					allFolders={allFolders}
					selectedFolderId={selectedFolderId}
					viewMode={folderGridView}
					categoryName={activeCategory}
					folderPath={folderPath}
					childFolderCounts={childFolderCounts}
					onSelectFolder={onSelectFolder}
					onCreateFolder={onCreateFolder}
					onEnterFolder={onEnterFolder}
					onNavigateBreadcrumb={onNavigateBreadcrumb}
					onEditFolder={onEditFolder}
					onDeleteFolder={onDeleteFolder}
					onMoveFolder={onMoveFolder}
					onCreateLink={onCreateLink}
					onAskAIAboutFolder={onAskAIAboutFolder}
				/>
			</div>
		</main>
	);
}
