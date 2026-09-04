import { useCallback, useState } from "react";
import type { Folder } from "../components/workbench/types";

export interface FolderModalState {
	isOpen: boolean;
	folder: Folder | null;
	defaultParentId: number | null;
}

/**
 * Hook to manage modal open/close states across the workbench
 */
export function useWorkbenchModals() {
	const [folderModalState, setFolderModalState] = useState<FolderModalState>({
		isOpen: false,
		folder: null,
		defaultParentId: null,
	});
	const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
	const [isAIClassifyModalOpen, setIsAIClassifyModalOpen] = useState(false);
	const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
	const [isGlobalSearchOpen, setIsGlobalSearchOpen] = useState(false);
	const [isDeadLinksModalOpen, setIsDeadLinksModalOpen] = useState(false);
	const [isChatModalOpen, setIsChatModalOpen] = useState(false);
	const [dossierFolder, setDossierFolder] = useState<Folder | null>(null);
	const [addLinkFolder, setAddLinkFolder] = useState<Folder | null>(null);

	const openCreateFolderModal = useCallback((parentFolder?: Folder) => {
		setFolderModalState({
			isOpen: true,
			folder: null,
			defaultParentId: parentFolder?.id ?? null,
		});
	}, []);

	const openEditFolderModal = useCallback((folder: Folder) => {
		setFolderModalState({ isOpen: true, folder, defaultParentId: null });
	}, []);

	const closeFolderModal = useCallback(() => {
		setFolderModalState({ isOpen: false, folder: null, defaultParentId: null });
	}, []);

	const toggleGlobalSearch = useCallback(() => {
		setIsGlobalSearchOpen((prev) => !prev);
	}, []);

	const openDossierModal = useCallback((folder: Folder) => {
		setDossierFolder(folder);
	}, []);

	const closeDossierModal = useCallback(() => {
		setDossierFolder(null);
	}, []);

	const openAddLinkModal = useCallback((folder: Folder) => {
		setAddLinkFolder(folder);
	}, []);

	const closeAddLinkModal = useCallback(() => {
		setAddLinkFolder(null);
	}, []);

	return {
		// Folder modal
		folderModalState,
		setFolderModalState,
		openCreateFolderModal,
		openEditFolderModal,
		closeFolderModal,

		// Sync & AI modals
		isSyncModalOpen,
		setIsSyncModalOpen,
		isAIClassifyModalOpen,
		setIsAIClassifyModalOpen,

		// Settings modal
		isSettingsModalOpen,
		setIsSettingsModalOpen,

		// Dead links cleanup modal
		isDeadLinksModalOpen,
		setIsDeadLinksModalOpen,

		// Search & Chat modals
		isGlobalSearchOpen,
		setIsGlobalSearchOpen,
		toggleGlobalSearch,
		isChatModalOpen,
		setIsChatModalOpen,

		// Dossier modal
		dossierFolder,
		setDossierFolder,
		openDossierModal,
		closeDossierModal,

		// Add link modal
		addLinkFolder,
		openAddLinkModal,
		closeAddLinkModal,
	};
}
