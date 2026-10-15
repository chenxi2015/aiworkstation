import {
	discardDraft,
	getDraftPreview,
	saveDraftAsDocument,
	saveDraftAsNote,
} from "../../server/functions/drafts";

export interface DraftPreviewResult {
	exists: boolean;
	status: "pending" | "archived" | "expired";
	title: string;
	content: string;
	wordCount: number;
	createdAt: string;
	kind?: "article" | "excalidraw" | "canvas";
	archivedTo?: {
		kind: "document" | "note";
		ref: string;
	};
}

export async function getDraftPreviewRpc(
	draftId: string,
): Promise<DraftPreviewResult> {
	return await getDraftPreview({ data: { draftId } });
}

export async function saveDraftAsDocumentRpc(params: {
	draftId: string;
	folderId?: number | null;
}): Promise<{ documentId: number; title: string }> {
	return await saveDraftAsDocument({ data: params });
}

export async function saveDraftAsNoteRpc(params: {
	draftId: string;
	dirRelPath?: string;
}): Promise<{ relPath: string; title: string }> {
	return await saveDraftAsNote({ data: params });
}

export async function discardDraftRpc(
	draftId: string,
): Promise<{ success: boolean }> {
	return await discardDraft({ data: { draftId } });
}
