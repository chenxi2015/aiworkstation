import { lazy, Suspense } from "react";
import type { FolderModalState } from "../../hooks/useWorkbenchModals";
import type { SaveFolderPayload } from "../../hooks/workbench/useWorkbenchFolderActions";
import { ALL_CATEGORY } from "../../modules/registry";
import { ConfirmDialog } from "./ConfirmDialog";
import { RenameCategoryModal } from "./folder/RenameCategoryModal";
import type {
	Folder,
	WorkbenchItem,
	WorkbenchSettings,
} from "./types";

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
const ExtensionIntroModal = lazy(() =>
	import("./ExtensionIntroModal").then((m) => ({
		default: m.ExtensionIntroModal,
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

export interface WorkbenchModalsProps {
	// Data
	folders: Folder[];
	unclassified: WorkbenchItem[];
	settings: WorkbenchSettings;
	activeCategory: string;
	dynamicCategories: string[];
	isUnclassified: boolean;

	// Modal states
	folderModalState: FolderModalState;
	closeFolderModal: () => void;
	addLinkFolder: Folder | null;
	closeAddLinkModal: () => void;
	isSyncModalOpen: boolean;
	setIsSyncModalOpen: (open: boolean) => void;
	isAIClassifyModalOpen: boolean;
	setIsAIClassifyModalOpen: (open: boolean) => void;
	isSettingsModalOpen: boolean;
	setIsSettingsModalOpen: (open: boolean) => void;
	isDeadLinksModalOpen: boolean;
	setIsDeadLinksModalOpen: (open: boolean) => void;
	isIntroModalOpen: boolean;
	setIsIntroModalOpen: (open: boolean) => void;
	isRenameCategoryOpen: boolean;
	setIsRenameCategoryOpen: (open: boolean) => void;

	// Confirm dialog states
	folderPendingDelete: Folder | null;
	setFolderPendingDelete: (folder: Folder | null) => void;
	itemPendingDelete: {
		item: WorkbenchItem;
		folderId: number | null;
	} | null;
	setItemPendingDelete: (
		target: { item: WorkbenchItem; folderId: number | null } | null,
	) => void;

	// Operations
	handleSaveFolder: (data: SaveFolderPayload) => Promise<void>;
	handleDeleteFolder: (id: number) => Promise<void>;
	handleAddLink: (
		folderId: number,
		data: { url: string; title?: string; description?: string },
	) => Promise<void>;
	handleRenameCategory: (oldCategory: string, newCategory: string) => Promise<void>;
	handleClassificationComplete: (
		updatedFolders: Folder[],
		updatedUnclassified: WorkbenchItem[],
	) => void;
	handleBookmarksImported: (
		newUnclassified: WorkbenchItem[],
		onTriggerAI?: () => void,
	) => void;
	handleDeleteUnclassifiedItem: (item: WorkbenchItem) => Promise<void>;
	handleDeleteItemFromFolder: (
		item: WorkbenchItem,
		folderId: number,
	) => Promise<void>;
	setSettings: (settings: WorkbenchSettings) => void;
	reloadFromDb: () => Promise<void>;
}

/**
 * Aggregator component managing all lazy-loaded dialogs, setup wizard and confirm modals.
 */
export function WorkbenchModals({
	folders,
	unclassified,
	settings,
	activeCategory,
	dynamicCategories,
	isUnclassified,
	folderModalState,
	closeFolderModal,
	addLinkFolder,
	closeAddLinkModal,
	isSyncModalOpen,
	setIsSyncModalOpen,
	isAIClassifyModalOpen,
	setIsAIClassifyModalOpen,
	isSettingsModalOpen,
	setIsSettingsModalOpen,
	isDeadLinksModalOpen,
	setIsDeadLinksModalOpen,
	isIntroModalOpen,
	setIsIntroModalOpen,
	isRenameCategoryOpen,
	setIsRenameCategoryOpen,
	folderPendingDelete,
	setFolderPendingDelete,
	itemPendingDelete,
	setItemPendingDelete,
	handleSaveFolder,
	handleDeleteFolder,
	handleAddLink,
	handleRenameCategory,
	handleClassificationComplete,
	handleBookmarksImported,
	handleDeleteUnclassifiedItem,
	handleDeleteItemFromFolder,
	setSettings,
	reloadFromDb,
}: WorkbenchModalsProps) {
	return (
		<>
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

				{isIntroModalOpen && (
					<ExtensionIntroModal
						isOpen={isIntroModalOpen}
						onClose={() => setIsIntroModalOpen(false)}
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
		</>
	);
}
