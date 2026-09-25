import { Loader2 } from "lucide-react";
import { useEffect, useRef } from "react";
import { ConfirmDialog } from "../workbench/ConfirmDialog";
import { ImportMaterialModal } from "./ImportMaterialModal";
import { FolderFormModal } from "./materials/FolderFormModal";
import { FolderSidebar } from "./materials/FolderSidebar";
import { MaterialsGridView } from "./materials/MaterialsGridView";
import { MaterialsTableView } from "./materials/MaterialsTableView";
import { MaterialsToolbar } from "./materials/MaterialsToolbar";
import { MoveToFolderModal } from "./materials/MoveToFolderModal";
import { useMaterialsState } from "./materials/useMaterialsState";
import type { Material } from "./types";

interface MaterialsTabProps {
	materials: Material[];
	loading: boolean;
	onChanged: () => Promise<void>;
	/** 素材一键导入创作台后跳转打开新文档 */
	onImportToStudio: (docId: number) => void;
}

/**
 * Materials library tab: Left folder sidebar + Right materials table/grid view (with type tab filtering).
 * Import modal is delegated to ImportMaterialModal, assets are saved under filesRootDir.
 */
export function MaterialsTab({
	materials,
	loading,
	onChanged,
	onImportToStudio,
}: MaterialsTabProps) {
	const state = useMaterialsState({
		materials,
		onChanged,
		onImportToStudioSuccess: onImportToStudio,
	});

	const sentinelRef = useRef<HTMLDivElement | null>(null);

	// Automatically load more when scrolling near bottom
	useEffect(() => {
		const el = sentinelRef.current;
		if (!el || !state.hasMore) return;
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries[0]?.isIntersecting) {
					state.loadMore();
				}
			},
			{ rootMargin: "250px" },
		);
		observer.observe(el);
		return () => observer.disconnect();
	}, [state.hasMore, state.loadMore]);

	const currentFolderTitle =
		state.selection === "all"
			? "全部素材"
			: state.selection === "unfiled"
				? "未归档"
				: (state.currentFolder?.name ?? "全部素材");

	return (
		<div className="flex-1 flex min-h-0">
			{/* 左侧：文件夹列表 */}
			<FolderSidebar
				folders={state.folders}
				selection={state.selection}
				totalCount={materials.length}
				unfiledCount={state.unfiledCount}
				starredCount={state.starredCount}
				onSelect={state.setSelection}
				onCreateFolder={() => state.setFolderModal({ folder: null })}
				onRenameFolder={(folder) => state.setFolderModal({ folder })}
				onDeleteFolder={(folder) => state.setDeletingFolder(folder)}
			/>

			{/* 右侧：素材内容 */}
			<section className="flex-1 min-w-0 flex flex-col">
				<MaterialsToolbar
					title={currentFolderTitle}
					totalInFolder={state.folderFiltered.length}
					search={state.search}
					onSearchChange={state.setSearch}
					refreshing={state.refreshing}
					onRefresh={() => void state.handleRefresh()}
					selectMode={state.selectMode}
					onEnterSelectMode={() => state.setSelectMode(true)}
					onExitSelectMode={state.exitSelectMode}
					selectedCount={state.selectedIds.size}
					allVisibleSelected={state.allVisibleSelected}
					onToggleSelectAll={state.toggleSelectAll}
					batchBusy={state.batchBusy}
					onOpenMoveModal={() => state.setShowMoveModal(true)}
					onBatchArchive={() => void state.handleBatchArchive()}
					onConfirmBatchDelete={() => state.setConfirmBatchDelete(true)}
					viewMode={state.viewMode}
					onToggleViewMode={state.toggleViewMode}
					onCreateFolder={() => state.setFolderModal({ folder: null })}
					onOpenImportModal={() => state.setShowImportModal(true)}
					typeTab={state.typeTab}
					onTypeTabChange={state.setTypeTab}
					getTypeCount={state.getTypeCount}
				/>

				<div className="flex-1 overflow-y-auto min-h-0">
					{loading ? (
						<div className="py-16 flex items-center justify-center gap-2 text-xs text-muted">
							<Loader2 className="w-4 h-4 animate-spin" />
							<span>正在加载素材库…</span>
						</div>
					) : state.visibleMaterials.length === 0 ? (
						<div className="m-5 py-16 text-center text-xs text-muted bg-surface/50 border border-dashed border-border rounded-2xl">
							{state.search.trim()
								? `没有匹配「${state.search.trim()}」的素材`
								: materials.length === 0
									? "素材库还是空的 —— 点「导入素材」导入本地文件（文档 / 视频 / 音频 / 图片）或整个文件夹"
									: "当前筛选下没有素材"}
						</div>
					) : (
						<>
							{state.viewMode === "grid" ? (
								<MaterialsGridView
									materials={state.displayedMaterials}
									selectMode={state.selectMode}
									selectedIds={state.selectedIds}
									importingId={state.importingId}
									openingDirId={state.openingDirId}
									onToggleSelect={state.toggleSelect}
									onToggleStar={(m) => void state.handleToggleStar(m)}
									onImportToStudio={(m) => void state.handleImportToStudio(m)}
									onOpenDir={(m) => void state.handleOpenDir(m)}
									onArchive={(m) => state.setArchiving(m)}
									onDelete={(m) => state.setDeleting(m)}
								/>
							) : (
								<MaterialsTableView
									materials={state.displayedMaterials}
									selectMode={state.selectMode}
									selectedIds={state.selectedIds}
									importingId={state.importingId}
									openingDirId={state.openingDirId}
									onToggleSelect={state.toggleSelect}
									onToggleStar={(m) => void state.handleToggleStar(m)}
									onImportToStudio={(m) => void state.handleImportToStudio(m)}
									onOpenDir={(m) => void state.handleOpenDir(m)}
									onArchive={(m) => state.setArchiving(m)}
									onDelete={(m) => state.setDeleting(m)}
								/>
							)}

							{/* 触底加载哨兵与状态提示 */}
							<div
								ref={sentinelRef}
								className="py-4 text-center text-xs text-muted"
							>
								{state.hasMore ? (
									<button
										type="button"
										onClick={state.loadMore}
										className="px-3 py-1.5 rounded-lg border border-border bg-surface hover:bg-accent/10 hover:text-accent transition-colors cursor-pointer"
									>
										已显示 {state.displayedMaterials.length} / 共{" "}
										{state.visibleMaterials.length} 条 · 点击加载更多
									</button>
								) : state.visibleMaterials.length > 48 ? (
									<span className="text-[11px] text-muted/70">
										已显示全部 {state.visibleMaterials.length} 条素材
									</span>
								) : null}
							</div>
						</>
					)}
				</div>
			</section>

			{/* 弹窗与确认框 */}
			<ImportMaterialModal
				isOpen={state.showImportModal}
				onClose={() => state.setShowImportModal(false)}
				folderId={state.currentFolder?.id ?? null}
				folderName={state.currentFolder?.name}
				onImported={state.handleChanged}
			/>

			<FolderFormModal
				folder={state.folderModal?.folder ?? null}
				isOpen={state.folderModal !== null}
				onClose={() => state.setFolderModal(null)}
				onSaved={state.handleChanged}
			/>

			<MoveToFolderModal
				isOpen={state.showMoveModal}
				folders={state.folders}
				selectedCount={state.selectedIds.size}
				busy={state.batchBusy}
				onClose={() => state.setShowMoveModal(false)}
				onMove={(folderId) => void state.handleBatchMove(folderId)}
			/>

			<ConfirmDialog
				isOpen={!!state.deletingFolder}
				onOpenChange={(open) => {
					if (!open) state.setDeletingFolder(null);
				}}
				title="删除文件夹"
				description={
					state.deletingFolder ? (
						<span>
							确定要删除文件夹{" "}
							<strong className="font-semibold text-foreground">
								{state.deletingFolder.name}
							</strong>{" "}
							吗？其中的素材不会被删除，会移回「未归档」。
						</span>
					) : undefined
				}
				confirmLabel={state.deleteFolderBusy ? "删除中..." : "确认删除"}
				onConfirm={state.handleDeleteFolder}
			/>

			<ConfirmDialog
				isOpen={!!state.archiving}
				onOpenChange={(open) => {
					if (!open) state.setArchiving(null);
				}}
				title="归档素材"
				description={
					state.archiving ? (
						<span>
							确定要归档素材{" "}
							<strong className="font-semibold text-foreground">
								{state.archiving.title}
							</strong>{" "}
							吗？归档后不再显示在素材库，可在「归档」Tab 查看、恢复或彻底删除。
						</span>
					) : undefined
				}
				confirmLabel={state.archiveBusy ? "归档中..." : "确认归档"}
				onConfirm={state.handleArchive}
			/>

			<ConfirmDialog
				isOpen={!!state.deleting}
				onOpenChange={(open) => {
					if (!open) state.setDeleting(null);
				}}
				title="删除素材"
				description={
					state.deleting ? (
						<span>
							确定要删除素材{" "}
							<strong className="font-semibold text-foreground">
								{state.deleting.title}
							</strong>{" "}
							吗？素材及其关联文件将被永久删除，且不可恢复。
						</span>
					) : undefined
				}
				confirmLabel="确认删除"
				onConfirm={state.handleDelete}
			/>

			<ConfirmDialog
				isOpen={state.confirmBatchDelete}
				onOpenChange={(open) => {
					if (!open) state.setConfirmBatchDelete(false);
				}}
				title="批量删除素材"
				description={
					<span>
						确定要删除选中的{" "}
						<strong className="font-semibold text-foreground">
							{state.selectedIds.size}
						</strong>{" "}
						条素材吗？素材及其关联文件将被永久删除，且不可恢复。
					</span>
				}
				confirmLabel={state.batchBusy ? "删除中..." : "确认删除"}
				onConfirm={state.handleBatchDelete}
			/>
		</div>
	);
}
