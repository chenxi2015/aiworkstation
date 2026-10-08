import { DeleteEntryDialog } from "../DeleteEntryDialog";
import { DirectoryPickerModal } from "../DirectoryPickerModal";
import { MoveEntryModal } from "../MoveEntryModal";
import { TreeContextMenu, type TreeMenuTarget } from "../TreeContextMenu";
import type { ObsidianTreeNode } from "../types";

export interface ObsidianModalsProps {
	menu: TreeMenuTarget | null;
	onCloseMenu: () => void;
	onCreateNote: (dir?: string) => void;
	onCreateFolder: (dir?: string) => void;
	onCreateCanvas?: (dir?: string) => void;
	onCreateExcalidraw?: (dir?: string) => void;
	onMove?: (node: ObsidianTreeNode) => void;
	onRename: (node: ObsidianTreeNode) => void;
	onDelete: (node: ObsidianTreeNode) => void;
	onCopyPath: (node: ObsidianTreeNode) => void;
	onReveal: (node: ObsidianTreeNode) => void;
	deleteTarget: ObsidianTreeNode | null;
	onCloseDeleteTarget: () => void;
	onConfirmDelete: () => Promise<void>;
	moveTarget: ObsidianTreeNode | null;
	treeNodes: ObsidianTreeNode[];
	onCloseMoveTarget: () => void;
	onConfirmMove: (
		sourceRelPath: string,
		targetDir: string,
	) => Promise<void> | void;
	pickerOpen: boolean;
	initialPickerPath?: string;
	onSelectPickerPath: (path: string) => void;
	onClosePicker: () => void;
}

/**
 * Global modal manager for Obsidian tree context menu, move dialog, delete confirmation dialog, and directory picker.
 */
export function ObsidianModals({
	menu,
	onCloseMenu,
	onCreateNote,
	onCreateFolder,
	onCreateCanvas,
	onCreateExcalidraw,
	onMove,
	onRename,
	onDelete,
	onCopyPath,
	onReveal,
	deleteTarget,
	onCloseDeleteTarget,
	onConfirmDelete,
	moveTarget,
	treeNodes,
	onCloseMoveTarget,
	onConfirmMove,
	pickerOpen,
	initialPickerPath,
	onSelectPickerPath,
	onClosePicker,
}: ObsidianModalsProps) {
	return (
		<>
			<TreeContextMenu
				target={menu}
				onClose={onCloseMenu}
				onCreateNote={(dir) => void onCreateNote(dir)}
				onCreateFolder={(dir) => void onCreateFolder(dir)}
				onCreateCanvas={(dir) => void onCreateCanvas?.(dir)}
				onCreateExcalidraw={
					onCreateExcalidraw ? (dir) => void onCreateExcalidraw(dir) : undefined
				}
				onMove={onMove}
				onRename={onRename}
				onDelete={onDelete}
				onCopyPath={onCopyPath}
				onReveal={(node) => void onReveal(node)}
			/>
			<DeleteEntryDialog
				target={deleteTarget}
				onClose={onCloseDeleteTarget}
				onConfirm={onConfirmDelete}
			/>
			{moveTarget && (
				<MoveEntryModal
					target={moveTarget}
					tree={treeNodes}
					onClose={onCloseMoveTarget}
					onConfirmMove={onConfirmMove}
				/>
			)}
			{pickerOpen && (
				<DirectoryPickerModal
					initialPath={initialPickerPath}
					onSelect={onSelectPickerPath}
					onClose={onClosePicker}
				/>
			)}
		</>
	);
}
