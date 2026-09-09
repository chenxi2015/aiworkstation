import { Dropdown } from "@heroui/react";
import {
	Ellipsis,
	FolderPlus,
	Link2,
	Pencil,
	Plus,
	Sparkles,
	Trash2,
} from "lucide-react";
import { memo } from "react";
import { FolderAssignMenu } from "./folder/FolderAssignMenu";
import type { Folder as FolderType } from "./types";

interface FolderActionsMenuProps {
	folder: FolderType;
	onEdit?: () => void;
	onCreateFolder?: (folder: FolderType) => void;
	onCreateLink?: () => void;
	onDelete?: () => void;
	onAskAI?: () => void;
	allFolders?: FolderType[];
	onMoveFolder?: (folderId: number, targetParentId: number | null) => void;
	/** Optional override for the ellipsis trigger styling */
	triggerClassName?: string;
	/** Optional extra classes for the outer wrapper (e.g. ml-auto to pin to the end of a flex row) */
	wrapperClassName?: string;
}

/**
 * Shared folder action dropdown (AI summary / edit / create / move / delete),
 * used by both the grid FolderCard and the list FolderListRow.
 * Renders nothing when no action handlers are provided.
 */
export const FolderActionsMenu = memo(function FolderActionsMenu({
	folder,
	onEdit,
	onCreateFolder,
	onCreateLink,
	onDelete,
	onAskAI,
	allFolders,
	onMoveFolder,
	triggerClassName,
	wrapperClassName,
}: FolderActionsMenuProps) {
	const hasActions =
		onEdit ||
		onCreateFolder ||
		onCreateLink ||
		onDelete ||
		onAskAI ||
		onMoveFolder;
	if (!hasActions) return null;

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: wrapper only stops card-level click/keyboard selection
		<span
			className={wrapperClassName ? `shrink-0 ${wrapperClassName}` : "shrink-0"}
			onClick={(e) => e.stopPropagation()}
			onKeyDown={(e) => e.stopPropagation()}
			onDoubleClick={(e) => e.stopPropagation()}
		>
			<Dropdown>
				<Dropdown.Trigger
					aria-label={`文件夹「${folder.name}」操作`}
					className={
						triggerClassName ??
						"w-6 h-6 rounded-md flex items-center justify-center text-muted/70 hover:text-foreground hover:bg-foreground/[0.06] dark:hover:bg-white/[0.08] data-[pressed]:bg-foreground/[0.08] cursor-pointer transition-colors"
					}
				>
					<Ellipsis className="w-3.5 h-3.5" />
				</Dropdown.Trigger>
				<Dropdown.Popover
					placement="bottom end"
					className="min-w-[168px] p-1 shadow-lg border border-border/80 rounded-xl bg-surface"
				>
					<Dropdown.Menu aria-label={`文件夹「${folder.name}」操作`}>
						{onAskAI && (
							<Dropdown.Item
								id="ai-summary"
								textValue="AI 总结与盘点"
								isDisabled={folder.items.length === 0}
								onAction={onAskAI}
							>
								<div className="flex items-center gap-2 w-full py-0.5">
									<Sparkles className="w-3.5 h-3.5 text-accent shrink-0" />
									<span className="text-xs font-medium flex-1">
										AI 总结与盘点
									</span>
								</div>
							</Dropdown.Item>
						)}
						{onEdit && (
							<Dropdown.Item id="edit" textValue="编辑" onAction={onEdit}>
								<div className="flex items-center gap-2 w-full py-0.5">
									<Pencil className="w-3.5 h-3.5 text-muted shrink-0" />
									<span className="text-xs font-medium flex-1">编辑</span>
								</div>
							</Dropdown.Item>
						)}
						{(onCreateFolder || onCreateLink) && (
							<Dropdown.SubmenuTrigger>
								<Dropdown.Item id="new" textValue="新建">
									<div className="flex items-center gap-2 w-full py-0.5">
										<Plus className="w-3.5 h-3.5 text-muted shrink-0" />
										<span className="text-xs font-medium flex-1">新建</span>
										<Dropdown.SubmenuIndicator />
									</div>
								</Dropdown.Item>
								<Dropdown.Popover className="min-w-[140px] p-1 shadow-lg border border-border/80 rounded-xl bg-surface">
									<Dropdown.Menu aria-label="新建">
										{onCreateFolder && (
											<Dropdown.Item
												id="new-folder"
												textValue="新建文件夹"
												onAction={() => onCreateFolder(folder)}
											>
												<div className="flex items-center gap-2 w-full py-0.5">
													<FolderPlus className="w-3.5 h-3.5 text-muted shrink-0" />
													<span className="text-xs font-medium flex-1">
														文件夹
													</span>
												</div>
											</Dropdown.Item>
										)}
										{onCreateLink && (
											<Dropdown.Item
												id="new-link"
												textValue="新建链接"
												onAction={onCreateLink}
											>
												<div className="flex items-center gap-2 w-full py-0.5">
													<Link2 className="w-3.5 h-3.5 text-muted shrink-0" />
													<span className="text-xs font-medium flex-1">
														链接
													</span>
												</div>
											</Dropdown.Item>
										)}
									</Dropdown.Menu>
								</Dropdown.Popover>
							</Dropdown.SubmenuTrigger>
						)}
						{onMoveFolder && allFolders && allFolders.length > 1 && (
							<FolderAssignMenu
								mode="submenu"
								label="放入文件夹"
								folders={allFolders}
								currentFolderId={folder.parentId}
								excludeFolderId={folder.id}
								onSelectFolder={(targetParentId) =>
									onMoveFolder(folder.id, targetParentId)
								}
							/>
						)}
						{onDelete && (
							<Dropdown.Item
								id="delete"
								textValue="删除"
								variant="danger"
								onAction={onDelete}
							>
								<div className="flex items-center gap-2 w-full py-0.5">
									<Trash2 className="w-3.5 h-3.5 shrink-0" />
									<span className="text-xs font-medium flex-1">删除</span>
								</div>
							</Dropdown.Item>
						)}
					</Dropdown.Menu>
				</Dropdown.Popover>
			</Dropdown>
		</span>
	);
});
