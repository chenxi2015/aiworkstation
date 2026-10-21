import type { EditorDocFolder, EditorDocument } from "../../types";

export const STATUS_LABELS: Record<EditorDocument["status"], string> = {
	editing: "编辑中",
	finalized: "已定稿",
	archived: "已归档",
};

export interface DocRowCommonProps {
	doc: EditorDocument;
	active: boolean;
	folderName: string | null;
	folders: EditorDocFolder[];
	onSelect: (id: number) => void;
	onDuplicate: (id: number) => Promise<void>;
	onTogglePin: (docId: number, pinned: boolean) => Promise<void>;
	onMoveDocument: (docId: number, folderId: number | null) => Promise<void>;
	onArchive: (docId: number) => Promise<void>;
	onRequestDelete: (doc: EditorDocument) => void;
}

