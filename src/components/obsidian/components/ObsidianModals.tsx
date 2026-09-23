import { DeleteEntryDialog } from "../DeleteEntryDialog";
import { DirectoryPickerModal } from "../DirectoryPickerModal";
import { TreeContextMenu, type TreeMenuTarget } from "../TreeContextMenu";
import type { ObsidianTree } from "../types";

export interface ObsidianModalsProps {
	menu: TreeMenuTarget | null;
	onCloseMenu: () => void;
	onCreateNote: (dir?: string) => void;
	onCreateFolder: (dir?: string) => void;
	onCreateCanvas?: (dir?: string) => void;
	onRename: (node: ObsidianTree["tree"][number]) => void;
	onDelete: (node: ObsidianTree["tree"][number]) => void;
	onCopyPath: (node: ObsidianTree["tree"][number]) => void;
	onReveal: (node: ObsidianTree["tree"][number]) => void;
	deleteTarget: ObsidianTree["tree"][number] | null;
	onCloseDeleteTarget: () => void;
	onConfirmDelete: () => Promise<void>;
	pickerOpen: boolean;
	initialPickerPath?: string;
	onSelectPickerPath: (path: string) => void;
	onClosePicker: () => void;
}

/**
 * Global modal manager for Obsidian tree context menu, delete confirmation dialog, and directory picker.
 */
export function ObsidianModals({
	menu,
	onCloseMenu,
	onCreateNote,
	onCreateFolder,
	onCreateCanvas,
	onRename,
	onDelete,
	onCopyPath,
	onReveal,
	deleteTarget,
	onCloseDeleteTarget,
	onConfirmDelete,
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
