import { toast } from "@heroui/react";
import type { Editor } from "@tiptap/core";
import type { JSONContent } from "@tiptap/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchDocumentVersions } from "../../../services/api/editorClient";
import { markdownToHtml } from "../markdown";
import type { DocumentVersion } from "../components/split/types";
import {
	applyVersionContent,
	mapDbVersionToUiVersion,
	tryParseJson,
} from "../components/split/utils";
import type {
	DocumentVersion as DbDocumentVersion,
	EditorDocument,
} from "../types";

export interface UseDocumentVersionsOptions {
	docId: number | null;
	activeDoc: EditorDocument | null;
	editorRef: React.MutableRefObject<Editor | null>;
	flushSave: () => Promise<void>;
	onEditorChange: (contentJson: string, text: string) => void;
	rawHandleSnapshot?: (note?: string) => Promise<DbDocumentVersion | undefined>;
}

export interface UseDocumentVersionsReturn {
	versions: DocumentVersion[];
	selectedVersionId: string;
	isLoadingVersions: boolean;
	handleSnapshot: (note?: string) => Promise<void>;
	handleSelectVersion: (versionId: string) => Promise<void>;
	reloadVersions: () => Promise<void>;
}

/**
 * Hook for managing document version snapshots and switching between historical versions.
 */
export function useDocumentVersions({
	docId,
	activeDoc,
	editorRef,
	flushSave,
	onEditorChange,
	rawHandleSnapshot,
}: UseDocumentVersionsOptions): UseDocumentVersionsReturn {
	const [dbVersions, setDbVersions] = useState<DocumentVersion[]>([]);
	const [selectedVersionId, setSelectedVersionId] = useState<string>("current");
	const [isLoadingVersions, setIsLoadingVersions] = useState(false);

	// Cache current doc content when switching to a history version, so the user can safely return
	const latestDocCacheRef = useRef<{
		contentJson?: JSONContent;
		contentText: string;
	} | null>(null);

	// Load historical versions from SQLite whenever docId changes
	const reloadVersions = useCallback(async () => {
		if (!docId) {
			setDbVersions([]);
			return;
		}
		setIsLoadingVersions(true);
		try {
			const rows = await fetchDocumentVersions(docId);
			const mapped = rows.map(mapDbVersionToUiVersion);
			setDbVersions(mapped);
		} catch (err) {
			console.warn("[useDocumentVersions] Failed to load versions:", err);
		} finally {
			setIsLoadingVersions(false);
		}
	}, [docId]);

	useEffect(() => {
		setSelectedVersionId("current");
		latestDocCacheRef.current = null;
		void reloadVersions();
	}, [docId, reloadVersions]);

	// Construct list: [current (latest), ...dbVersions]
	const versions = useMemo(() => {
		const currentVer: DocumentVersion = {
			id: "current",
			label: "当前正文 (最新)",
			mode: "original",
			content: activeDoc?.contentText || "",
			contentJson: tryParseJson(activeDoc?.content),
			createdAt: activeDoc?.updatedAt
				? new Date(activeDoc.updatedAt).getTime()
				: Date.now(),
			origin: "human",
			isSavedToDb: true,
		};
		return [currentVer, ...dbVersions];
	}, [activeDoc, dbVersions]);

	// Snapshot action: save current document state as a version snapshot
	const handleSnapshot = useCallback(
		async (note = "手动存档") => {
			if (!rawHandleSnapshot) return;
			const newVersion = await rawHandleSnapshot(note);
			if (newVersion) {
				const mapped = mapDbVersionToUiVersion(newVersion);
				setDbVersions((prev) => [
					mapped,
					...prev.filter((v) => v.dbVersionId !== newVersion.id),
				]);
			}
		},
		[rawHandleSnapshot],
	);

	// Switch version action: render chosen version into editor
	const handleSelectVersion = useCallback(
		async (versionId: string) => {
			if (versionId === selectedVersionId) return;
			const editor = editorRef.current;
			if (!editor) return;

			if (versionId === "current") {
				// Revert to latest active document content
				if (latestDocCacheRef.current?.contentJson) {
					editor.commands.setContent(latestDocCacheRef.current.contentJson, {
						emitUpdate: true,
					});
					onEditorChange(
						JSON.stringify(latestDocCacheRef.current.contentJson),
						editor.getText(),
					);
				} else if (activeDoc?.content) {
					const json = tryParseJson(activeDoc.content);
					if (json) {
						editor.commands.setContent(json, { emitUpdate: true });
						onEditorChange(activeDoc.content, editor.getText());
					} else {
						const html = markdownToHtml(activeDoc.contentText || "");
						editor.commands.setContent(html || "<p></p>", { emitUpdate: true });
						onEditorChange("", editor.getText());
					}
				}
				setSelectedVersionId("current");
				toast.success("已切回当前最新正文");
				return;
			}

			// Find historical version
			const target = dbVersions.find((v) => v.id === versionId);
			if (!target) return;

			// Before switching away from current, cache latest state and flush pending changes
			if (selectedVersionId === "current") {
				latestDocCacheRef.current = {
					contentJson: editor.getJSON(),
					contentText: editor.getText(),
				};
				await flushSave();
			}

			applyVersionContent(editor, target, true);
			onEditorChange(
				target.contentJson ? JSON.stringify(target.contentJson) : "",
				editor.getText(),
			);
			setSelectedVersionId(versionId);
			toast.success(`已切换至版本 ${target.label}（可随时切回最新正文）`);
		},
		[
			selectedVersionId,
			editorRef,
			dbVersions,
			activeDoc,
			flushSave,
			onEditorChange,
		],
	);

	return {
		versions,
		selectedVersionId,
		isLoadingVersions,
		handleSnapshot,
		handleSelectVersion,
		reloadVersions,
	};
}
