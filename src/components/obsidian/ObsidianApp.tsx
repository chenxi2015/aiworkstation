import { toast } from "@heroui/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useCloudAuth } from "../../lib/cloud/useCloudAuth";
import type { NavLayoutEntry } from "../../modules/registry";
import { saveSettingsAsync } from "../../services/storage/settingsStorage";
import { ModulePaywall } from "../cloud/ModulePaywall";
import {
	ObsidianNoteCanvasSkeleton,
	ObsidianTreeSkeleton,
} from "../workbench/skeletons";
import type { Folder, WorkbenchSettings } from "../workbench/types";
import { ObsidianContent } from "./components/ObsidianContent";
import { ObsidianModals } from "./components/ObsidianModals";
import { ObsidianSidebar } from "./components/ObsidianSidebar";
import { useNoteHistory } from "./hooks/useNoteHistory";
import { useObsidianAiBridge } from "./hooks/useObsidianAiBridge";
import { useSidebarResize } from "./hooks/useSidebarResize";
import { useVaultOperations } from "./hooks/useVaultOperations";
import { useVaultTreeState } from "./hooks/useVaultTreeState";
import { clearWikilinkCaches } from "./markdown/wikilink";
import type { ObsidianNoteApi } from "./types";

export interface ObsidianAppProps {
	unclassifiedCount: number;
	navLayout?: NavLayoutEntry[];
	folders: Folder[];
	settings: WorkbenchSettings;
	/** Deep-link: directly open this note on load (relative path to vault root) */
	initialNotePath?: string;
	onNoteChange?: (path: string | null) => void;
}

/**
 * Obsidian Module Container: coordinates state hooks and modular presenters.
 * Vault directory is the single source of truth; notes read/write directly as Markdown files.
 */
export function ObsidianApp({
	unclassifiedCount: _unclassifiedCount,
	navLayout: _navLayout,
	folders: _folders,
	settings,
	initialNotePath,
	onNoteChange,
}: ObsidianAppProps) {
	const { isMember } = useCloudAuth();
	const { sidebarWidth, handleSidebarResizeStart } = useSidebarResize();

	// 1. Navigation history state
	const {
		selectedNotePath,
		openNote,
		goBack,
		goForward,
		canGoBack,
		canGoForward,
		clearNoteHistory,
		remapNoteHistory,
		removeCurrentNote,
		handleNoteRenamed,
		removeAffectedHistory,
	} = useNoteHistory({ initialNotePath, onNoteChange });

	// 2. Vault tree & search state
	const {
		treeData,
		loading,
		refreshing,
		load,
		query,
		handleQueryChange,
		currentDir,
		setCurrentDir,
		expanded,
		setExpanded,
		effectiveExpanded,
		toggleFolder,
		expandDirChain,
		handleToggleExpandAll,
		handleSelectFolder,
		resetTreeSelection,
		filteredTree,
		autoReveal,
		handleToggleAutoReveal,
	} = useVaultTreeState({ selectedNotePath, enabled: isMember });

	// 3. Vault file/folder operations & context menu
	const {
		renamingPath,
		setRenamingPath,
		menu,
		deleteTarget,
		setDeleteTarget,
		handleCreateNote,
		handleCreateNoteFromLink,
		handleCreateFolder,
		handleCreateCanvas,
		handleRenameCommit,
		performDeleteEntry,
		handleDeleteEntry,
		handleCopyPath,
		handleRevealEntry,
		handleOpenMenu,
		handleCloseMenu,
		handleStartRename,
	} = useVaultOperations({
		treeData,
		currentDir,
		selectedNotePath,
		load,
		expandDirChain,
		openNote,
		remapNoteHistory,
		removeAffectedHistory,
		setCurrentDir,
		setExpanded,
	});

	// 4. Global AI sidebar bridge
	const noteApiRef = useRef<ObsidianNoteApi | null>(null);
	const handleRegisterNoteApi = useCallback((api: ObsidianNoteApi | null) => {
		noteApiRef.current = api;
	}, []);
	useObsidianAiBridge({
		noteApiRef,
		selectedNotePath,
		onCreateCanvas: handleCreateCanvas,
	});

	// 5. Vault directory configuration & switcher
	const [pickerOpen, setPickerOpen] = useState(false);
	const [currentSettings, setCurrentSettings] = useState(settings);

	useEffect(() => {
		setCurrentSettings(settings);
	}, [settings]);

	const handleSaveVaultDir = useCallback(
		async (path: string) => {
			const next = path.trim();
			const updated = {
				...currentSettings,
				obsidianVaultDir: next || undefined,
			};
			setCurrentSettings(updated);
			clearNoteHistory();
			clearWikilinkCaches();
			resetTreeSelection();
			toast.success("Vault 路径已保存，正在重新扫描");
			await saveSettingsAsync(updated);
			await load(true, next || undefined);
		},
		[currentSettings, load, clearNoteHistory, resetTreeSelection],
	);

	const handleApplyVaultSettings = useCallback(
		async (next: WorkbenchSettings, rescan: boolean) => {
			setCurrentSettings(next);
			await saveSettingsAsync(next);
			if (!rescan) return;
			clearNoteHistory();
			clearWikilinkCaches();
			resetTreeSelection();
			await load(true, next.obsidianVaultDir);
		},
		[load, clearNoteHistory, resetTreeSelection],
	);

	const vault = treeData?.vault;
	const vaultMissing = treeData !== null && !vault?.exists;

	return (
		<div className="h-full bg-surface dark:bg-background text-foreground flex flex-col overflow-hidden">
			{!isMember ? (
				<ModulePaywall
					moduleName="笔记"
					description="开通工作台会员，即可解锁本地 Obsidian Vault 直连、双链图谱与 Markdown 知识库深度管理"
				/>
			) : loading ? (
				<div className="flex-1 flex overflow-hidden min-h-0">
					<ObsidianTreeSkeleton width={sidebarWidth} />
					<ObsidianNoteCanvasSkeleton />
				</div>
			) : (
				<div className="flex-1 flex overflow-hidden">
					<ObsidianSidebar
						sidebarWidth={sidebarWidth}
						onSidebarResizeStart={handleSidebarResizeStart}
						query={query}
						onQueryChange={handleQueryChange}
						vaultExists={!!vault?.exists}
						onCreateNote={() => void handleCreateNote()}
						onCreateFolder={() => void handleCreateFolder()}
						onCreateCanvas={() => void handleCreateCanvas()}
						onRefresh={() => load(true)}
						refreshing={refreshing}
						anyExpanded={expanded.size > 0}
						onToggleExpandAll={handleToggleExpandAll}
						autoReveal={autoReveal}
						onToggleAutoReveal={handleToggleAutoReveal}
						filteredTree={filteredTree}
						selectedNotePath={selectedNotePath}
						currentDir={currentDir}
						effectiveExpanded={effectiveExpanded}
						renamingPath={renamingPath}
						onToggleFolder={toggleFolder}
						onSelectFolder={setCurrentDir}
						onSelectNote={openNote}
						onOpenMenu={handleOpenMenu}
						onRenameCommit={(p, name, isFolder) =>
							void handleRenameCommit(p, name, isFolder)
						}
						onRenameCancel={() => setRenamingPath(null)}
						onClearCurrentDir={() => setCurrentDir("")}
						vaultMissing={vaultMissing}
						settings={currentSettings}
						vault={vault}
						scannedAt={treeData?.scannedAt}
						onApplyVaultSettings={handleApplyVaultSettings}
					/>

					<ObsidianContent
						vaultMissing={vaultMissing}
						vault={vault}
						selectedNotePath={selectedNotePath}
						settings={currentSettings}
						onOpenPicker={() => setPickerOpen(true)}
						onSaveVaultDir={handleSaveVaultDir}
						onMutated={() => load(true)}
						onRenamed={handleNoteRenamed}
						onDeleted={removeCurrentNote}
						onRegisterNoteApi={handleRegisterNoteApi}
						onNavigateNote={openNote}
						onCreateNoteFromLink={(name) => void handleCreateNoteFromLink(name)}
						canGoBack={canGoBack}
						canGoForward={canGoForward}
						onBack={goBack}
						onForward={goForward}
						onSelectFolder={handleSelectFolder}
					/>
				</div>
			)}

			<ObsidianModals
				menu={menu}
				onCloseMenu={handleCloseMenu}
				onCreateNote={handleCreateNote}
				onCreateFolder={handleCreateFolder}
				onCreateCanvas={handleCreateCanvas}
				onRename={handleStartRename}
				onDelete={handleDeleteEntry}
				onCopyPath={handleCopyPath}
				onReveal={handleRevealEntry}
				deleteTarget={deleteTarget}
				onCloseDeleteTarget={() => setDeleteTarget(null)}
				onConfirmDelete={async () => {
					if (deleteTarget) await performDeleteEntry(deleteTarget);
				}}
				pickerOpen={pickerOpen}
				initialPickerPath={currentSettings.obsidianVaultDir}
				onSelectPickerPath={(path) => {
					setPickerOpen(false);
					handleSaveVaultDir(path);
				}}
				onClosePicker={() => setPickerOpen(false)}
			/>
		</div>
	);
}
