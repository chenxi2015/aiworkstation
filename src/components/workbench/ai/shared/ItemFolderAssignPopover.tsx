import { Button } from "@heroui/react";
import {
	Check,
	Folder as FolderIconLucide,
	FolderInput,
	Loader2,
	Plus,
	Search,
	X,
} from "lucide-react";
import { useMemo } from "react";
import type { Folder, SearchResultItem } from "../../types";

export interface ItemFolderAssignPopoverProps {
	assigningItems: SearchResultItem[] | null;
	folders: Folder[];
	categories: string[];
	isCreateMode: boolean;
	newFolderName: string;
	newFolderCategory: string;
	folderFilterQuery: string;
	isProcessingMove: boolean;
	onToggleCreateMode: () => void;
	onChangeNewFolderName: (name: string) => void;
	onChangeNewFolderCategory: (category: string) => void;
	onChangeFilterQuery: (query: string) => void;
	onClose: () => void;
	onMoveToExistingFolder: (folder: Folder) => void;
	onCreateFolderAndMove: () => void;
	variant?: "drawer" | "modal";
}

/**
 * Shared drawer/popover to assign bookmarks into existing or newly created folders
 */
export function ItemFolderAssignPopover({
	assigningItems,
	folders,
	categories,
	isCreateMode,
	newFolderName,
	newFolderCategory,
	folderFilterQuery,
	isProcessingMove,
	onToggleCreateMode,
	onChangeNewFolderName,
	onChangeNewFolderCategory,
	onChangeFilterQuery,
	onClose,
	onMoveToExistingFolder,
	onCreateFolderAndMove,
	variant = "drawer",
}: ItemFolderAssignPopoverProps) {
	const filteredFolders = useMemo(() => {
		if (!folderFilterQuery.trim()) return folders;
		const q = folderFilterQuery.toLowerCase();
		return folders.filter(
			(f) =>
				f.name.toLowerCase().includes(q) ||
				(f.category && f.category.toLowerCase().includes(q)),
		);
	}, [folders, folderFilterQuery]);

	if (!assigningItems || assigningItems.length === 0) return null;

	const isSingle = assigningItems.length === 1;
	const singleItem = assigningItems[0];

	const containerClass =
		variant === "drawer"
			? "absolute bottom-0 left-0 right-0 max-h-[72%] bg-surface/98 backdrop-blur-md border-t border-border shadow-xl z-30 p-3.5 flex flex-col rounded-t-2xl animate-in slide-in-from-bottom duration-200"
			: "w-full bg-surface border border-border/80 shadow-lg rounded-xl p-4 flex flex-col mt-2";

	return (
		<div className={containerClass}>
			{/* Drawer Header */}
			<div className="flex items-center justify-between pb-2.5 border-b border-border">
				<div className="flex items-center gap-2 min-w-0">
					<div className="w-6 h-6 rounded-lg bg-accent-soft text-accent flex items-center justify-center shrink-0">
						<FolderInput className="w-3.5 h-3.5" />
					</div>
					<div className="min-w-0">
						<h4 className="font-semibold text-xs text-foreground tracking-tight">
							{isCreateMode ? "新建文件夹并归入" : "归入文件夹"}
						</h4>
						<p className="text-[10px] text-muted truncate max-w-[200px]">
							{isSingle
								? `「${singleItem.name}」`
								: `已选中 ${assigningItems.length} 个网址`}
						</p>
					</div>
				</div>

				<div className="flex items-center gap-1.5">
					<Button
						variant="secondary"
						size="sm"
						className="rounded-lg text-[11px] h-6 px-2 cursor-pointer"
						onPress={onToggleCreateMode}
					>
						{isCreateMode ? "已有文件夹" : "+ 新建"}
					</Button>
					<button
						type="button"
						onClick={onClose}
						className="w-6 h-6 rounded-lg flex items-center justify-center text-muted hover:text-foreground cursor-pointer"
						aria-label="关闭"
					>
						<X className="w-3.5 h-3.5" />
					</button>
				</div>
			</div>

			{/* Body Content */}
			<div className="flex-1 overflow-y-auto py-2.5">
				{isCreateMode ? (
					/* Create New Folder Form */
					<div className="flex flex-col gap-2.5 py-1">
						<div className="flex flex-col gap-1">
							<label
								htmlFor="shared-new-folder-name"
								className="text-[11px] font-medium text-foreground"
							>
								文件夹名称 <span className="text-danger">*</span>
							</label>
							<input
								id="shared-new-folder-name"
								type="text"
								value={newFolderName}
								onChange={(e) => onChangeNewFolderName(e.target.value)}
								onKeyDown={(e) => {
									if (e.key === "Enter") onCreateFolderAndMove();
								}}
								placeholder="例如：视频剪辑工具集"
								className="w-full bg-surface-secondary/70 border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted focus:outline-none focus:border-accent"
								autoFocus
							/>
						</div>

						<div className="flex flex-col gap-1">
							<label
								htmlFor="shared-new-folder-category"
								className="text-[11px] font-medium text-foreground"
							>
								所属分类
							</label>
							<select
								id="shared-new-folder-category"
								value={newFolderCategory}
								onChange={(e) => onChangeNewFolderCategory(e.target.value)}
								className="w-full bg-surface-secondary/70 border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:border-accent cursor-pointer"
							>
								{categories.map((cat) => (
									<option key={cat} value={cat}>
										{cat}
									</option>
								))}
							</select>
						</div>

						<div className="flex items-center justify-end gap-2 mt-2 pt-2 border-t border-border">
							<Button
								variant="ghost"
								size="sm"
								className="rounded-lg text-xs h-7 cursor-pointer"
								onPress={onToggleCreateMode}
							>
								返回
							</Button>
							<Button
								variant="primary"
								size="sm"
								className="rounded-lg text-xs h-7 flex items-center gap-1 cursor-pointer font-medium px-3"
								onPress={onCreateFolderAndMove}
								isDisabled={isProcessingMove || !newFolderName.trim()}
							>
								{isProcessingMove ? (
									<>
										<Loader2 className="w-3 h-3 animate-spin" />
										<span>归类中...</span>
									</>
								) : (
									<>
										<Check className="w-3 h-3" />
										<span>确认归入</span>
									</>
								)}
							</Button>
						</div>
					</div>
				) : (
					/* Select Existing Folder */
					<div className="flex flex-col gap-2">
						{/* Filter input */}
						<div className="relative flex items-center">
							<Search className="w-3 h-3 absolute left-2.5 text-muted pointer-events-none" />
							<input
								type="text"
								value={folderFilterQuery}
								onChange={(e) => onChangeFilterQuery(e.target.value)}
								placeholder="筛选文件夹..."
								className="w-full bg-surface-secondary/70 border border-border rounded-lg pl-8 pr-2.5 py-1 text-xs text-foreground placeholder:text-muted focus:outline-none focus:border-accent"
							/>
						</div>

						{/* Folder cards list */}
						{filteredFolders.length === 0 ? (
							<div className="text-center py-6 text-xs text-muted flex flex-col items-center gap-1.5">
								<span>暂无匹配文件夹</span>
								<Button
									variant="secondary"
									size="sm"
									className="rounded-md text-[11px] h-6 px-2 cursor-pointer flex items-center gap-1"
									onPress={onToggleCreateMode}
								>
									<Plus className="w-3 h-3" />
									<span>新建此文件夹</span>
								</Button>
							</div>
						) : (
							<div className="flex flex-col gap-1.5 max-h-[42vh] overflow-y-auto pr-0.5">
								{filteredFolders.map((f) => {
									const isCurrentSingleFolder =
										isSingle && singleItem.folderId === f.id;

									return (
										<button
											key={f.id}
											type="button"
											onClick={() => onMoveToExistingFolder(f)}
											disabled={isProcessingMove || isCurrentSingleFolder}
											className={`p-2 rounded-lg border text-left flex items-start gap-2 transition-all cursor-pointer ${
												isCurrentSingleFolder
													? "bg-surface-secondary/40 border-border opacity-60 cursor-not-allowed"
													: "bg-surface border-border/80 hover:border-accent hover:bg-accent-soft/20"
											}`}
										>
											<div className="w-6 h-6 rounded bg-surface-secondary border border-border/60 flex items-center justify-center shrink-0 text-foreground/80 mt-0.5">
												<FolderIconLucide className="w-3 h-3" />
											</div>
											<div className="flex-1 min-w-0 flex flex-col">
												<div className="flex items-center justify-between gap-1">
													<span className="font-medium text-[11px] text-foreground truncate">
														{f.name}
													</span>
													<span className="text-[9px] text-muted px-1 rounded bg-surface-secondary border border-border/40 shrink-0">
														{f.category}
													</span>
												</div>
												<span className="text-[9px] text-muted">
													{f.items?.length || 0} 项
													{isCurrentSingleFolder ? " (当前所在)" : ""}
												</span>
											</div>
										</button>
									);
								})}
							</div>
						)}
					</div>
				)}
			</div>
		</div>
	);
}
