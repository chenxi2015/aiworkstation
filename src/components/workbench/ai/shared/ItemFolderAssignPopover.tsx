import { Button, Drawer } from "@heroui/react";
import {
	Check,
	Folder as FolderIconLucide,
	FolderInput,
	Loader2,
	Plus,
	Search,
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
 * Shared HeroUI Drawer to assign bookmarks into existing or newly created folders (slides up from bottom)
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
}: ItemFolderAssignPopoverProps) {
	const isOpen = Boolean(assigningItems && assigningItems.length > 0);

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

	return (
		<Drawer.Backdrop
			isOpen={isOpen}
			onOpenChange={(open) => {
				if (!open) onClose();
			}}
			variant="blur"
			isDismissable
			className="z-60"
		>
			<Drawer.Content
				placement="bottom"
				className="w-full sm:max-w-xl mx-auto"
			>
				<Drawer.Dialog
					aria-label={isCreateMode ? "新建文件夹并归入" : "归入文件夹"}
					className="bg-surface border-t border-border shadow-2xl rounded-t-2xl max-h-[82vh] flex flex-col p-4 sm:p-5"
				>
					{/* Top Drag Indicator Handle */}
					<Drawer.Handle className="mb-2" />

					{/* Close Trigger (HeroUI built-in close button) */}
					<Drawer.CloseTrigger />

					{/* Drawer Header */}
					<Drawer.Header className="flex flex-row items-center justify-between pb-3 border-b border-border/80 pr-9">
						<div className="flex items-center gap-2.5 min-w-0">
							<div className="w-8 h-8 rounded-xl bg-accent-soft text-accent flex items-center justify-center shrink-0 shadow-xs">
								<FolderInput className="w-4 h-4" />
							</div>
							<div className="min-w-0">
								<Drawer.Heading className="font-semibold text-sm text-foreground tracking-tight">
									{isCreateMode ? "新建文件夹并归入" : "归入文件夹"}
								</Drawer.Heading>
								<p className="text-xs text-muted truncate max-w-[240px] sm:max-w-[320px]">
									{isSingle
										? `「${singleItem.name}」`
										: `已选中 ${assigningItems.length} 个网址`}
								</p>
							</div>
						</div>

						<Button
							variant="secondary"
							size="sm"
							className="rounded-lg text-xs h-7 px-2.5 cursor-pointer shrink-0"
							onPress={onToggleCreateMode}
						>
							{isCreateMode ? "已有文件夹" : "+ 新建"}
						</Button>
					</Drawer.Header>

					{/* Body Content */}
					<Drawer.Body className="flex-1 overflow-y-auto py-3 min-h-0">
						{isCreateMode ? (
							/* Create New Folder Form */
							<div className="flex flex-col gap-3 py-1">
								<div className="flex flex-col gap-1.5">
									<label
										htmlFor="shared-new-folder-name"
										className="text-xs font-medium text-foreground"
									>
										文件夹名称 <span className="text-danger">*</span>
									</label>
									<input
										id="shared-new-folder-name"
										type="text"
										value={newFolderName}
										onChange={(e) => onChangeNewFolderName(e.target.value)}
										onKeyDown={(e) => {
											if (
												e.key === "Enter" &&
												newFolderName.trim() &&
												!isProcessingMove
											) {
												onCreateFolderAndMove();
											}
										}}
										placeholder="例如：视频剪辑工具集"
										className="w-full bg-surface-secondary/70 border border-border rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-accent transition-colors"
										autoFocus
									/>
								</div>

								<div className="flex flex-col gap-1.5">
									<label
										htmlFor="shared-new-folder-category"
										className="text-xs font-medium text-foreground"
									>
										所属分类
									</label>
									<select
										id="shared-new-folder-category"
										value={newFolderCategory}
										onChange={(e) =>
											onChangeNewFolderCategory(e.target.value)
										}
										className="w-full bg-surface-secondary/70 border border-border rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:border-accent cursor-pointer transition-colors"
									>
										{categories.map((cat) => (
											<option key={cat} value={cat}>
												{cat}
											</option>
										))}
									</select>
								</div>
							</div>
						) : (
							/* Select Existing Folder */
							<div className="flex flex-col gap-2.5">
								{/* Filter input */}
								<div className="relative flex items-center">
									<Search className="w-3.5 h-3.5 absolute left-3 text-muted pointer-events-none" />
									<input
										type="text"
										value={folderFilterQuery}
										onChange={(e) => onChangeFilterQuery(e.target.value)}
										placeholder="筛选文件夹..."
										className="w-full bg-surface-secondary/70 border border-border rounded-xl pl-9 pr-3 py-1.5 text-xs sm:text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-accent transition-colors"
									/>
								</div>

								{/* Folder cards list */}
								{filteredFolders.length === 0 ? (
									<div className="text-center py-8 text-xs text-muted flex flex-col items-center gap-2">
										<span>暂无匹配文件夹</span>
										<Button
											variant="secondary"
											size="sm"
											className="rounded-lg text-xs h-7 px-2.5 cursor-pointer flex items-center gap-1"
											onPress={onToggleCreateMode}
										>
											<Plus className="w-3.5 h-3.5" />
											<span>新建此文件夹</span>
										</Button>
									</div>
								) : (
									<div className="flex flex-col gap-1.5 max-h-[46vh] overflow-y-auto pr-0.5 scrollbar">
										{filteredFolders.map((f) => {
											const isCurrentSingleFolder =
												isSingle && singleItem.folderId === f.id;

											return (
												<button
													key={f.id}
													type="button"
													onClick={() => onMoveToExistingFolder(f)}
													disabled={
														isProcessingMove || isCurrentSingleFolder
													}
													className={`p-2.5 rounded-xl border text-left flex items-start gap-2.5 transition-all cursor-pointer ${
														isCurrentSingleFolder
															? "bg-surface-secondary/40 border-border opacity-60 cursor-not-allowed"
															: "bg-surface border-border/80 hover:border-accent hover:bg-accent-soft/20 active:scale-[0.99]"
													}`}
												>
													<div
														className="w-7 h-7 rounded-lg border flex items-center justify-center shrink-0 mt-0.5 transition-colors"
														style={{
															backgroundColor: f.color
																? `${f.color}18`
																: "var(--surface-secondary)",
															borderColor: f.color
																? `${f.color}40`
																: "var(--border)",
															color: f.color || "inherit",
														}}
													>
														<FolderIconLucide className="w-3.5 h-3.5" />
													</div>
													<div className="flex-1 min-w-0 flex flex-col">
														<div className="flex items-center justify-between gap-1.5">
															<span className="font-medium text-xs sm:text-sm text-foreground truncate">
																{f.name}
															</span>
															<span className="text-[10px] text-muted px-1.5 py-0.5 rounded-md bg-surface-secondary border border-border/40 shrink-0">
																{f.category}
															</span>
														</div>
														<span className="text-[10px] text-muted mt-0.5">
															{f.items?.length || 0} 项
															{isCurrentSingleFolder
																? " (当前所在)"
																: ""}
														</span>
													</div>
												</button>
											);
										})}
									</div>
								)}
							</div>
						)}
					</Drawer.Body>

					{/* Footer (Action buttons in Create Mode) */}
					{isCreateMode && (
						<Drawer.Footer className="border-t border-border pt-3 mt-1 flex items-center justify-end gap-2">
							<Button
								variant="ghost"
								size="sm"
								className="rounded-lg text-xs h-8 px-3 cursor-pointer"
								onPress={onToggleCreateMode}
							>
								返回
							</Button>
							<Button
								variant="primary"
								size="sm"
								className="rounded-lg text-xs h-8 flex items-center gap-1.5 cursor-pointer font-medium px-4"
								onPress={onCreateFolderAndMove}
								isDisabled={isProcessingMove || !newFolderName.trim()}
							>
								{isProcessingMove ? (
									<>
										<Loader2 className="w-3.5 h-3.5 animate-spin" />
										<span>归类中...</span>
									</>
								) : (
									<>
										<Check className="w-3.5 h-3.5" />
										<span>确认归入</span>
									</>
								)}
							</Button>
						</Drawer.Footer>
					)}
				</Drawer.Dialog>
			</Drawer.Content>
		</Drawer.Backdrop>
	);
}

