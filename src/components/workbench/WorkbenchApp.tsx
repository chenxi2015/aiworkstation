import { Button, toast } from "@heroui/react";
import { Pencil, RefreshCw } from "lucide-react";
import {
	lazy,
	Suspense,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { useGlobalShortcuts } from "../../hooks/useGlobalShortcuts";
import { useWorkbenchData } from "../../hooks/useWorkbenchData";
import { useWorkbenchModals } from "../../hooks/useWorkbenchModals";
import {
	ALL_CATEGORY,
	isSystemCategory,
	type NavLayoutEntry,
	resolveCategoryLabel,
	sanitizeBookmarkFilter,
	UNCLASSIFIED_CATEGORY,
} from "../../modules/registry";
import { ExtensionBridgeService } from "../../services/extensionBridge";
import type { ChatWithBookmarksPanelRef } from "./ai/chat/ChatWithBookmarksPanel";
import { ChatWithBookmarksPanel } from "./ai/chat/ChatWithBookmarksPanel";
import { ConfirmDialog } from "./ConfirmDialog";
import {
	WorkbenchDndProvider,
	type WorkbenchDragData,
} from "./dnd/WorkbenchDnd";
import { FolderDetailPanel } from "./FolderDetailPanel";
import { RenameCategoryModal } from "./folder/RenameCategoryModal";
import { CategoryFilterBar } from "./layout/CategoryFilterBar";
import { CategoryView } from "./layout/CategoryView";
import { UnclassifiedView } from "./layout/UnclassifiedView";
import { WorkbenchHeader } from "./layout/WorkbenchHeader";
import type { Folder, WorkbenchItem, WorkbenchSettings } from "./types";

// Lazy-load feature modals for smaller initial bundle and faster hydration
const FolderModal = lazy(() =>
	import("./FolderModal").then((m) => ({
		default: m.FolderModal,
	})),
);
const AddLinkModal = lazy(() =>
	import("./AddLinkModal").then((m) => ({
		default: m.AddLinkModal,
	})),
);
const AIClassifyModal = lazy(() =>
	import("./ai/classify/AIClassifyModal").then((m) => ({
		default: m.AIClassifyModal,
	})),
);
const BookmarkSyncModal = lazy(() =>
	import("./BookmarkSyncModal").then((m) => ({
		default: m.BookmarkSyncModal,
	})),
);
const SettingsModal = lazy(() =>
	import("./SettingsModal").then((m) => ({
		default: m.SettingsModal,
	})),
);
const DeadLinksModal = lazy(() =>
	import("./DeadLinksModal").then((m) => ({
		default: m.DeadLinksModal,
	})),
);
const SetupWizard = lazy(() =>
	import("./SetupWizard").then((m) => ({
		default: m.SetupWizard,
	})),
);

export interface WorkbenchAppInitialData {
	folders: Folder[];
	unclassified: WorkbenchItem[];
	settings: WorkbenchSettings;
	activeCategory?: string;
}

export interface WorkbenchAppProps {
	initialData: WorkbenchAppInitialData;
	/** 模块路由锁定分类（如 workbench 模块锁定为 'workbench'），书签页不传 */
	fixedCategory?: string;
	/** 是否显示分类筛选条（书签模块开启） */
	showCategoryFilter?: boolean;
}

/**
 * Shared workbench browsing experience, parameterized per module route:
 * - 书签 (/bookmarks): full browsing with category filter bar (全部/未分类/自定义分组)
 * - 工作台 (/workbench) 等模块: locked to the module's category code
 *
 * Left: 文件夹详情与快捷看板 | Center: 文件夹网格 | Right: 常驻 AI 搜索与知识对话中心
 */
export function WorkbenchApp({
	initialData,
	fixedCategory,
	showCategoryFilter = false,
}: WorkbenchAppProps) {
	const chatPanelRef = useRef<ChatWithBookmarksPanelRef>(null);

	// 1. Data, Sync and CRUD Business Logic (Hydrated with Route Loader Data)
	const {
		folders,
		unclassified,
		settings,
		activeCategory,
		selectedFolder,
		currentFolder,
		folderPath,
		gridFolders,
		childFolderCounts,
		dynamicCategories,
		filteredFolders,
		filteredUnclassified,
		setSettings,
		setActiveCategory,
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
		handleRenameCategory,
		handleEnterFolder,
		handleNavigateToContainer,
		handleDeleteUnclassifiedItem,
		handleClearUnclassified,
		handleClassificationComplete,
		handleBookmarksImported,
		handleNavigateFromSearch,
		highlightItemId,
		clearHighlightItem,
		reloadFromDb,
	} = useWorkbenchData({
		...initialData,
		initialCategory:
			fixedCategory ?? sanitizeBookmarkFilter(initialData.activeCategory),
	});

	// Module routes lock the browsing category to the module code
	useEffect(() => {
		if (fixedCategory && activeCategory !== fixedCategory) {
			setActiveCategory(fixedCategory);
		}
	}, [fixedCategory, activeCategory, setActiveCategory]);

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

	// Refresh folder list state and action
	const [isRefreshing, setIsRefreshing] = useState(false);
	const handleRefresh = useCallback(async () => {
		if (isRefreshing) return;
		setIsRefreshing(true);
		try {
			await Promise.all([
				reloadFromDb(),
				new Promise((resolve) => setTimeout(resolve, 350)),
			]);
			toast.success("文件夹列表已刷新");
		} catch (error) {
			console.error("Failed to refresh folder list:", error);
			toast.danger("刷新文件夹列表失败，请稍后重试");
		} finally {
			setIsRefreshing(false);
		}
	}, [isRefreshing, reloadFromDb]);

	// Category rename modal state
	const [isRenameCategoryOpen, setIsRenameCategoryOpen] = useState(false);

	const isUnclassified = activeCategory === UNCLASSIFIED_CATEGORY;
	// 仅自定义分组可重命名（全部/未分类/模块 code 均为系统保留）
	const canRenameCategory =
		!isUnclassified &&
		activeCategory !== ALL_CATEGORY &&
		!isSystemCategory(activeCategory);
	const canEditTitle = Boolean(currentFolder) || canRenameCategory;

	// Handle title edit button: edit currentFolder if inside subfolder, or rename category
	const handleEditTitle = useCallback(() => {
		if (currentFolder) {
			openEditFolderModal(currentFolder);
		} else if (canRenameCategory) {
			setIsRenameCategoryOpen(true);
		}
	}, [currentFolder, openEditFolderModal, canRenameCategory]);

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

	// Open BookmarkSyncModal (directly reads Chrome bookmarks via extension or guides installation)
	const handleOpenSync = useCallback(() => {
		setIsSyncModalOpen(true);
	}, [setIsSyncModalOpen]);

	// Open AI Collector extension side panel directly from top header
	const handleOpenExtension = useCallback(async () => {
		const installed = await ExtensionBridgeService.checkInstalled();
		if (installed) {
			const res = await ExtensionBridgeService.openBookmarksPanel();
			if (res.success) {
				toast.success("已呼起 AI Collector 插件侧边栏");
				return;
			}
		}
		// If extension is not installed or open failed, prompt via guide modal
		setIsSyncModalOpen(true);
	}, [setIsSyncModalOpen]);

	// Attach single bookmark item to AI chat context
	const handleAttachBookmarkToChat = useCallback((item: WorkbenchItem) => {
		let host = "";
		if (item.url) {
			try {
				host = new URL(item.url).hostname;
			} catch {}
		}

		chatPanelRef.current?.addContextItem({
			id: `bookmark_${item.id ?? Date.now()}`,
			type: "bookmark",
			title: item.name,
			subtitle: host || undefined,
			url: item.url,
			icon: item.favicon,
		});
	}, []);

	// Attach dropped bookmark or folder to AI chat context
	const handleAttachToChat = useCallback(
		(data: WorkbenchDragData) => {
			if (data.kind === "item") {
				handleAttachBookmarkToChat(data.item);
			} else if (data.kind === "folder") {
				const folder = data.folder;
				const count = folder.items?.length ?? 0;
				chatPanelRef.current?.addContextItem({
					id: `folder_${folder.id}`,
					type: "folder",
					title: folder.name,
					subtitle: `${count} 个书签`,
					folderId: folder.id,
					category: folder.category,
				});
			}
		},
		[handleAttachBookmarkToChat],
	);

	// Title for the current browsing context (category codes resolve to module labels)
	const displayTitle = currentFolder
		? currentFolder.name
		: activeCategory === ALL_CATEGORY
			? "全部书签"
			: resolveCategoryLabel(activeCategory);

	return (
		<WorkbenchDndProvider
			gridFolderIds={gridFolders.map((f) => f.id)}
			onMoveItemToFolder={handleMoveItem}
			onMoveFolder={handleMoveFolder}
			onMoveFolderToCategory={handleMoveFolderToCategory}
			onReorderFolders={handleReorderFolders}
			onAttachToChat={handleAttachToChat}
		>
			<div className="h-screen bg-surface dark:bg-background text-foreground flex flex-col overflow-hidden selection:bg-accent-soft selection:text-accent-soft-foreground">
				{/* Topbar Navigation Header — Unified Search Triggers Right Panel */}
				<WorkbenchHeader
					unclassifiedCount={unclassified.length}
					navLayout={settings.navLayout as NavLayoutEntry[] | undefined}
					onOpenExtension={handleOpenExtension}
					onOpenSearch={() => chatPanelRef.current?.openSearchTab()}
					onOpenSync={handleOpenSync}
					onOpenCreateFolder={openCreateFolderModal}
					onOpenSettings={() => setIsSettingsModalOpen(true)}
					onOpenAIClassifyTask={() => setIsAIClassifyModalOpen(true)}
				/>

				{/* 书签模块：分类筛选条（数据维度，非导航） */}
				{showCategoryFilter && (
					<CategoryFilterBar
						categories={dynamicCategories}
						activeCategory={activeCategory}
						unclassifiedCount={unclassified.length}
						folders={folders}
						onSelectCategory={handleCategoryChange}
					/>
				)}

				{/* Main Workspace Layout (Left: Folder Details | Center: Grid | Right: Resident AI Search Hub) */}
				<div className="flex-1 flex w-full min-h-0 overflow-hidden">
					{isUnclassified ? (
						/* Unclassified Inbox Buffer */
						<main className="flex-1 p-6 lg:p-8 min-w-0 flex flex-col overflow-y-auto h-full">
							{/* Workspace Title */}
							<div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-4 mb-6">
								<div>
									<div className="flex items-center gap-2">
										<h1 className="text-2xl font-bold tracking-tight text-foreground">
											{UNCLASSIFIED_CATEGORY}
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
								onClearUnclassified={handleClearUnclassified}
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
								highlightItemId={highlightItemId}
								onHighlightClear={clearHighlightItem}
								onSelectFolder={handleSelectFolder}
								onCreateFolder={openCreateFolderModal}
								onEdit={openEditFolderModal}
								onDeleteItem={(item, folderId) =>
									setItemPendingDelete({ item, folderId })
								}
								onMoveItem={handleMoveItem}
								onAskAIAboutFolder={handleAskAIAboutFolder}
								onAttachToChat={handleAttachBookmarkToChat}
							/>

							{/* 2. Main Column: 文件夹列表与卡片区 (Category Folders Grid) */}
							<main className="flex-1 p-6 lg:p-7 min-w-0 flex flex-col overflow-y-auto h-full">
								{/* Workspace Title */}
								<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
									<div>
										<div className="flex items-center gap-2">
											<h1 className="text-2xl font-bold tracking-tight text-foreground">
												{displayTitle}
											</h1>
											<span className="text-xs font-medium text-muted">
												{gridFolders.length} 个
												{currentFolder ? "子文件夹" : "文件夹"}
											</span>
											{canEditTitle && (
												<Button
													variant="ghost"
													size="sm"
													className="rounded-full h-7 w-7 p-0 min-w-0 cursor-pointer text-muted hover:text-foreground hover:bg-surface-secondary/80 transition-colors"
													onPress={handleEditTitle}
													aria-label={
														currentFolder ? "编辑当前文件夹" : "编辑分类名称"
													}
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

									{/* Action buttons: Refresh folder list */}
									<div className="flex items-center gap-2 shrink-0">
										<Button
											variant="secondary"
											size="sm"
											className="rounded-full flex items-center gap-1.5 cursor-pointer text-xs"
											isDisabled={isRefreshing}
											onPress={handleRefresh}
										>
											<RefreshCw
												className={`w-3.5 h-3.5 ${
													isRefreshing
														? "animate-spin text-accent"
														: "text-muted"
												}`}
											/>
											<span>刷新列表</span>
										</Button>
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
							categories={dynamicCategories}
							defaultCategory={
								isUnclassified || activeCategory === ALL_CATEGORY
									? "工作台"
									: activeCategory
							}
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

					{/* Category rename modal */}
					{isRenameCategoryOpen && (
						<RenameCategoryModal
							isOpen={isRenameCategoryOpen}
							category={activeCategory}
							allCategories={dynamicCategories}
							onClose={() => setIsRenameCategoryOpen(false)}
							onRename={handleRenameCategory}
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

					{/* First-time setup wizard: shown when setup has not been completed */}
					<SetupWizard
						isOpen={!settings.setupComplete}
						existingSettings={settings}
						onComplete={setSettings}
					/>
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
