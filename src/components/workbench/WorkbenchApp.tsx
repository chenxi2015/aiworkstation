import { toast } from "@heroui/react";
import { useCallback, useEffect, useState } from "react";
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
import { WorkbenchStorageService } from "../../services/workbenchStorage";
import { FolderDetailPanel } from "./FolderDetailPanel";
import { useWorkbenchAiBridge } from "./hooks/useWorkbenchAiBridge";
import { CategoryFilterBar } from "./layout/CategoryFilterBar";
import { CategoryMainView } from "./layout/CategoryMainView";
import { UnclassifiedWorkspace } from "./layout/UnclassifiedWorkspace";
import { WorkbenchHeader } from "./layout/WorkbenchHeader";
import type {
	Folder,
	FolderGridView,
	WorkbenchItem,
	WorkbenchSettings,
} from "./types";
import { WorkbenchModals } from "./WorkbenchModals";

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
		handleSaveFolderViewPrefs,
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
	const modalsState = useWorkbenchModals();
	const {
		openCreateFolderModal,
		openEditFolderModal,
		openAddLinkModal,
		setIsSyncModalOpen,
		setIsAIClassifyModalOpen,
		setIsSettingsModalOpen,
	} = modalsState;

	// Intro / download modal shown when AI Collector extension is missing
	const [isIntroModalOpen, setIsIntroModalOpen] = useState(false);
	// Category rename modal state
	const [isRenameCategoryOpen, setIsRenameCategoryOpen] = useState(false);
	// Destructive actions pending user confirmation via HeroUI ConfirmDialog
	const [folderPendingDelete, setFolderPendingDelete] = useState<Folder | null>(
		null,
	);
	const [itemPendingDelete, setItemPendingDelete] = useState<{
		item: WorkbenchItem;
		folderId: number | null;
	} | null>(null);

	const isUnclassified = activeCategory === UNCLASSIFIED_CATEGORY;

	// 3. AI panel synchronization and extension bridge hook
	const {
		handleAttachBookmarkToChat,
		handleAskAIAboutFolder,
		handleAskAISummarizeFolder,
		handleOpenSearch,
		handleOpenExtension,
	} = useWorkbenchAiBridge({
		folders,
		dynamicCategories,
		settings,
		selectedFolder,
		activeCategory,
		isUnclassified,
		gridFolders,
		reloadFromDb,
		handleNavigateFromSearch,
		handleMoveItem,
		handleMoveFolder,
		handleMoveFolderToCategory,
		handleReorderFolders,
		setIsIntroModalOpen,
	});

	// Direct and instant folder selection without unnecessary re-render triggers
	const handleSelectFolder = useCallback(
		(id: number) => {
			setSelectedFolderId(id);
		},
		[setSelectedFolderId],
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

	// 文件夹区网格/列表视图切换（全局偏好，持久化到 workbench_settings）
	const folderGridView: FolderGridView = settings.folderGridView ?? "grid";
	const handleFolderGridViewChange = useCallback(
		(mode: FolderGridView) => {
			if (mode === folderGridView) return;
			const next: WorkbenchSettings = { ...settings, folderGridView: mode };
			setSettings(next);
			WorkbenchStorageService.saveSettings(next);
		},
		[folderGridView, settings, setSettings],
	);

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

	// Open BookmarkSyncModal (directly reads Chrome bookmarks via extension or guides installation)
	const handleOpenSync = useCallback(() => {
		setIsSyncModalOpen(true);
	}, [setIsSyncModalOpen]);

	// Title for the current browsing context (category codes resolve to module labels)
	const displayTitle = currentFolder
		? currentFolder.name
		: activeCategory === ALL_CATEGORY
			? "全部书签"
			: resolveCategoryLabel(activeCategory);

	return (
		<div className="h-screen bg-surface dark:bg-background text-foreground flex flex-col overflow-hidden selection:bg-accent-soft selection:text-accent-soft-foreground">
			{/* Topbar Navigation Header — Unified Search Triggers Right Panel */}
			<WorkbenchHeader
				unclassifiedCount={unclassified.length}
				navLayout={settings.navLayout as NavLayoutEntry[] | undefined}
				onOpenExtension={handleOpenExtension}
				onOpenSearch={handleOpenSearch}
				onOpenSync={fixedCategory ? undefined : handleOpenSync}
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
					<UnclassifiedWorkspace
						unclassified={filteredUnclassified}
						totalCount={unclassified.length}
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
							onSaveViewPrefs={(prefs) =>
								selectedFolder &&
								handleSaveFolderViewPrefs(selectedFolder.id, prefs)
							}
							onAskAIAboutFolder={handleAskAIAboutFolder}
							onAttachToChat={handleAttachBookmarkToChat}
						/>

						{/* 2. Main Column: 文件夹列表与卡片区 (Category Folders Grid) */}
						<CategoryMainView
							displayTitle={displayTitle}
							currentFolder={currentFolder}
							gridFolders={gridFolders}
							allFolders={folders}
							selectedFolderId={selectedFolder?.id ?? null}
							activeCategory={activeCategory}
							folderPath={folderPath}
							childFolderCounts={childFolderCounts}
							folderGridView={folderGridView}
							canEditTitle={canEditTitle}
							isRefreshing={isRefreshing}
							onEditTitle={handleEditTitle}
							onFolderGridViewChange={handleFolderGridViewChange}
							onRefresh={handleRefresh}
							onSelectFolder={handleSelectFolder}
							onCreateFolder={openCreateFolderModal}
							onEnterFolder={handleEnterFolder}
							onNavigateBreadcrumb={handleNavigateToContainer}
							onEditFolder={openEditFolderModal}
							onDeleteFolder={(folder) => setFolderPendingDelete(folder)}
							onMoveFolder={handleMoveFolder}
							onCreateLink={openAddLinkModal}
							onAskAIAboutFolder={handleAskAISummarizeFolder}
						/>
					</>
				)}
			</div>

			{/* Aggregated Feature & Confirm Modals */}
			<WorkbenchModals
				folders={folders}
				unclassified={unclassified}
				settings={settings}
				activeCategory={activeCategory}
				dynamicCategories={dynamicCategories}
				isUnclassified={isUnclassified}
				{...modalsState}
				isIntroModalOpen={isIntroModalOpen}
				setIsIntroModalOpen={setIsIntroModalOpen}
				isRenameCategoryOpen={isRenameCategoryOpen}
				setIsRenameCategoryOpen={setIsRenameCategoryOpen}
				folderPendingDelete={folderPendingDelete}
				setFolderPendingDelete={setFolderPendingDelete}
				itemPendingDelete={itemPendingDelete}
				setItemPendingDelete={setItemPendingDelete}
				handleSaveFolder={handleSaveFolder}
				handleDeleteFolder={handleDeleteFolder}
				handleAddLink={handleAddLink}
				handleRenameCategory={handleRenameCategory}
				handleClassificationComplete={handleClassificationComplete}
				handleBookmarksImported={handleBookmarksImported}
				handleDeleteUnclassifiedItem={handleDeleteUnclassifiedItem}
				handleDeleteItemFromFolder={handleDeleteItemFromFolder}
				setSettings={setSettings}
				reloadFromDb={reloadFromDb}
			/>
		</div>
	);
}
