import { createFileRoute } from "@tanstack/react-router";
import {
	AIClassifyModal,
	BookmarkSyncModal,
	CategoryView,
	ChatWithBookmarksModal,
	DailyCapsuleBanner,
	FloatingChatButton,
	FolderDetailPanel,
	FolderDossierModal,
	FolderModal,
	GlobalSearchModal,
	SettingsModal,
	UnclassifiedView,
	WorkbenchHeader,
} from "../components/workbench";
import { useGlobalShortcuts } from "../hooks/useGlobalShortcuts";
import { useWorkbenchData } from "../hooks/useWorkbenchData";
import { useWorkbenchModals } from "../hooks/useWorkbenchModals";

export const Route = createFileRoute("/")({
	component: WorkbenchHome,
});

/**
 * Main Workbench Home Page — Lightweight orchestration container
 */
function WorkbenchHome() {
	// 1. Data, Sync and CRUD Business Logic
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
	} = useWorkbenchData();

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
		isGlobalSearchOpen,
		setIsGlobalSearchOpen,
		toggleGlobalSearch,
		isChatModalOpen,
		setIsChatModalOpen,
		dossierFolder,
		openDossierModal,
		closeDossierModal,
	} = useWorkbenchModals();

	// 3. Global Shortcuts (Cmd+K for search)
	useGlobalShortcuts({ onToggleSearch: toggleGlobalSearch });

	const isUnclassified = activeCategory === "未分类";

	return (
		<div className="min-h-screen bg-background text-foreground flex flex-col selection:bg-accent-soft selection:text-accent-soft-foreground">
			{/* Topbar Navigation Header */}
			<WorkbenchHeader
				categories={dynamicCategories}
				activeCategory={activeCategory}
				unclassifiedCount={unclassified.length}
				folders={folders}
				onSelectCategory={handleCategoryChange}
				onOpenChat={() => setIsChatModalOpen(true)}
				onOpenSearch={() => setIsGlobalSearchOpen(true)}
				onOpenAIClassify={() => setIsAIClassifyModalOpen(true)}
				onOpenSync={() => setIsSyncModalOpen(true)}
				onOpenCreateFolder={openCreateFolderModal}
				onOpenSettings={() => setIsSettingsModalOpen(true)}
			/>

			{/* Main Workspace Layout */}
			<div className="flex-1 flex w-full">
				{/* Main Content Area */}
				<main className="flex-1 p-8 lg:p-9 min-w-0 flex flex-col">
					{/* Daily Inspiration Capsule Banner */}
					<DailyCapsuleBanner onNavigateToFolder={handleNavigateFromSearch} />

					{/* Workspace Title & Quick Search Bar */}
					<div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-4 mb-6">
						<div>
							<div className="flex items-center gap-2">
								<h1 className="text-2xl font-bold tracking-tight text-foreground">
									{activeCategory}
								</h1>
								<span className="text-xs font-medium text-muted">
									{isUnclassified
										? `${unclassified.length} 条待整理书签`
										: `${filteredFolders.length} 个文件夹`}
								</span>
							</div>
							<p className="text-xs text-muted mt-1 leading-relaxed max-w-xl">
								{isUnclassified
									? "所有从 Chrome 扩展一键同步并存入 SQLite 数据库的书签缓冲池。点击「⚡ AI 智能归类」，DeepSeek 将深度分析并自动生成主题文件夹。"
									: "点击任意文件夹卡片，右侧侧边栏将呈现该文件夹在 SQLite 中归集的全部书签、九宫格预览与快捷外链。"}
							</p>
						</div>

						{/* Quick Global Search Trigger */}
						<div className="w-full sm:w-72 flex items-center gap-2">
							<button
								type="button"
								onClick={() => setIsGlobalSearchOpen(true)}
								className="w-full flex items-center justify-between px-3 py-1.5 rounded-xl bg-surface border border-border text-xs text-muted hover:border-accent/60 hover:text-foreground cursor-pointer shadow-2xs transition-all"
							>
								<div className="flex items-center gap-2 truncate">
									<span>🔍</span>
									<span className="truncate">全局搜索 / AI 语义检索...</span>
								</div>
								<kbd className="text-[10px] font-mono px-1.5 py-0.2 bg-surface-secondary border border-border rounded text-muted shrink-0">
									⌘K
								</kbd>
							</button>
						</div>
					</div>

					{/* View Switcher: Unclassified Pool vs Regular Category Folders */}
					{isUnclassified ? (
						<UnclassifiedView
							unclassified={filteredUnclassified}
							onOpenAIClassify={() => setIsAIClassifyModalOpen(true)}
							onDeleteItem={handleDeleteUnclassifiedItem}
						/>
					) : (
						<CategoryView
							folders={filteredFolders}
							selectedFolderId={selectedFolder?.id ?? null}
							onSelectFolder={(id) => setSelectedFolderId(id)}
							onCreateFolder={openCreateFolderModal}
						/>
					)}
				</main>

				{/* Right Detail Panel */}
				{!isUnclassified && (
					<FolderDetailPanel
						folder={selectedFolder}
						allFolders={folders}
						onEdit={openEditFolderModal}
						onDeleteItem={handleDeleteItemFromFolder}
						onMoveItem={handleMoveItem}
						onOpenDossier={openDossierModal}
					/>
				)}
			</div>

			{/* Feature Modals */}
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

			<AIClassifyModal
				isOpen={isAIClassifyModalOpen}
				itemsToClassify={unclassified}
				folders={folders}
				settings={settings}
				onClose={() => setIsAIClassifyModalOpen(false)}
				onClassificationComplete={handleClassificationComplete}
			/>

			<BookmarkSyncModal
				isOpen={isSyncModalOpen}
				onClose={() => setIsSyncModalOpen(false)}
				onBookmarksImported={(newItems) =>
					handleBookmarksImported(newItems, () => setIsAIClassifyModalOpen(true))
				}
			/>

			<SettingsModal
				isOpen={isSettingsModalOpen}
				onClose={() => setIsSettingsModalOpen(false)}
				onSettingsUpdated={setSettings}
			/>

			<GlobalSearchModal
				isOpen={isGlobalSearchOpen}
				onClose={() => setIsGlobalSearchOpen(false)}
				onNavigateToFolder={handleNavigateFromSearch}
			/>

			<ChatWithBookmarksModal
				isOpen={isChatModalOpen}
				onClose={() => setIsChatModalOpen(false)}
				onNavigateToFolder={handleNavigateFromSearch}
			/>

			<FolderDossierModal
				isOpen={!!dossierFolder}
				folder={dossierFolder}
				onClose={closeDossierModal}
			/>

			{/* Floating AI Assistant Bubble */}
			<FloatingChatButton onOpenChat={() => setIsChatModalOpen(true)} />
		</div>
	);
}
