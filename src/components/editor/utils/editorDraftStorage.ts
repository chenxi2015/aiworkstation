import { createStore, del, get, set } from "idb-keyval";

export interface DocumentDraft {
	docId: number;
	content: string;
	contentText: string;
	title?: string;
	updatedAt: number;
	synced?: boolean;
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
 * Mark a local draft as synced with backend database without deleting it
 */
export async function markDocDraftSynced(docId: number): Promise<void> {
	try {
		const existing = await get<DocumentDraft>(`draft:${docId}`, draftStore);
		if (existing) {
			await set(`draft:${docId}`, { ...existing, synced: true }, draftStore);
		}
	} catch (err) {
		console.warn("[editorDraftStorage] Failed to mark draft synced:", err);
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
 * Remove draft from IndexedDB only when document is permanently deleted
 */
export async function clearDocDraft(docId: number): Promise<void> {
	try {
		await del(`draft:${docId}`, draftStore);
	} catch (err) {
		console.warn("[editorDraftStorage] Failed to clear draft:", err);
	}
}
