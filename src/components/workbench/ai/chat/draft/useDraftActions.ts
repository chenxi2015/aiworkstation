import { toast } from "@heroui/react";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChatDraftPayload } from "../../../../../hooks/ai/useChatMessages";
import {
	discardDraftRpc,
	getDraftPreviewRpc,
	saveDraftAsDocumentRpc,
	saveDraftAsNoteRpc,
} from "../../../../../services/api/draftClient";
import {
	fetchObsidianTree,
	invalidateObsidianTreeCache,
} from "../../../../../services/api/obsidianClient";
import {
	collectAllFolders,
	type VaultFolderItem,
} from "../../../../obsidian/tree/vaultTreeUtils";
import type { ObsidianTreeNode } from "../../../../obsidian/types";

export interface UseDraftActionsOptions {
	draft: ChatDraftPayload;
	onDraftStatusChange?: (updated: ChatDraftPayload) => void;
}

/**
 * Custom hook encapsulating business logic, RPC operations,
 * and dialog states for a draft delivery item.
 */
export function useDraftActions({
	draft,
	onDraftStatusChange,
}: UseDraftActionsOptions) {
	const navigate = useNavigate();
	const [status, setStatus] = useState<"pending" | "archived" | "expired">(
		draft.status,
	);
	const [archivedTo, setArchivedTo] = useState(draft.archivedTo);

	// Preview state
	const [isPreviewOpen, setIsPreviewOpen] = useState(false);
	const [previewLoading, setPreviewLoading] = useState(false);
	const [previewContent, setPreviewContent] = useState("");

	// Note folder picker state
	const [isFolderPickerOpen, setIsFolderPickerOpen] = useState(false);
	const [vaultTree, setVaultTree] = useState<ObsidianTreeNode[]>([]);
	const [treeLoading, setTreeLoading] = useState(false);
	const [folderSearch, setFolderSearch] = useState("");
	const [selectedDir, setSelectedDir] = useState<string>("");

	// Action loading state
	const [isActionLoading, setIsActionLoading] = useState(false);
	const [isDiscardConfirmOpen, setIsDiscardConfirmOpen] = useState(false);

	const onDraftStatusChangeRef = useRef(onDraftStatusChange);
	onDraftStatusChangeRef.current = onDraftStatusChange;
	const draftRef = useRef(draft);
	draftRef.current = draft;
	const verifiedDraftIdRef = useRef<string | null>(null);

	// Sync or verify status once per draftId if pending
	useEffect(() => {
		if (draft.status !== "pending") return;
		if (verifiedDraftIdRef.current === draft.draftId) return;
		verifiedDraftIdRef.current = draft.draftId;

		let cancelled = false;
		getDraftPreviewRpc(draft.draftId)
			.then((res) => {
				if (cancelled) return;
				const currentDraft = draftRef.current;
				if (!res.exists || res.status === "expired") {
					setStatus("expired");
					onDraftStatusChangeRef.current?.({
						...currentDraft,
						status: "expired",
					});
				} else if (res.status === "archived") {
					setStatus("archived");
					setArchivedTo(res.archivedTo);
					onDraftStatusChangeRef.current?.({
						...currentDraft,
						status: "archived",
						archivedTo: res.archivedTo,
					});
				}
			})
			.catch(() => {
				// Retain optimistic state on network failure
			});

		return () => {
			cancelled = true;
		};
	}, [draft.draftId, draft.status]);

	// Open preview modal and load content
	const handleOpenPreview = useCallback(async () => {
		setIsPreviewOpen(true);
		setPreviewLoading(true);
		try {
			const res = await getDraftPreviewRpc(draft.draftId);
			if (!res.exists || res.status === "expired") {
				setStatus("expired");
				onDraftStatusChange?.({ ...draft, status: "expired" });
				toast.warning("该草稿已过期或已丢弃");
			} else {
				setPreviewContent(res.content);
			}
		} catch {
			toast.danger("加载草稿预览失败");
		} finally {
			setPreviewLoading(false);
		}
	}, [draft, onDraftStatusChange]);

	const handleClosePreview = useCallback(() => {
		setIsPreviewOpen(false);
	}, []);

	// Save draft as creator document
	const handleSaveAsDocument = useCallback(async () => {
		setIsActionLoading(true);
		try {
			const res = await saveDraftAsDocumentRpc({ draftId: draft.draftId });
			setStatus("archived");
			const target = { kind: "document" as const, ref: String(res.documentId) };
			setArchivedTo(target);
			onDraftStatusChange?.({
				...draft,
				status: "archived",
				archivedTo: target,
			});
			// Broadcast document update event
			window.dispatchEvent(
				new CustomEvent("editor:documents-changed", {
					detail: { documentId: res.documentId },
				}),
			);
			toast.success(`已保存为创作文档《${draft.title}》`);
		} catch (err: unknown) {
			toast.danger(err instanceof Error ? err.message : "保存创作文档失败");
		} finally {
			setIsActionLoading(false);
		}
	}, [draft, onDraftStatusChange]);

	// Open folder picker for saving to Obsidian vault
	const handleOpenFolderPicker = useCallback(async () => {
		setIsFolderPickerOpen(true);
		setTreeLoading(true);
		try {
			const res = await fetchObsidianTree(false);
			setVaultTree(res.tree || []);
		} catch {
			toast.warning("读取 Obsidian 目录树失败，将默认保存至 Vault 根目录");
		} finally {
			setTreeLoading(false);
		}
	}, []);

	const handleCloseFolderPicker = useCallback(() => {
		setIsFolderPickerOpen(false);
	}, []);

	// Confirm saving draft as note/canvas/excalidraw
	const handleConfirmSaveAsNote = useCallback(async () => {
		setIsActionLoading(true);
		try {
			const res = await saveDraftAsNoteRpc({
				draftId: draft.draftId,
				dirRelPath: selectedDir,
			});
			setStatus("archived");
			const target = { kind: "note" as const, ref: res.relPath };
			setArchivedTo(target);
			onDraftStatusChange?.({
				...draft,
				status: "archived",
				archivedTo: target,
			});
			setIsFolderPickerOpen(false);
			// Invalidate tree cache and trigger vault update
			invalidateObsidianTreeCache();
			void fetchObsidianTree(true);
			window.dispatchEvent(
				new CustomEvent("obsidian:vault-changed", {
					detail: { relPath: res.relPath },
				}),
			);
			const label =
				draft.kind === "excalidraw"
					? "画板"
					: draft.kind === "canvas"
						? "白板"
						: "笔记";
			toast.success(`已保存至 Obsidian ${label}：${res.relPath}`);
		} catch (err: unknown) {
			toast.danger(err instanceof Error ? err.message : "保存至 Obsidian 失败");
		} finally {
			setIsActionLoading(false);
		}
	}, [draft, selectedDir, onDraftStatusChange]);

	// Discard draft
	const handleDiscard = useCallback(async () => {
		setIsActionLoading(true);
		try {
			await discardDraftRpc(draft.draftId);
			setStatus("expired");
			onDraftStatusChange?.({ ...draft, status: "expired" });
			toast.info("草稿已移入回收站");
		} catch (err: unknown) {
			toast.danger(err instanceof Error ? err.message : "丢弃草稿失败");
		} finally {
			setIsActionLoading(false);
		}
	}, [draft, onDraftStatusChange]);

	// Navigate to archived document or note
	const handleNavigateToArchived = useCallback(() => {
		if (!archivedTo?.ref) return;
		if (archivedTo.kind === "document") {
			const docId = Number(archivedTo.ref);
			window.dispatchEvent(
				new CustomEvent("editor:documents-changed", {
					detail: { documentId: docId },
				}),
			);
			void navigate({
				to: "/creator/studio",
				search: { doc: docId, mode: "doc" },
			});
		} else {
			invalidateObsidianTreeCache();
			window.dispatchEvent(
				new CustomEvent("obsidian:vault-changed", {
					detail: { relPath: archivedTo.ref },
				}),
			);
			void navigate({
				to: "/obsidian",
				search: { note: archivedTo.ref },
			});
		}
	}, [archivedTo, navigate]);

	// Flatten folders for picker
	const folderOptions = useMemo<VaultFolderItem[]>(() => {
		const list: VaultFolderItem[] = [
			{ name: "Vault 根目录 (/)", relPath: "", depth: 0 },
		];
		list.push(...collectAllFolders(vaultTree, 1));
		return list;
	}, [vaultTree]);

	const filteredFolders = useMemo(() => {
		const q = folderSearch.trim().toLowerCase();
		if (!q) return folderOptions;
		return folderOptions.filter(
			(item) =>
				item.name.toLowerCase().includes(q) ||
				item.relPath.toLowerCase().includes(q),
		);
	}, [folderOptions, folderSearch]);

	return {
		status,
		archivedTo,
		isActionLoading,
		// Preview
		isPreviewOpen,
		previewLoading,
		previewContent,
		handleOpenPreview,
		handleClosePreview,
		// Document saving
		handleSaveAsDocument,
		// Folder picker
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
	};
}
