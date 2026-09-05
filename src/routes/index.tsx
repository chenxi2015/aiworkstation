import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useCallback, useRef, useState } from "react";
import {
	CategoryView,
	ChatWithBookmarksPanel,
	type ChatWithBookmarksPanelRef,
	ConfirmDialog,
	FolderDetailPanel,
	UnclassifiedView,
	WorkbenchHeader,
	type WorkbenchItem,
	WorkbenchSkeleton,
} from "../components/workbench";
import { WorkbenchDndProvider } from "../components/workbench/dnd/WorkbenchDnd";
import { useGlobalShortcuts } from "../hooks/useGlobalShortcuts";
import { useWorkbenchData } from "../hooks/useWorkbenchData";
import { useWorkbenchModals } from "../hooks/useWorkbenchModals";
import { WorkbenchStorageService } from "../services/workbenchStorage";

// Lazy-load feature modals for smaller initial bundle and faster hydration
const FolderModal = lazy(() =>
	import("../components/workbench/FolderModal").then((m) => ({
		default: m.FolderModal,
	})),
);
const AddLinkModal = lazy(() =>
	import("../components/workbench/AddLinkModal").then((m) => ({
		default: m.AddLinkModal,
	})),
);
const AIClassifyModal = lazy(() =>
	import("../components/workbench/ai/classify/AIClassifyModal").then((m) => ({
		default: m.AIClassifyModal,
	})),
);
const BookmarkSyncModal = lazy(() =>
	import("../components/workbench/BookmarkSyncModal").then((m) => ({
		default: m.BookmarkSyncModal,
	})),
);
const SettingsModal = lazy(() =>
	import("../components/workbench/SettingsModal").then((m) => ({
		default: m.SettingsModal,
	})),
);
const DeadLinksModal = lazy(() =>
	import("../components/workbench/DeadLinksModal").then((m) => ({
		default: m.DeadLinksModal,
	})),
);

export const Route = createFileRoute("/")({
	loader: async () => {
		const { folders, unclassified } =
			await WorkbenchStorageService.fetchAllFromDb();
		const settings = await WorkbenchStorageService.fetchSettingsFromDb();
		return { folders, unclassified, settings };
	},
	pendingComponent: WorkbenchSkeleton,
	pendingMs: 0,
	component: WorkbenchHome,
});

/**
 * Main Workbench Home Page:
 * Left: 文件夹详情与快捷看板 (Folder Detail Panel)
 * Center: 文件夹列表/卡片区 (Category Folders Grid)
 * Right: 常驻 AI 搜索与知识对话中心 (Resident AI Search & Q&A Hub - Single Search Entry)
 */
function WorkbenchHome() {
	const initialData = Route.useLoaderData();
	const chatPanelRef = useRef<ChatWithBookmarksPanelRef>(null);

	// 1. Data, Sync and CRUD Business Logic (Hydrated with Route Loader Data)
	const {
		folders,
		unclassified,
		settings,
		activeCategory,
		selectedFolder,
		folderPath,
		gridFolders,
		childFolderCounts,
		dynamicCategories,
		filteredFolders,
		filteredUnclassified,
		setSettings,
		setSelectedFolderId,
		handleCategoryChange,
		handleSaveFolder,
		handleDeleteFolder,
		handleAddLink,
		handleDeleteItemFromFolder,
		handleMoveItem,
		handleMoveFolder,
		handleMoveFolderToCategory,
		handleReorderFolders,
		handleEnterFolder,
		handleNavigateToContainer,
		handleDeleteUnclassifiedItem,
		handleClassificationComplete,
		handleBookmarksImported,
		handleNavigateFromSearch,
		reloadFromDb,
	} = useWorkbenchData(initialData);

	// 2. Modals state management
	const {
		folderModalState,
		openCreateFolderModal,
		openEditFolderModal,
		closeFolderModal,
		addLinkFolder,
		openAddLinkModal,
		closeAddLinkModal,
		isSyncModalOpen,
		setIsSyncModalOpen,
		isAIClassifyModalOpen,
		setIsAIClassifyModalOpen,
		isSettingsModalOpen,
		setIsSettingsModalOpen,
		isDeadLinksModalOpen,
		setIsDeadLinksModalOpen,
	} = useWorkbenchModals();

	// Direct and instant folder selection without unnecessary re-render triggers
	const handleSelectFolder = useCallback(
		(id: number) => {
			setSelectedFolderId(id);
		},
		[setSelectedFolderId],
	);

	// Direct prompt dispatch to chat assistant in a new session
	const handleAskAIAboutFolder = useCallback((prompt: string) => {
		chatPanelRef.current?.sendPrompt(prompt, { newChat: true });
	}, []);

	// Ask AI to summarize & review a specific folder from its card menu
	const handleAskAISummarizeFolder = useCallback(
		(folder: (typeof folders)[number]) => {
			const count = folder.items?.length || 0;
			handleAskAIAboutFolder(
				`请深度总结与盘点「${folder.name}」文件夹中的 ${count} 个书签条目，分析核心亮点、适用场景与推荐使用工作流。`,
			);
		},
		[handleAskAIAboutFolder],
	);

	// Destructive actions pending user confirmation via HeroUI AlertDialog
	const [folderPendingDelete, setFolderPendingDelete] = useState<
		(typeof folders)[number] | null
	>(null);
	const [itemPendingDelete, setItemPendingDelete] = useState<{
		item: WorkbenchItem;
		folderId: number | null;
	} | null>(null);

	// Delete a folder from its card menu with confirmation
	const handleDeleteFolderFromCard = useCallback(
		(folder: (typeof folders)[number]) => {
			setFolderPendingDelete(folder);
		},
		[],
	);

	// 3. Switch to Fast Search in Right Panel on Cmd+K
	useGlobalShortcuts({
		onToggleSearch: () => {
			chatPanelRef.current?.openSearchTab();
		},
	});

	const isUnclassified = activeCategory === "未分类";

	return (
		<WorkbenchDndProvider
			gridFolderIds={gridFolders.map((f) => f.id)}
			onMoveItemToFolder={handleMoveItem}
			onMoveFolder={handleMoveFolder}
			onMoveFolderToCategory={handleMoveFolderToCategory}
			onReorderFolders={handleReorderFolders}
		>
			<div className="h-screen bg-surface dark:bg-background text-foreground flex flex-col overflow-hidden selection:bg-accent-soft selection:text-accent-soft-foreground">
				{/* Topbar Navigation Header — Unified Search Triggers Right Panel */}
				<WorkbenchHeader
					categories={dynamicCategories}
					activeCategory={activeCategory}
					unclassifiedCount={unclassified.length}
					folders={folders}
					onSelectCategory={handleCategoryChange}
					onOpenSearch={() => chatPanelRef.current?.openSearchTab()}
					onOpenSync={() => setIsSyncModalOpen(true)}
					onOpenCreateFolder={openCreateFolderModal}
					onOpenSettings={() => setIsSettingsModalOpen(true)}
				/>

				{/* Main Workspace Layout (Left: Folder Details | Center: Grid | Right: Resident AI Search Hub) */}
				<div className="flex-1 flex w-full min-h-0 overflow-hidden">
					{isUnclassified ? (
						/* Unclassified Inbox Buffer */
						<main className="flex-1 p-6 lg:p-8 min-w-0 flex flex-col overflow-y-auto border-r border-border h-full">
							{/* Workspace Title */}
							<div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-4 mb-6">
								<div>
									<div className="flex items-center gap-2">
										<h1 className="text-2xl font-bold tracking-tight text-foreground">
											{activeCategory}
										</h1>
										<span className="text-xs font-medium text-muted">
											{unclassified.length} 条待整理书签
										</span>
									</div>
									<p className="text-xs text-muted mt-1 leading-relaxed max-w-3xl">
										从 Chrome 扩展同步的未分类书签缓冲池。点击下方「启动
										DeepSeek
										一键智能分类」，将深度分析并自动生成主题文件夹入库。
									</p>
								</div>
							</div>

							<UnclassifiedView
								unclassified={filteredUnclassified}
								folders={folders}
								onOpenAIClassify={() => setIsAIClassifyModalOpen(true)}
								onDeleteItem={(item) =>
									setItemPendingDelete({ item, folderId: null })
								}
								onMoveItem={(item, targetFolderId) =>
									handleMoveItem(item, null, targetFolderId)
								}
							/>
						</main>
					) : (
						<>
							{/* 1. Left Column: 文件夹详情与快捷看板 (Folder Details & Bookmarks) */}
							<FolderDetailPanel
								folder={selectedFolder}
								categoryFolders={filteredFolders}
								allFolders={folders}
								onSelectFolder={handleSelectFolder}
								onCreateFolder={openCreateFolderModal}
								onEdit={openEditFolderModal}
								onDeleteItem={(item, folderId) =>
									setItemPendingDelete({ item, folderId })
								}
								onMoveItem={handleMoveItem}
								onAskAIAboutFolder={handleAskAIAboutFolder}
							/>

							{/* 2. Main Column: 文件夹列表与卡片区 (Category Folders Grid) */}
							<main className="flex-1 p-6 lg:p-7 min-w-0 flex flex-col overflow-y-auto h-full">
								{/* Workspace Title */}
								<div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-4 mb-6">
									<div>
										<div className="flex items-center gap-2">
											<h1 className="text-2xl font-bold tracking-tight text-foreground">
												{activeCategory}
											</h1>
											<span className="text-xs font-medium text-muted">
												{gridFolders.length} 个文件夹
											</span>
										</div>
										<p className="text-xs text-muted mt-1 leading-relaxed max-w-2xl">
											点击文件夹卡片可在左侧查看书签与快捷看板，支持自由拖拽排序与移动归类；右侧随时进行
											AI 搜索与知识问答。
										</p>
									</div>
								</div>

								{/* Folders Grid View */}
								<CategoryView
									folders={gridFolders}
									allFolders={folders}
									selectedFolderId={selectedFolder?.id ?? null}
									categoryName={activeCategory}
									folderPath={folderPath}
									childFolderCounts={childFolderCounts}
									onSelectFolder={handleSelectFolder}
									onCreateFolder={openCreateFolderModal}
									onEnterFolder={handleEnterFolder}
									onNavigateBreadcrumb={handleNavigateToContainer}
									onEditFolder={openEditFolderModal}
									onDeleteFolder={handleDeleteFolderFromCard}
									onMoveFolder={handleMoveFolder}
									onCreateLink={openAddLinkModal}
									onAskAIAboutFolder={handleAskAISummarizeFolder}
								/>
							</main>
						</>
					)}

					{/* 3. Right Column: Resident AI Search & Knowledge Q&A Central Hub (Permanent Singleton) */}
					<ChatWithBookmarksPanel
						ref={chatPanelRef}
						selectedFolder={isUnclassified ? null : selectedFolder}
						activeCategory={activeCategory}
						folders={folders}
						categories={dynamicCategories}
						settings={settings}
						onNavigateToFolder={handleNavigateFromSearch}
						onDataChanged={reloadFromDb}
					/>
				</div>

				{/* Lazy-Loaded Feature Modals */}
				<Suspense fallback={null}>
					{folderModalState.isOpen && (
						<FolderModal
							isOpen={folderModalState.isOpen}
							folder={folderModalState.folder}
							folders={folders}
							defaultCategory={isUnclassified ? "工作台" : activeCategory}
							defaultParentId={folderModalState.defaultParentId}
							onClose={closeFolderModal}
							onSave={async (data) => {
								await handleSaveFolder(data);
								closeFolderModal();
							}}
							onDelete={async (id) => {
								await handleDeleteFolder(id);
								closeFolderModal();
							}}
						/>
					)}

					{addLinkFolder && (
						<AddLinkModal
							isOpen={!!addLinkFolder}
							folder={addLinkFolder}
							onClose={closeAddLinkModal}
							onSave={async (data) => {
								await handleAddLink(addLinkFolder.id, data);
								closeAddLinkModal();
							}}
						/>
					)}

					{isAIClassifyModalOpen && (
						<AIClassifyModal
							isOpen={isAIClassifyModalOpen}
							itemsToClassify={unclassified}
							folders={folders}
							settings={settings}
							onClose={() => setIsAIClassifyModalOpen(false)}
							onClassificationComplete={handleClassificationComplete}
							onOpenSettings={() => {
								setIsAIClassifyModalOpen(false);
								setIsSettingsModalOpen(true);
							}}
						/>
					)}

					{isSyncModalOpen && (
						<BookmarkSyncModal
							isOpen={isSyncModalOpen}
							onClose={() => setIsSyncModalOpen(false)}
							onBookmarksImported={(newItems) =>
								handleBookmarksImported(newItems, () =>
									setIsAIClassifyModalOpen(true),
								)
							}
						/>
					)}

					{isSettingsModalOpen && (
						<SettingsModal
							isOpen={isSettingsModalOpen}
							onClose={() => setIsSettingsModalOpen(false)}
							onSettingsUpdated={setSettings}
							onOpenDeadLinks={() => setIsDeadLinksModalOpen(true)}
							onDataCleared={reloadFromDb}
						/>
					)}

					{isDeadLinksModalOpen && (
						<DeadLinksModal
							isOpen={isDeadLinksModalOpen}
							onClose={() => setIsDeadLinksModalOpen(false)}
							onDataChanged={reloadFromDb}
						/>
					)}
				</Suspense>

				{/* Folder deletion confirmation */}
				<ConfirmDialog
					isOpen={!!folderPendingDelete}
					onOpenChange={(open) => !open && setFolderPendingDelete(null)}
					title="删除文件夹"
					description={
						folderPendingDelete
							? `确定删除文件夹「${folderPendingDelete.name}」吗？此操作不可撤销。`
							: undefined
					}
					confirmLabel="删除文件夹"
					onConfirm={async () => {
						if (folderPendingDelete) {
							await handleDeleteFolder(folderPendingDelete.id);
						}
					}}
				/>

				{/* Bookmark item deletion confirmation */}
				<ConfirmDialog
					isOpen={!!itemPendingDelete}
					onOpenChange={(open) => !open && setItemPendingDelete(null)}
					title="删除书签"
					description={
						itemPendingDelete
							? `确定删除「${itemPendingDelete.item.name}」吗？此操作不可撤销。`
							: undefined
					}
					confirmLabel="删除"
					onConfirm={async () => {
						if (!itemPendingDelete) return;
						if (itemPendingDelete.folderId === null) {
							await handleDeleteUnclassifiedItem(itemPendingDelete.item);
						} else {
							await handleDeleteItemFromFolder(
								itemPendingDelete.item,
								itemPendingDelete.folderId,
							);
						}
					}}
				/>
			</div>
		</WorkbenchDndProvider>
	);
}
