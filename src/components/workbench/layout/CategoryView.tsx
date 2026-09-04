import { Button, EmptyState } from "@heroui/react";
import { FolderPlus } from "lucide-react";
import { memo } from "react";
import { FolderCardSlot, FolderGridDropZone } from "../dnd/WorkbenchDnd";
import { FolderCard } from "../FolderCard";
import { FolderBreadcrumb } from "../folder/FolderBreadcrumb";
import { FolderIcon } from "../Icons";
import { FolderGridSkeleton } from "../skeletons/FolderGridSkeleton";
import type { Folder } from "../types";

export interface CategoryViewProps {
	folders: Folder[];
	selectedFolderId: number | null;
	isLoading?: boolean;
	categoryName?: string;
	folderPath?: Folder[];
	childFolderCounts?: Record<number, number>;
	onSelectFolder: (id: number) => void;
	onCreateFolder: (folder?: Folder) => void;
	onEnterFolder?: (id: number) => void;
	onNavigateBreadcrumb?: (id: number | null) => void;
	onEditFolder?: (folder: Folder) => void;
	onDeleteFolder?: (folder: Folder) => void;
	onCreateLink?: (folder: Folder) => void;
	onAskAIAboutFolder?: (folder: Folder) => void;
	allFolders?: Folder[];
	onMoveFolder?: (folderId: number, targetParentId: number | null) => void;
}

/**
 * Category View displaying folder cards in a responsive grid, skeleton loading, or empty state
 */
export const CategoryView = memo(function CategoryView({
	folders,
	selectedFolderId,
	isLoading = false,
	categoryName = "",
	folderPath = [],
	childFolderCounts = {},
	onSelectFolder,
	onCreateFolder,
	onEnterFolder,
	onNavigateBreadcrumb,
	onEditFolder,
	onDeleteFolder,
	onCreateLink,
	onAskAIAboutFolder,
	allFolders,
	onMoveFolder,
}: CategoryViewProps) {
	if (isLoading) {
		return (
			<div className="flex-1 flex flex-col">
				<FolderGridSkeleton count={8} />
			</div>
		);
	}

	const breadcrumb =
		folderPath.length > 0 && onNavigateBreadcrumb ? (
			<FolderBreadcrumb
				categoryName={categoryName}
				path={folderPath}
				onNavigate={onNavigateBreadcrumb}
			/>
		) : null;

	if (folders.length === 0) {
		// Inside a folder: show a dedicated empty-subfolder hint
		if (folderPath.length > 0) {
			return (
				<div className="flex-1 flex flex-col">
					{breadcrumb}
					<FolderGridDropZone>
						<EmptyState className="py-16 flex flex-col items-center justify-center text-center border border-dashed border-border rounded-3xl bg-surface p-8">
							<div className="w-14 h-14 rounded-2xl bg-surface-secondary flex items-center justify-center text-muted mb-3.5 opacity-50">
								<FolderIcon className="w-7 h-7" />
							</div>
							<p className="text-xs text-muted mb-2 font-medium text-foreground">
								该文件夹暂无子文件夹
							</p>
							<p className="text-xs text-muted max-w-sm">
								将其他文件夹卡片拖到目标文件夹上即可建立嵌套分组。
							</p>
						</EmptyState>
					</FolderGridDropZone>
				</div>
			);
		}

		return (
			<div className="flex-1 flex flex-col">
				<EmptyState className="py-20 flex flex-col items-center justify-center text-center border border-dashed border-border rounded-3xl bg-surface p-8">
					<div className="w-14 h-14 rounded-2xl bg-surface-secondary flex items-center justify-center text-muted mb-3.5 opacity-50">
						<FolderIcon className="w-7 h-7" />
					</div>
					<p className="text-xs text-muted mb-2 font-medium text-foreground">
						该分类下暂无已归类的文件夹
					</p>
					<p className="text-xs text-muted mb-4 max-w-sm">
						在 Chrome 扩展中点击「一键同步至工作台」，随后在「未分类」中点击「AI
						智能归类」即可自动生成并保存至 SQLite。
					</p>
					<Button
						variant="primary"
						size="sm"
						className="rounded-full flex items-center gap-1.5 cursor-pointer shadow-sm"
						onPress={() => onCreateFolder()}
					>
						<FolderPlus className="w-3.5 h-3.5" />
						<span>手动新建文件夹</span>
					</Button>
				</EmptyState>
			</div>
		);
	}

	return (
		<div className="flex-1 flex flex-col">
			{breadcrumb}
			<FolderGridDropZone>
				<div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3.5">
					{folders.map((folder) => (
						<FolderCardSlot key={folder.id} folder={folder}>
							<FolderCard
								folder={folder}
								isSelected={folder.id === selectedFolderId}
								childFolderCount={childFolderCounts[folder.id] ?? 0}
								onClick={() => onSelectFolder(folder.id)}
								onEnter={
									onEnterFolder ? () => onEnterFolder(folder.id) : undefined
								}
								onEdit={onEditFolder ? () => onEditFolder(folder) : undefined}
								onCreateFolder={onCreateFolder}
								onCreateLink={
									onCreateLink ? () => onCreateLink(folder) : undefined
								}
								onDelete={
									onDeleteFolder ? () => onDeleteFolder(folder) : undefined
								}
								onAskAI={
									onAskAIAboutFolder
										? () => onAskAIAboutFolder(folder)
										: undefined
								}
								allFolders={allFolders || folders}
								onMoveFolder={onMoveFolder}
							/>
						</FolderCardSlot>
					))}
				</div>
			</FolderGridDropZone>
		</div>
	);
});
