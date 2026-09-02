import { Button, EmptyState } from "@heroui/react";
import { FolderPlus } from "lucide-react";
import { memo } from "react";
import { FolderCard } from "../FolderCard";
import { FolderIcon } from "../Icons";
import { FolderGridSkeleton } from "../skeletons/FolderGridSkeleton";
import type { Folder } from "../types";

export interface CategoryViewProps {
	folders: Folder[];
	selectedFolderId: number | null;
	isLoading?: boolean;
	onSelectFolder: (id: number) => void;
	onCreateFolder: () => void;
}

/**
 * Category View displaying folder cards in a responsive grid, skeleton loading, or empty state
 */
export const CategoryView = memo(function CategoryView({
	folders,
	selectedFolderId,
	isLoading = false,
	onSelectFolder,
	onCreateFolder,
}: CategoryViewProps) {
	if (isLoading) {
		return (
			<div className="flex-1 flex flex-col">
				<FolderGridSkeleton count={8} />
			</div>
		);
	}

	if (folders.length === 0) {
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
						onPress={onCreateFolder}
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
			<div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3.5">
				{folders.map((folder) => (
					<FolderCard
						key={folder.id}
						folder={folder}
						isSelected={folder.id === selectedFolderId}
						onClick={() => onSelectFolder(folder.id)}
					/>
				))}
			</div>
		</div>
	);
});


