import {
	Folder,
	Inbox,
	Layers,
	Pencil,
	Plus,
	Star,
	Trash2,
} from "lucide-react";
import type React from "react";
import type { MaterialFolder } from "../types";
import type { FolderSelection } from "./types";

interface FolderSidebarProps {
	folders: MaterialFolder[];
	selection: FolderSelection;
	totalCount: number;
	unfiledCount: number;
	starredCount: number;
	onSelect: (selection: FolderSelection) => void;
	onCreateFolder: () => void;
	onRenameFolder: (folder: MaterialFolder) => void;
	onDeleteFolder: (folder: MaterialFolder) => void;
}

/**
 * Left folder navigation sidebar for materials library
 */
export function FolderSidebar({
	folders,
	selection,
	totalCount,
	unfiledCount,
	starredCount,
	onSelect,
	onCreateFolder,
	onRenameFolder,
	onDeleteFolder,
}: FolderSidebarProps) {
	return (
		<aside className="w-52 shrink-0 border-r border-border bg-surface/40 flex flex-col">
			<div className="px-3 py-2.5 border-b border-border flex items-center justify-between">
				<span className="text-xs font-semibold text-foreground">
					素材文件夹
				</span>
				<button
					type="button"
					title="新建文件夹"
					onClick={onCreateFolder}
					className="p-1 rounded-md text-muted hover:text-accent hover:bg-accent/10 transition-colors cursor-pointer"
				>
					<Plus className="w-3.5 h-3.5" />
				</button>
			</div>
			<div className="flex-1 overflow-y-auto px-2 py-2 flex flex-col gap-0.5">
				<FolderRow
					icon={<Layers className="w-3.5 h-3.5" />}
					label="全部素材"
					count={totalCount}
					active={selection === "all"}
					onClick={() => onSelect("all")}
				/>
				<FolderRow
					icon={<Inbox className="w-3.5 h-3.5" />}
					label="未归档"
					count={unfiledCount}
					active={selection === "unfiled"}
					onClick={() => onSelect("unfiled")}
				/>
				<FolderRow
					icon={<Star className="w-3.5 h-3.5" />}
					label="已收藏"
					count={starredCount}
					active={selection === "starred"}
					onClick={() => onSelect("starred")}
				/>
				{folders.length > 0 && (
					<div className="my-1.5 border-t border-border/60" />
				)}
				{folders.map((folder) => (
					<FolderRow
						key={folder.id}
						icon={<Folder className="w-3.5 h-3.5" />}
						label={folder.name}
						count={folder.materialCount ?? 0}
						active={selection === folder.id}
						onClick={() => onSelect(folder.id)}
						onRename={() => onRenameFolder(folder)}
						onDelete={() => onDeleteFolder(folder)}
					/>
				))}
				{folders.length === 0 && (
					<p className="px-2 pt-3 text-[10px] text-muted leading-relaxed">
						还没有文件夹，点右上角 + 或顶部「新建文件夹」创建一个
					</p>
				)}
			</div>
		</aside>
	);
}

/** Individual folder item row */
function FolderRow({
	icon,
	label,
	count,
	active,
	onClick,
	onRename,
	onDelete,
}: {
	icon: React.ReactNode;
	label: string;
	count: number;
	active: boolean;
	onClick: () => void;
	onRename?: () => void;
	onDelete?: () => void;
}) {
	return (
		<div
			className={`group flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs transition-colors ${
				active
					? "bg-accent/10 text-accent font-medium"
					: "text-foreground/80 hover:bg-muted/10"
			}`}
		>
			<button
				type="button"
				onClick={onClick}
				className="flex-1 min-w-0 flex items-center gap-2 cursor-pointer text-left"
			>
				<span className="shrink-0">{icon}</span>
				<span className="flex-1 min-w-0 truncate">{label}</span>
			</button>
			{(onRename || onDelete) && (
				<span className="hidden group-hover:flex items-center gap-0.5 shrink-0">
					{onRename && (
						<button
							type="button"
							title="重命名"
							onClick={(e) => {
								e.stopPropagation();
								onRename();
							}}
							className="p-0.5 rounded text-muted hover:text-foreground cursor-pointer"
						>
							<Pencil className="w-3 h-3" />
						</button>
					)}
					{onDelete && (
						<button
							type="button"
							title="删除文件夹"
							onClick={(e) => {
								e.stopPropagation();
								onDelete();
							}}
							className="p-0.5 rounded text-muted hover:text-danger cursor-pointer"
						>
							<Trash2 className="w-3 h-3" />
						</button>
					)}
				</span>
			)}
			<span className="shrink-0 text-[10px] text-muted tabular-nums group-hover:hidden">
				{count}
			</span>
		</div>
	);
}
