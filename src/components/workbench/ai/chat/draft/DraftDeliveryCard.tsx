import { memo } from "react";
import type { ChatDraftPayload } from "../../../../../hooks/ai/useChatMessages";
import { ConfirmDialog } from "../../../ConfirmDialog";
import { DraftArchivedCard } from "./DraftArchivedCard";
import { DraftExpiredCard } from "./DraftExpiredCard";
import { DraftFolderPickerModal } from "./DraftFolderPickerModal";
import { DraftPendingCard } from "./DraftPendingCard";
import { DraftPreviewModal } from "./DraftPreviewModal";
import { useDraftActions } from "./useDraftActions";

export interface DraftDeliveryCardProps {
	draft: ChatDraftPayload;
	onDraftStatusChange?: (updated: ChatDraftPayload) => void;
}

/**
 * Top-level delivery card container orchestrating draft state lifecycle,
 * preview inspection, destination archiving, and dialogs.
 */
export const DraftDeliveryCard = memo(function DraftDeliveryCard({
	draft,
	onDraftStatusChange,
}: DraftDeliveryCardProps) {
	const {
		status,
		archivedTo,
		isActionLoading,
		// Preview dialog
		isPreviewOpen,
		previewLoading,
		previewContent,
		handleOpenPreview,
		handleClosePreview,
		// Save actions
		handleSaveAsDocument,
		// Folder picker dialog
		isFolderPickerOpen,
		treeLoading,
		folderSearch,
		setFolderSearch,
		selectedDir,
		setSelectedDir,
		filteredFolders,
		handleOpenFolderPicker,
		handleCloseFolderPicker,
		handleConfirmSaveAsNote,
		// Discard
		isDiscardConfirmOpen,
		setIsDiscardConfirmOpen,
		handleDiscard,
		// Navigation
		handleNavigateToArchived,
	} = useDraftActions({ draft, onDraftStatusChange });

	// 1. Expired or discarded inert state
	if (status === "expired") {
		return <DraftExpiredCard draft={draft} />;
	}

	// 2. Archived inert state
	if (status === "archived") {
		return (
			<DraftArchivedCard
				draft={draft}
				archivedTo={archivedTo}
				onNavigate={handleNavigateToArchived}
			/>
		);
	}

	// 3. Pending interactive card
	return (
		<div className="flex justify-start my-1.5 w-full">
			<DraftPendingCard
				draft={draft}
				actionLoading={isActionLoading}
				onOpenPreview={handleOpenPreview}
				onSaveAsDocument={handleSaveAsDocument}
				onOpenFolderPicker={handleOpenFolderPicker}
				onDiscard={() => setIsDiscardConfirmOpen(true)}
			/>

			{/* Preview Dialog */}
			<DraftPreviewModal
				isOpen={isPreviewOpen}
				onClose={handleClosePreview}
				draft={draft}
				loading={previewLoading}
				content={previewContent}
			/>

			{/* Obsidian Folder Picker Dialog */}
			<DraftFolderPickerModal
				isOpen={isFolderPickerOpen}
				onClose={handleCloseFolderPicker}
				draft={draft}
				loading={treeLoading}
				actionLoading={isActionLoading}
				search={folderSearch}
				onSearchChange={setFolderSearch}
				folders={filteredFolders}
				selectedDir={selectedDir}
				onSelectDir={setSelectedDir}
				onConfirm={handleConfirmSaveAsNote}
			/>

			{/* Discard Confirmation Dialog */}
			<ConfirmDialog
				isOpen={isDiscardConfirmOpen}
				onOpenChange={setIsDiscardConfirmOpen}
				title="确认丢弃草稿"
				description={
					<span>
						确定要丢弃草稿{" "}
						<strong className="font-semibold text-foreground">
							《{draft.title}》
						</strong>
						吗？丢弃后草稿将被移入回收站。
					</span>
				}
				confirmLabel="确认丢弃"
				onConfirm={handleDiscard}
			/>
		</div>
	);
});
