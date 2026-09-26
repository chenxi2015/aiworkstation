import { toast } from "@heroui/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getWorkbenchSettings } from "../../../server/functions/workbench";
import {
	createDocumentFolderRpc,
	createDocumentRpc,
	deleteDocumentFolderRpc,
	deleteDocumentRpc,
	duplicateDocumentRpc,
	fetchDocumentFolders,
	fetchDocuments,
	generateAiBarTextRpc,
	moveDocumentToFolderRpc,
	renameDocumentFolderRpc,
	reorderDocumentFoldersRpc,
	reorderDocumentsRpc,
	snapshotVersionRpc,
	toggleDocumentPinnedRpc,
	updateDocumentRpc,
} from "../../../services/api/editorClient";
import { workbenchContextActions } from "../../../stores/workbenchContextStore";
import {
	DEFAULT_STYLE_PRESETS,
	type EditorDocFolder,
	type EditorDocument,
	type EditorStylePreset,
	MAX_DOC_CONTENT_CHARS,
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

/** 文件夹选中态："all" = 全部文档，否则为 document_folders.id */
export type ActiveFolderId = number | "all";

/** 与服务端 listDocuments 排序保持一致：置顶 → 手动排序 → 更新时间 → id */
function sortDocuments(list: EditorDocument[]): EditorDocument[] {
	return [...list].sort(
		(a, b) =>
			Number(b.pinned ?? false) - Number(a.pinned ?? false) ||
			(a.sortOrder ?? 0) - (b.sortOrder ?? 0) ||
			(b.updatedAt ?? "").localeCompare(a.updatedAt ?? "") ||
			b.id - a.id,
	);
}

export interface UseDocumentManagerReturn {
	documents: EditorDocument[];
	loading: boolean;
	docFolders: EditorDocFolder[];
	activeFolderId: ActiveFolderId;
	setActiveFolderId: (id: ActiveFolderId) => void;
	handleCreateFolder: (name?: string) => Promise<EditorDocFolder>;
	handleRenameFolder: (id: number, name: string) => Promise<void>;
	handleDeleteFolder: (id: number) => Promise<void>;
	handleReorderFolders: (orderedIds: number[]) => Promise<void>;
	handleMoveDocument: (docId: number, folderId: number | null) => Promise<void>;
	handleTogglePinned: (docId: number, pinned: boolean) => Promise<void>;
	handleReorderDocuments: (orderedIds: number[]) => Promise<void>;
	activeId: number | null;
	activeDoc: EditorDocument | null;
	saveState: SaveState;
	savedAt: string | null;
	contentText: string;
	stylePresets: EditorStylePreset[];
	setStylePresets: React.Dispatch<React.SetStateAction<EditorStylePreset[]>>;
	switchDocument: (nextId: number | null) => Promise<void>;
	handleCreate: () => Promise<EditorDocument>;
	handleDuplicate: (
		docId: number,
		options?: { activate?: boolean },
	) => Promise<EditorDocument>;
	handleDelete: (docId: number, deleteLocalAssets?: boolean) => Promise<void>;
	handleEditorChange: (contentJson: string, text: string) => void;
	handleTitleChange: (title: string) => void;
	handleStylePresetChange: (stylePreset: string) => void;
	handleStatusChange: (status: EditorDocument["status"]) => Promise<void>;
	handleArchive: (docId: number) => Promise<void>;
	handleSnapshot: (note?: string) => Promise<void>;
	handleBeforeAiApply: () => Promise<void>;
	handleAiGenerate: (prompt: string) => Promise<string>;
	handleInsertNewDocument: (
		title: string,
		options?: { activate?: boolean },
	) => Promise<EditorDocument>;
	reloadDocuments: () => Promise<EditorDocument[]>;
	flushSave: () => Promise<void>;
}

export function useDocumentManager(): UseDocumentManagerReturn {
	const [documents, setDocuments] = useState<EditorDocument[]>([]);
	const [loading, setLoading] = useState(true);
	const [docFolders, setDocFolders] = useState<EditorDocFolder[]>([]);
	const [activeFolderId, setActiveFolderId] = useState<ActiveFolderId>("all");
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

	const reloadFolders = useCallback(async () => {
		const folders = await fetchDocumentFolders();
		setDocFolders(folders);
		return folders;
	}, []);

	const handleCreateFolder = useCallback(async (name?: string) => {
		try {
			const folder = await createDocumentFolderRpc({ name });
			// 新文件夹置顶展示（服务端 sort_order 已保证，前端同步插到最前）
			setDocFolders((prev) => [folder, ...prev]);
			return folder;
		} catch (err) {
			toast.danger(
				`创建文件夹失败: ${err instanceof Error ? err.message : String(err)}`,
			);
			throw err;
		}
	}, []);

	const handleRenameFolder = useCallback(async (id: number, name: string) => {
		try {
			await renameDocumentFolderRpc(id, name);
			setDocFolders((prev) =>
				prev.map((f) => (f.id === id ? { ...f, name } : f)),
			);
		} catch (err) {
			toast.danger(
				`重命名文件夹失败: ${err instanceof Error ? err.message : String(err)}`,
			);
		}
	}, []);

	const handleDeleteFolder = useCallback(async (id: number) => {
		try {
			await deleteDocumentFolderRpc(id);
			setDocFolders((prev) => prev.filter((f) => f.id !== id));
			// 其中文档移回「全部」
			setDocuments((prev) =>
				prev.map((d) => (d.folderId === id ? { ...d, folderId: null } : d)),
			);
			setActiveFolderId((prev) => (prev === id ? "all" : prev));
		} catch (err) {
			toast.danger(
				`删除文件夹失败: ${err instanceof Error ? err.message : String(err)}`,
			);
		}
	}, []);

	const handleReorderFolders = useCallback(async (orderedIds: number[]) => {
		// 乐观更新本地顺序
		setDocFolders((prev) => {
			const byId = new Map(prev.map((f) => [f.id, f]));
			const next: EditorDocFolder[] = [];
			orderedIds.forEach((id, index) => {
				const folder = byId.get(id);
				if (folder) {
					byId.delete(id);
					next.push({ ...folder, sortOrder: index });
				}
			});
			return [...next, ...byId.values()];
		});
		try {
			await reorderDocumentFoldersRpc(orderedIds);
		} catch (err) {
			toast.danger(
				`文件夹排序保存失败: ${err instanceof Error ? err.message : String(err)}`,
			);
		}
	}, []);

	const handleMoveDocument = useCallback(
		async (docId: number, folderId: number | null) => {
			try {
				await moveDocumentToFolderRpc(docId, folderId);
				setDocuments((prev) =>
					sortDocuments(
						prev.map((d) => {
							if (d.id !== docId) return d;
							const siblings = prev.filter(
								(s) => (s.folderId ?? null) === folderId && s.id !== docId,
							);
							const minOrder = Math.min(
								0,
								...siblings.map((s) => s.sortOrder ?? 0),
							);
							return { ...d, folderId, sortOrder: minOrder - 1 };
						}),
					),
				);
				// 计数徽标依赖服务端统计，静默刷新
				void reloadFolders();
			} catch (err) {
				toast.danger(
					`移动文档失败: ${err instanceof Error ? err.message : String(err)}`,
				);
			}
		},
		[reloadFolders],
	);

	const handleTogglePinned = useCallback(
		async (docId: number, pinned: boolean) => {
			try {
				await toggleDocumentPinnedRpc(docId, pinned);
				setDocuments((prev) =>
					sortDocuments(
						prev.map((d) => {
							if (d.id !== docId) return d;
							// 与服务端一致：排到同组最前
							const siblings = prev.filter(
								(s) =>
									(s.folderId ?? null) === (d.folderId ?? null) &&
									s.id !== docId,
							);
							const minOrder = Math.min(
								0,
								...siblings.map((s) => s.sortOrder ?? 0),
							);
							return { ...d, pinned, sortOrder: minOrder - 1 };
						}),
					),
				);
			} catch (err) {
				toast.danger(
					`置顶操作失败: ${err instanceof Error ? err.message : String(err)}`,
				);
			}
		},
		[],
	);

	const handleReorderDocuments = useCallback(async (orderedIds: number[]) => {
		// 乐观更新：把 orderedIds 指定的新顺序物理落到数组位置上
		// （列表展示依赖数组顺序，仅改 sortOrder 字段会让拖拽后视觉回弹）
		setDocuments((prev) => {
			const orderMap = new Map(orderedIds.map((id, i) => [id, i]));
			const byId = new Map(prev.map((d) => [d.id, d]));
			let cursor = 0;
			return prev.map((d) => {
				if (!orderMap.has(d.id)) return d;
				const nextDoc = byId.get(orderedIds[cursor]);
				cursor += 1;
				return nextDoc
					? { ...nextDoc, sortOrder: orderMap.get(nextDoc.id) as number }
					: d;
			});
		});
		try {
			await reorderDocumentsRpc(orderedIds);
		} catch (err) {
			toast.danger(
				`文档排序保存失败: ${err instanceof Error ? err.message : String(err)}`,
			);
		}
	}, []);

	// Initial data loading
	useEffect(() => {
		(async () => {
			void reloadFolders();
			const docs = await fetchDocuments();
			// Check if there are unsynced local drafts in IndexedDB
			const mergedDocs = await Promise.all(
				docs.map(async (doc) => {
					try {
						const draft = await getDocDraft(doc.id);
						const remoteTime = doc.updatedAt
							? new Date(doc.updatedAt).getTime()
							: 0;
						if (
							draft?.content &&
							draft.content.length > MAX_DOC_CONTENT_CHARS
						) {
							console.warn(
								`[useDocumentManager] 文档 ${doc.id} 的本地草稿体积超限（${draft.content.length} 字符），跳过合并以防内存耗尽；建议清除该草稿`,
							);
							return doc;
						}
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

			// Warm up local draft cache only for active initial document to save I/O and memory
			const initialActiveDoc = mergedDocs[0];
			if (initialActiveDoc) {
				void getDocDraft(initialActiveDoc.id).then((existing) => {
					if (!existing) {
						void saveDocDraft({
							docId: initialActiveDoc.id,
							title: initialActiveDoc.title,
							content: initialActiveDoc.content,
							contentText: initialActiveDoc.contentText,
							updatedAt: initialActiveDoc.updatedAt
								? new Date(initialActiveDoc.updatedAt).getTime()
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
	}, [reloadFolders]);

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
		// 在文件夹视图下新建的文档直接落入该文件夹
		const folderId = activeFolderId === "all" ? null : activeFolderId;
		const doc = await createDocumentRpc({ folderId });
		setDocuments((prev) => [doc, ...prev]);
		setActiveId(doc.id);
		setSaveState("idle");
		void reloadFolders();
		return doc;
	}, [switchDocument, activeFolderId, reloadFolders]);

	const handleDuplicate = useCallback(
		async (docId: number, options?: { activate?: boolean }) => {
			if (activeIdRef.current === docId) {
				if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
				await flushSave();
			}
			const copy = await duplicateDocumentRpc(docId);
			setDocuments((prev) =>
				sortDocuments([copy, ...prev.filter((d) => d.id !== copy.id)]),
			);
			const activate = options?.activate ?? true;
			if (activate) {
				setActiveId(copy.id);
				setSaveState("idle");
				workbenchContextActions.setActiveDocument({
					id: copy.id,
					title: copy.title,
				});
			}
			void reloadFolders();
			return copy;
		},
		[flushSave, reloadFolders],
	);

	const handleInsertNewDocument = useCallback(
		async (title: string, options?: { activate?: boolean }) => {
			const activate = options?.activate ?? true;
			if (activate) {
				await switchDocument(null);
			}
			const doc = await createDocumentRpc({ title: title || "导入文档" });
			setDocuments((prev) => [doc, ...prev]);
			if (activate) {
				setActiveId(doc.id);
				setSaveState("idle");
			}
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

	/** 归档指定文档（docs/selfmedia-merge-plan.md：创作中 ⇄ 归档互斥，归档后从创作台列表消失） */
	const handleArchive = useCallback(
		async (docId: number) => {
			if (activeIdRef.current === docId) await flushSave();
			await updateDocumentRpc({ id: docId, status: "archived" });
			setDocuments((prev) => {
				const next = prev.filter((d) => d.id !== docId);
				if (activeIdRef.current === docId) {
					setActiveId(next[0]?.id ?? null);
				}
				return next;
			});
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
		docFolders,
		activeFolderId,
		setActiveFolderId,
		handleCreateFolder,
		handleRenameFolder,
		handleDeleteFolder,
		handleReorderFolders,
		handleMoveDocument,
		handleTogglePinned,
		handleReorderDocuments,
		activeId,
		activeDoc,
		saveState,
		savedAt,
		contentText,
		stylePresets,
		setStylePresets,
		switchDocument,
		handleCreate,
		handleDuplicate,
		handleDelete,
		handleEditorChange,
		handleTitleChange,
		handleStylePresetChange,
		handleStatusChange,
		handleArchive,
		handleSnapshot,
		handleBeforeAiApply,
		handleAiGenerate,
		handleInsertNewDocument,
		reloadDocuments,
		flushSave,
	};
}
