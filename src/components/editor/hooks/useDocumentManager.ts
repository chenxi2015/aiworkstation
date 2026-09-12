import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getWorkbenchSettings } from "../../../server/functions/workbench";
import {
	createDocumentRpc,
	deleteDocumentRpc,
	fetchDocuments,
	generateAiBarTextRpc,
	snapshotVersionRpc,
	updateDocumentRpc,
} from "../../../services/api/editorClient";
import { workbenchContextActions } from "../../../stores/workbenchContextStore";
import {
	DEFAULT_STYLE_PRESETS,
	type EditorDocument,
	type EditorStylePreset,
} from "../types";
import {
	clearDocDraft,
	getDocDraft,
	markDocDraftSynced,
	saveDocDraft,
} from "../utils/editorDraftStorage";

export type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

/** Autosave debounce delay in milliseconds */
const AUTOSAVE_DELAY = 800;

export interface UseDocumentManagerReturn {
	documents: EditorDocument[];
	loading: boolean;
	activeId: number | null;
	activeDoc: EditorDocument | null;
	saveState: SaveState;
	savedAt: string | null;
	contentText: string;
	stylePresets: EditorStylePreset[];
	setStylePresets: React.Dispatch<React.SetStateAction<EditorStylePreset[]>>;
	switchDocument: (nextId: number | null) => Promise<void>;
	handleCreate: () => Promise<EditorDocument>;
	handleDelete: (docId: number, deleteLocalAssets?: boolean) => Promise<void>;
	handleEditorChange: (contentJson: string, text: string) => void;
	handleTitleChange: (title: string) => void;
	handleStylePresetChange: (stylePreset: string) => void;
	handleStatusChange: (status: EditorDocument["status"]) => Promise<void>;
	handleSnapshot: (note?: string) => Promise<void>;
	handleBeforeAiApply: () => Promise<void>;
	handleAiGenerate: (prompt: string) => Promise<string>;
	handleInsertNewDocument: (title: string) => Promise<EditorDocument>;
	reloadDocuments: () => Promise<EditorDocument[]>;
	flushSave: () => Promise<void>;
}

export function useDocumentManager(): UseDocumentManagerReturn {
	const [documents, setDocuments] = useState<EditorDocument[]>([]);
	const [loading, setLoading] = useState(true);
	const [activeId, setActiveId] = useState<number | null>(null);
	const [saveState, setSaveState] = useState<SaveState>("idle");
	const [savedAt, setSavedAt] = useState<string | null>(null);
	const [contentText, setContentText] = useState("");
	const [stylePresets, setStylePresets] = useState<EditorStylePreset[]>(
		DEFAULT_STYLE_PRESETS,
	);

	const activeDoc = useMemo(
		() => documents.find((d) => d.id === activeId) ?? null,
		[documents, activeId],
	);

	/** Pending dirty data within the debounce window */
	const pendingRef = useRef<{
		title?: string;
		content?: string;
		contentText?: string;
		stylePreset?: string;
	} | null>(null);
	const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const activeIdRef = useRef<number | null>(null);
	activeIdRef.current = activeId;

	const flushSave = useCallback(async () => {
		const id = activeIdRef.current;
		const pending = pendingRef.current;
		if (!id || !pending) return;
		pendingRef.current = null;
		setSaveState("saving");
		try {
			await updateDocumentRpc({ id, ...pending });
			setSaveState("saved");
			setSavedAt(new Date().toISOString());
			// Mark local IndexedDB draft as synced with backend database
			void markDocDraftSynced(id);
			setDocuments((prev) =>
				prev.map((d) =>
					d.id === id
						? {
								...d,
								title: pending.title ?? d.title,
								content: pending.content ?? d.content,
								contentText: pending.contentText ?? d.contentText,
								stylePreset: pending.stylePreset ?? d.stylePreset,
								updatedAt: new Date().toISOString(),
							}
						: d,
				),
			);
		} catch (err) {
			console.warn("[useDocumentManager] autosave error:", err);
			setSaveState("error");
		}
	}, []);

	const scheduleSave = useCallback(() => {
		setSaveState("dirty");
		if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
		saveTimerRef.current = setTimeout(flushSave, AUTOSAVE_DELAY);
	}, [flushSave]);

	/** Instant non-blocking document switch with background save */
	const switchDocument = useCallback(
		async (nextId: number | null) => {
			if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
			// Flush pending changes in background without blocking UI thread
			void flushSave();
			setActiveId(nextId);
			setSaveState("idle");
			setContentText("");

			if (nextId != null) {
				const target = documents.find((d) => d.id === nextId);
				if (target) {
					workbenchContextActions.setActiveDocument({
						id: target.id,
						title: target.title,
					});
				}
			} else {
				workbenchContextActions.setActiveDocument(null);
			}
		},
		[flushSave, documents],
	);

	// Synchronize activeDoc to global workbench context store
	useEffect(() => {
		if (activeDoc) {
			workbenchContextActions.setActiveDocument({
				id: activeDoc.id,
				title: activeDoc.title,
			});
		} else if (!loading) {
			workbenchContextActions.setActiveDocument(null);
		}
	}, [activeDoc, loading]);

	const reloadDocuments = useCallback(async () => {
		const docs = await fetchDocuments();
		setDocuments(docs);
		return docs;
	}, []);

	// Initial data loading
	useEffect(() => {
		(async () => {
			const docs = await fetchDocuments();
			// Check if there are unsynced local drafts in IndexedDB
			const mergedDocs = await Promise.all(
				docs.map(async (doc) => {
					try {
						const draft = await getDocDraft(doc.id);
						const remoteTime = doc.updatedAt
							? new Date(doc.updatedAt).getTime()
							: 0;
						if (draft && draft.updatedAt > remoteTime && draft.content) {
							return {
								...doc,
								content: draft.content,
								contentText: draft.contentText ?? doc.contentText,
							};
						}
					} catch {
						// Fallback to remote doc if draft read fails
					}
					return doc;
				}),
			);
			setDocuments(mergedDocs);
			setLoading(false);
			setActiveId((prev) => prev ?? mergedDocs[0]?.id ?? null);

			// Populate local IndexedDB cache for loaded documents
			for (const doc of mergedDocs) {
				void getDocDraft(doc.id).then((existing) => {
					if (!existing) {
						void saveDocDraft({
							docId: doc.id,
							title: doc.title,
							content: doc.content,
							contentText: doc.contentText,
							updatedAt: doc.updatedAt
								? new Date(doc.updatedAt).getTime()
								: Date.now(),
							synced: true,
						});
					}
				});
			}

			try {
				const settings = await getWorkbenchSettings();
				if (
					settings?.editorStylePresets &&
					Array.isArray(settings.editorStylePresets) &&
					settings.editorStylePresets.length > 0
				) {
					const customMap = new Map(
						settings.editorStylePresets.map((p) => [p.id, p]),
					);
					const merged: EditorStylePreset[] = DEFAULT_STYLE_PRESETS.map(
						(defaultPreset) => {
							const custom = customMap.get(defaultPreset.id);
							if (custom) {
								customMap.delete(defaultPreset.id);
								return { ...defaultPreset, ...custom };
							}
							return defaultPreset;
						},
					);
					for (const extra of customMap.values()) {
						merged.push(extra);
					}
					setStylePresets(merged);
				}
			} catch (err) {
				console.warn(
					"[useDocumentManager] Failed to load editor style presets:",
					err,
				);
			}
		})();
	}, []);

	// Save draft before page unloads
	useEffect(() => {
		const handleBeforeUnload = () => {
			const id = activeIdRef.current;
			const pending = pendingRef.current;
			if (id && pending?.content) {
				void saveDocDraft({
					docId: id,
					content: pending.content,
					contentText: pending.contentText ?? "",
					updatedAt: Date.now(),
				});
			}
		};
		window.addEventListener("beforeunload", handleBeforeUnload);
		return () => {
			window.removeEventListener("beforeunload", handleBeforeUnload);
		};
	}, []);

	// Flush save on unmount
	useEffect(() => {
		return () => {
			if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
			void flushSave();
		};
	}, [flushSave]);

	const handleCreate = useCallback(async () => {
		await switchDocument(null);
		const doc = await createDocumentRpc({});
		setDocuments((prev) => [doc, ...prev]);
		setActiveId(doc.id);
		setSaveState("idle");
		return doc;
	}, [switchDocument]);

	const handleInsertNewDocument = useCallback(
		async (title: string) => {
			await switchDocument(null);
			const doc = await createDocumentRpc({ title: title || "导入文档" });
			setDocuments((prev) => [doc, ...prev]);
			setActiveId(doc.id);
			setSaveState("idle");
			return doc;
		},
		[switchDocument],
	);

	const handleDelete = useCallback(
		async (docId: number, deleteLocalAssets = false) => {
			await deleteDocumentRpc(docId, deleteLocalAssets);
			void clearDocDraft(docId);
			setDocuments((prev) => {
				const next = prev.filter((d) => d.id !== docId);
				if (activeIdRef.current === docId) {
					setActiveId(next[0]?.id ?? null);
				}
				return next;
			});
		},
		[],
	);

	const handleEditorChange = useCallback(
		(contentJson: string, text: string) => {
			pendingRef.current = {
				...pendingRef.current,
				content: contentJson,
				contentText: text,
			};
			setContentText(text);

			const currentId = activeIdRef.current;
			if (currentId) {
				void saveDocDraft({
					docId: currentId,
					content: contentJson,
					contentText: text,
					updatedAt: Date.now(),
					synced: false,
				});
			}

			scheduleSave();
		},
		[scheduleSave],
	);

	const handleTitleChange = useCallback(
		(title: string) => {
			pendingRef.current = { ...pendingRef.current, title };
			setDocuments((prev) =>
				prev.map((d) => (d.id === activeIdRef.current ? { ...d, title } : d)),
			);

			const currentId = activeIdRef.current;
			if (currentId) {
				workbenchContextActions.setActiveDocument({
					id: currentId,
					title,
				});
			}
			if (currentId && pendingRef.current?.content) {
				void saveDocDraft({
					docId: currentId,
					title,
					content: pendingRef.current.content,
					contentText: pendingRef.current.contentText ?? "",
					updatedAt: Date.now(),
					synced: false,
				});
			}

			scheduleSave();
		},
		[scheduleSave],
	);

	const handleStylePresetChange = useCallback(
		(stylePreset: string) => {
			pendingRef.current = { ...pendingRef.current, stylePreset };
			setDocuments((prev) =>
				prev.map((d) =>
					d.id === activeIdRef.current ? { ...d, stylePreset } : d,
				),
			);
			scheduleSave();
		},
		[scheduleSave],
	);

	const handleStatusChange = useCallback(
		async (status: EditorDocument["status"]) => {
			const id = activeIdRef.current;
			if (!id) return;
			await flushSave();
			await updateDocumentRpc({ id, status });
			setDocuments((prev) =>
				prev.map((d) => (d.id === id ? { ...d, status } : d)),
			);
		},
		[flushSave],
	);

	const handleSnapshot = useCallback(
		async (note = "手动存档") => {
			const id = activeIdRef.current;
			if (!id) return;
			await flushSave();
			await snapshotVersionRpc({
				documentId: id,
				origin: "human",
				note,
			});
		},
		[flushSave],
	);

	const handleBeforeAiApply = useCallback(async () => {
		const id = activeIdRef.current;
		if (!id) return;
		await flushSave();
		await snapshotVersionRpc({
			documentId: id,
			origin: "ai",
			note: "AI 改写前自动备份",
		});
	}, [flushSave]);

	const handleAiGenerate = useCallback(
		async (prompt: string): Promise<string> => {
			return generateAiBarTextRpc(prompt, undefined, activeDoc?.stylePreset);
		},
		[activeDoc?.stylePreset],
	);

	return {
		documents,
		loading,
		activeId,
		activeDoc,
		saveState,
		savedAt,
		contentText,
		stylePresets,
		setStylePresets,
		switchDocument,
		handleCreate,
		handleDelete,
		handleEditorChange,
		handleTitleChange,
		handleStylePresetChange,
		handleStatusChange,
		handleSnapshot,
		handleBeforeAiApply,
		handleAiGenerate,
		handleInsertNewDocument,
		reloadDocuments,
		flushSave,
	};
}
