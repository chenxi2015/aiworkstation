import { useCallback, useState } from "react";
import type { Folder } from "../components/workbench/types";

export interface FolderModalState {
	isOpen: boolean;
	folder: Folder | null;
}

/**
 * Hook to manage modal open/close states across the workbench
 */
export function useWorkbenchModals() {
	const [folderModalState, setFolderModalState] = useState<FolderModalState>({
		isOpen: false,
		folder: null,
	});
	const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
	const [isAIClassifyModalOpen, setIsAIClassifyModalOpen] = useState(false);
	const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
	const [isGlobalSearchOpen, setIsGlobalSearchOpen] = useState(false);
	const [isChatModalOpen, setIsChatModalOpen] = useState(false);
	const [dossierFolder, setDossierFolder] = useState<Folder | null>(null);

	const openCreateFolderModal = useCallback(() => {
		setFolderModalState({ isOpen: true, folder: null });
	}, []);

	const openEditFolderModal = useCallback((folder: Folder) => {
		setFolderModalState({ isOpen: true, folder });
	}, []);

	const closeFolderModal = useCallback(() => {
		setFolderModalState({ isOpen: false, folder: null });
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
	};
}
