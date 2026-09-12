import { useCallback, useEffect } from "react";
import { useGlobalShortcuts } from "../../../hooks/useGlobalShortcuts";
import { ExtensionBridgeService } from "../../../services/extensionBridge";
import { toast } from "@heroui/react";
import { useAiPanel } from "../../shell/AppShell";
import type { WorkbenchDragData } from "../dnd/WorkbenchDnd";
import type {
	Folder,
	WorkbenchItem,
	WorkbenchSettings,
} from "../types";

export interface UseWorkbenchAiBridgeOptions {
	folders: Folder[];
	dynamicCategories: string[];
	settings: WorkbenchSettings;
	selectedFolder: Folder | null;
	activeCategory: string;
	isUnclassified: boolean;
	gridFolders: Folder[];
	reloadFromDb: () => Promise<void>;
	handleNavigateFromSearch: (
		folderId: number | null,
		category?: string,
		targetItemId?: string | number,
	) => void;
	handleMoveItem: (
		item: WorkbenchItem,
		sourceFolderId: number | null,
		targetFolderId: number,
	) => void;
	handleMoveFolder: (folderId: number, targetParentId: number | null) => void;
	handleMoveFolderToCategory: (folderId: number, targetCategory: string) => void;
	handleReorderFolders: (orderedIds: number[]) => void;
	setIsIntroModalOpen: (open: boolean) => void;
}

/**
 * Hook to coordinate AI panel state, page bridge, shortcuts and extension invocations.
 */
export function useWorkbenchAiBridge({
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
}: UseWorkbenchAiBridgeOptions) {
	const aiPanel = useAiPanel();

	// Attach single bookmark item to AI chat context
	const handleAttachBookmarkToChat = useCallback(
		(item: WorkbenchItem) => {
			let host = "";
			if (item.url) {
				try {
					host = new URL(item.url).hostname;
				} catch {}
			}

			aiPanel.addContextItem({
				id: `bookmark_${item.id ?? Date.now()}`,
				type: "bookmark",
				title: item.name,
				subtitle: host || undefined,
				url: item.url,
				icon: item.favicon,
			});
		},
		[aiPanel],
	);

	// Attach dropped bookmark or folder to AI chat context
	const handleAttachToChat = useCallback(
		(data: WorkbenchDragData) => {
			if (data.kind === "item") {
				handleAttachBookmarkToChat(data.item);
			} else if (data.kind === "folder") {
				const folder = data.folder;
				const count = folder.items?.length ?? 0;
				aiPanel.addContextItem({
					id: `folder_${folder.id}`,
					type: "folder",
					title: folder.name,
					subtitle: `${count} 个书签`,
					folderId: folder.id,
					category: folder.category,
				});
			}
		},
		[handleAttachBookmarkToChat, aiPanel],
	);

	// Direct prompt dispatch to chat assistant in a new session
	const handleAskAIAboutFolder = useCallback(
		(prompt: string) => {
			aiPanel.sendPrompt(prompt, { newChat: true });
		},
		[aiPanel],
	);

	// Ask AI to summarize & review a specific folder from its card menu
	const handleAskAISummarizeFolder = useCallback(
		(folder: Folder) => {
			const count = folder.items?.length || 0;
			handleAskAIAboutFolder(
				`请深度总结与盘点「${folder.name}」文件夹中的 ${count} 个书签条目，分析核心亮点、适用场景与推荐使用工作流。`,
			);
		},
		[handleAskAIAboutFolder],
	);

	// Open AI search tab
	const handleOpenSearch = useCallback(() => {
		aiPanel.openSearchTab();
	}, [aiPanel]);

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
		// If extension is not installed or open failed, prompt via intro / download modal
		setIsIntroModalOpen(true);
	}, [setIsIntroModalOpen]);

	// Switch to Fast Search in Right Panel on Cmd+K
	useGlobalShortcuts({
		onToggleSearch: () => {
			aiPanel.openSearchTab();
		},
	});

	// Sync browsing scope (selected folder & active category) to AI panel
	useEffect(() => {
		aiPanel.setScope({
			selectedFolder: isUnclassified ? null : selectedFolder,
			activeCategory,
		});
		return () => aiPanel.setScope({ selectedFolder: null });
	}, [aiPanel, isUnclassified, selectedFolder, activeCategory]);

	// Sync active page data to AI panel; fallback to root data when unmounting
	useEffect(() => {
		aiPanel.setPageData({ folders, categories: dynamicCategories, settings });
		return () => aiPanel.setPageData(null);
	}, [aiPanel, folders, dynamicCategories, settings]);

	// Register page-level callbacks for database refresh and search result navigation
	useEffect(() => {
		aiPanel.registerDataChangedHandler(reloadFromDb);
		aiPanel.registerNavigateHandler(handleNavigateFromSearch);
		return () => {
			aiPanel.registerDataChangedHandler(null);
			aiPanel.registerNavigateHandler(null);
		};
	}, [aiPanel, reloadFromDb, handleNavigateFromSearch]);

	// Register DnD handlers to global DnD context
	useEffect(() => {
		aiPanel.registerDndHandlers({
			gridFolderIds: gridFolders.map((f) => f.id),
			onMoveItemToFolder: handleMoveItem,
			onMoveFolder: handleMoveFolder,
			onMoveFolderToCategory: handleMoveFolderToCategory,
			onReorderFolders: handleReorderFolders,
			onAttachToChat: handleAttachToChat,
		});
		return () => aiPanel.registerDndHandlers(null);
	}, [
		aiPanel,
		gridFolders,
		handleMoveItem,
		handleMoveFolder,
		handleMoveFolderToCategory,
		handleReorderFolders,
		handleAttachToChat,
	]);

	// Consume pending navigation queued from other modules via AI search
	useEffect(() => {
		const pending = aiPanel.consumePendingNavigation();
		if (pending) {
			handleNavigateFromSearch(
				pending.folderId,
				pending.category,
				pending.targetItemId ?? undefined,
			);
		}
	}, [aiPanel, handleNavigateFromSearch]);

	return {
		aiPanel,
		handleAttachBookmarkToChat,
		handleAttachToChat,
		handleAskAIAboutFolder,
		handleAskAISummarizeFolder,
		handleOpenSearch,
		handleOpenExtension,
	};
}
