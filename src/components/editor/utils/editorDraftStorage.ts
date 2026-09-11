import { createStore, del, get, set } from "idb-keyval";

export interface DocumentDraft {
	docId: number;
	content: string;
	contentText: string;
	title?: string;
	updatedAt: number;
}

// Dedicated IndexedDB store for document drafts
const draftStore = createStore("aiworkstation_editor_db", "document_drafts");

/**
 * Save draft content to IndexedDB
 */
export async function saveDocDraft(draft: DocumentDraft): Promise<void> {
	try {
		await set(`draft:${draft.docId}`, draft, draftStore);
	} catch (err) {
		console.warn("[editorDraftStorage] Failed to save draft:", err);
	}
}

/**
 * Retrieve cached draft from IndexedDB
 */
export async function getDocDraft(
	docId: number,
): Promise<DocumentDraft | null> {
	try {
		const draft = await get<DocumentDraft>(`draft:${docId}`, draftStore);
		return draft ?? null;
	} catch (err) {
		console.warn("[editorDraftStorage] Failed to get draft:", err);
		return null;
	}
}

/**
 * Remove draft from IndexedDB once synced or discarded
 */
export async function clearDocDraft(docId: number): Promise<void> {
	try {
		await del(`draft:${docId}`, draftStore);
	} catch (err) {
		console.warn("[editorDraftStorage] Failed to clear draft:", err);
	}
}
