import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useCallback, useRef } from "react";
import {
	CategoryView,
	ChatWithBookmarksPanel,
	type ChatWithBookmarksPanelRef,
	DailyCapsuleBanner,
	FolderDetailPanel,
	UnclassifiedView,
	WorkbenchHeader,
	WorkbenchSkeleton,
} from "../components/workbench";
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

export const Route = createFileRoute("/")({
	loader: async () => {
		const { folders, unclassified } =
			await WorkbenchStorageService.fetchAllFromDb();
		const settings = WorkbenchStorageService.getSettings();
		return { folders, unclassified, settings };
	},
	pendingComponent: WorkbenchSkeleton,
	pendingMs: 0,
	component: WorkbenchHome,
});

/**
 * Main Workbench Home Page:
 * Left: 文件夹详情与快捷看板 (Folder Detail Panel)
 * Center: 文件夹列表/卡片区 (Category Folders Grid & Daily Capsules)
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
		dynamicCategories,
		filteredFolders,
		filteredUnclassified,
		setSettings,
		setSelectedFolderId,
		handleCategoryChange,
		handleSaveFolder,
		handleDeleteFolder,
		handleDeleteItemFromFolder,
		handleMoveItem,
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
		isSyncModalOpen,
		setIsSyncModalOpen,
		isAIClassifyModalOpen,
		setIsAIClassifyModalOpen,
		isSettingsModalOpen,
		setIsSettingsModalOpen,
	} = useWorkbenchModals();

	// Direct and instant folder selection without unnecessary re-render triggers
	const handleSelectFolder = useCallback(
		(id: number) => {
			setSelectedFolderId(id);
		},
		[setSelectedFolderId],
	);

	// Direct prompt dispatch to chat assistant
	const handleAskAIAboutFolder = useCallback((prompt: string) => {
		chatPanelRef.current?.sendPrompt(prompt);
	}, []);

	// 3. Focus Right AI Search Input on Cmd+K
	useGlobalShortcuts({
		onToggleSearch: () => {
			chatPanelRef.current?.focusInput();
		},
	});

	const isUnclassified = activeCategory === "未分类";

	return (
		<div className="h-screen bg-background text-foreground flex flex-col overflow-hidden selection:bg-accent-soft selection:text-accent-soft-foreground">
			{/* Topbar Navigation Header — Unified Search Triggers Right Panel */}
			<WorkbenchHeader
				categories={dynamicCategories}
				activeCategory={activeCategory}
				unclassifiedCount={unclassified.length}
				folders={folders}
				onSelectCategory={handleCategoryChange}
				onOpenSearch={() => chatPanelRef.current?.focusInput()}
				onOpenSync={() => setIsSyncModalOpen(true)}
				onOpenCreateFolder={openCreateFolderModal}
				onOpenSettings={() => setIsSettingsModalOpen(true)}
			/>

			{/* Main Workspace Layout (Left: Folder Details | Center: Grid | Right: Resident AI Search Hub) */}
			<div className="flex-1 flex w-full min-h-0 overflow-hidden">
				{isUnclassified ? (
					<div className="flex-1 flex w-full min-h-0 overflow-hidden">
						{/* Unclassified Inbox Buffer */}
						<main className="flex-1 p-6 lg:p-8 min-w-0 flex flex-col overflow-y-auto border-r border-border h-full">
							{/* Daily Inspiration Capsule Banner */}
							<DailyCapsuleBanner
								onNavigateToFolder={handleNavigateFromSearch}
							/>

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
									<p className="text-xs text-muted mt-1 leading-relaxed max-w-2xl">
										从 Chrome 扩展同步的未分类书签缓冲池。点击下方「启动
										DeepSeek
										一键智能分类」，将深度分析并自动生成主题文件夹入库。
									</p>
								</div>
							</div>

							<UnclassifiedView
								unclassified={filteredUnclassified}
								onOpenAIClassify={() => setIsAIClassifyModalOpen(true)}
								onDeleteItem={handleDeleteUnclassifiedItem}
							/>
						</main>

						{/* Right: Resident AI Search & Q&A Central Hub */}
						<ChatWithBookmarksPanel
							ref={chatPanelRef}
							selectedFolder={null}
							folders={folders}
							categories={dynamicCategories}
							onNavigateToFolder={handleNavigateFromSearch}
							onDataChanged={reloadFromDb}
						/>
					</div>
				) : (
					<div className="flex-1 flex w-full min-h-0 overflow-hidden">
						{/* 1. Left Column: 文件夹详情与快捷看板 (Folder Details & Bookmarks) */}
						<FolderDetailPanel
							folder={selectedFolder}
							categoryFolders={filteredFolders}
							allFolders={folders}
							onSelectFolder={handleSelectFolder}
							onCreateFolder={openCreateFolderModal}
							onEdit={openEditFolderModal}
							onDeleteItem={handleDeleteItemFromFolder}
							onMoveItem={handleMoveItem}
							onAskAIAboutFolder={handleAskAIAboutFolder}
						/>

						{/* 2. Main Column: 文件夹列表与卡片区 (Category Folders Grid) */}
						<main className="flex-1 p-6 lg:p-7 min-w-0 flex flex-col overflow-y-auto h-full">
							{/* Daily Inspiration Capsule Banner */}
							<DailyCapsuleBanner
								onNavigateToFolder={handleNavigateFromSearch}
							/>

							{/* Workspace Title */}
							<div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-4 mb-6">
								<div>
									<div className="flex items-center gap-2">
										<h1 className="text-2xl font-bold tracking-tight text-foreground">
											{activeCategory}
										</h1>
										<span className="text-xs font-medium text-muted">
											{filteredFolders.length} 个文件夹
										</span>
									</div>
									<p className="text-xs text-muted mt-1 leading-relaxed max-w-xl">
										点击任意文件夹卡片，左侧将呈现其全部书签、九宫格预览与快捷外链看板；右侧随时进行
										AI 搜索与知识问答。
									</p>
								</div>
							</div>

							{/* Folders Grid View */}
							<CategoryView
								folders={filteredFolders}
								selectedFolderId={selectedFolder?.id ?? null}
								onSelectFolder={handleSelectFolder}
								onCreateFolder={openCreateFolderModal}
							/>
						</main>

						{/* 3. Right Column: Resident AI Search & Knowledge Q&A Central Hub */}
						<ChatWithBookmarksPanel
							ref={chatPanelRef}
							selectedFolder={selectedFolder}
							folders={folders}
							categories={dynamicCategories}
							onNavigateToFolder={handleNavigateFromSearch}
							onDataChanged={reloadFromDb}
						/>
					</div>
				)}
			</div>

			{/* Lazy-Loaded Feature Modals */}
			<Suspense fallback={null}>
				{folderModalState.isOpen && (
					<FolderModal
						isOpen={folderModalState.isOpen}
						folder={folderModalState.folder}
						defaultCategory={isUnclassified ? "工作台" : activeCategory}
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

				{isAIClassifyModalOpen && (
					<AIClassifyModal
						isOpen={isAIClassifyModalOpen}
						itemsToClassify={unclassified}
						folders={folders}
						settings={settings}
						onClose={() => setIsAIClassifyModalOpen(false)}
						onClassificationComplete={handleClassificationComplete}
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
					/>
				)}
			</Suspense>
		</div>
	);
}
