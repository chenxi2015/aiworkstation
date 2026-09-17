import { toast } from "@heroui/react";
import type { Editor } from "@tiptap/core";
import type { JSONContent } from "@tiptap/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	fetchDocumentVersions,
	snapshotVersionRpc,
} from "../../../../../services/api/editorClient";
import { tiptapJsonToMarkdown } from "../../../markdown";
import { markdownToPlainText } from "../../../utils/diffHelper";
import type { DocumentVersion } from "../types";
import { applyVersionContent } from "../utils";

/** 右栏草稿工作区的固定 ID：不属于版本列表，仅表示"未保存的当前草稿" */
export const DRAFT_VERSION_ID = "draft";

export interface UseSplitVersionsOptions {
	docId: number;
	initialBaseMarkdown: string;
	initialBaseJson: JSONContent;
	rightEditor: Editor | null;
	setRightWordCount: (count: number) => void;
}

export function useSplitVersions({
	docId,
	initialBaseMarkdown,
	initialBaseJson,
	rightEditor,
	setRightWordCount,
}: UseSplitVersionsOptions) {
	// Version State Pool：只存放"已保存版本"（v0 基准 + 数据库快照 + 手动保存的新版本）
	const [versions, setVersions] = useState<DocumentVersion[]>(() => {
		const v0: DocumentVersion = {
			id: "v0",
			label: "v0: 当前正文 (Base)",
			mode: "original",
			content: initialBaseMarkdown,
			contentJson: initialBaseJson,
			createdAt: Date.now(),
			origin: "human",
			isSavedToDb: true,
		};
		return [v0];
	});

	// 草稿工作区内容（Markdown），与版本列表完全解耦
	const [draftContent, setDraftContent] = useState<string>("");
	// 草稿工作区的原始 TipTap JSON：渲染优先使用，避免 Markdown 往返丢失排版样式
	const [draftContentJson, setDraftContentJson] = useState<JSONContent | null>(
		null,
	);
	const draftOriginRef = useRef<"human" | "ai">("human");
	const draftActionRef = useRef<string>("手动精修");

	const [leftVersionId, setLeftVersionId] = useState<string>("v0");
	const [rightVersionId, setRightVersionId] =
		useState<string>(DRAFT_VERSION_ID);
	const [isSavingVersion, setIsSavingVersion] = useState(false);

	// Load historical versions from SQLite on mount
	useEffect(() => {
		if (!docId) return;
		let isMounted = true;
		void fetchDocumentVersions(docId).then((dbVers) => {
			if (!isMounted || !dbVers || dbVers.length === 0) return;
			const mappedDbVersions: DocumentVersion[] = dbVers.map((dv) => {
				let contentMd = "";
				let contentJson: JSONContent | undefined;
				try {
					const parsed = JSON.parse(dv.content);
					contentMd = tiptapJsonToMarkdown(parsed) || dv.content;
					if (
						parsed &&
						(parsed.type === "doc" || Array.isArray(parsed.content))
					) {
						contentJson = parsed;
					}
				} catch {
					contentMd = dv.content;
				}
				const dateStr = dv.createdAt
					? new Date(dv.createdAt).toLocaleTimeString([], {
							hour: "2-digit",
							minute: "2-digit",
						})
					: "";
				return {
					id: `db_${dv.id}`,
					label: `v${dv.version}: ${dv.note || (dv.origin === "ai" ? "AI 改写" : "历史快照")}${dateStr ? ` (${dateStr})` : ""}`,
					mode: dv.origin === "ai" ? "rewrite" : "manual",
					content: contentMd,
					contentJson,
					createdAt: dv.createdAt
						? new Date(dv.createdAt).getTime()
						: Date.now(),
					dbVersionId: dv.id,
					origin: dv.origin,
					isSavedToDb: true,
				};
			});

			setVersions((prev) => {
				const existingIds = new Set(prev.map((v) => v.id));
				const newUnique = mappedDbVersions.filter(
					(v) => !existingIds.has(v.id),
				);
				return [...prev, ...newUnique];
			});
		});
		return () => {
			isMounted = false;
		};
	}, [docId]);

	// Current active version models
	const activeLeftVersion = useMemo(
		() => versions.find((v) => v.id === leftVersionId) || versions[0],
		[versions, leftVersionId],
	);

	// 右栏当前内容模型：草稿工作区（未保存）或某个已保存版本
	const activeRightVersion = useMemo<DocumentVersion>(() => {
		if (rightVersionId === DRAFT_VERSION_ID) {
			return {
				id: DRAFT_VERSION_ID,
				label: "当前草稿 (未保存)",
				mode: "manual",
				content: draftContent,
				contentJson: draftContentJson ?? undefined,
				createdAt: 0,
				origin: draftOriginRef.current,
				isSavedToDb: false,
			};
		}
		return (
			versions.find((v) => v.id === rightVersionId) ||
			versions[versions.length - 1] ||
			versions[0]
		);
	}, [versions, rightVersionId, draftContent, draftContentJson]);

	// Handle version selection on right column
	const handleSelectRightVersion = useCallback(
		(versionId: string) => {
			setRightVersionId(versionId);
			const targetVer = versions.find((v) => v.id === versionId);
			if (!targetVer || !rightEditor) return;
			try {
				// emitUpdate=false：仅浏览版本不触发 update 监听，避免把草稿工作区覆盖成所看版本
				applyVersionContent(rightEditor, targetVer, false);
				setRightWordCount(markdownToPlainText(targetVer.content).length);
			} catch {
				rightEditor.commands.setContent(targetVer.content, {
					emitUpdate: false,
				});
				setRightWordCount(markdownToPlainText(targetVer.content).length);
			}
		},
		[versions, rightEditor, setRightWordCount],
	);

	// Manually save current active version to SQLite document_versions
	const handleSaveCurrentVersionToDb = useCallback(async () => {
		if (!docId || !rightEditor) return;
		setIsSavingVersion(true);
		try {
			const jsonContent = JSON.stringify(rightEditor.getJSON());
			const textPreview = rightEditor.getText().trim().slice(0, 15);
			const saved = await snapshotVersionRpc({
				documentId: docId,
				content: jsonContent,
				origin: "human",
				note: `手动存档: ${textPreview || "精修版"}`,
			});
			setVersions((prev) =>
				prev.map((v) =>
					v.id === rightVersionId
						? {
								...v,
								isSavedToDb: true,
								dbVersionId: saved.id,
								label: v.label.includes("[已存库]")
									? v.label
									: `${v.label} [已存库]`,
							}
						: v,
				),
			);
			toast.success("当前版本已成功持久化至数据库！");
		} catch (err: unknown) {
			const msg = err instanceof Error ? err.message : String(err);
			toast.danger(`保存版本失败: ${msg}`);
		} finally {
			setIsSavingVersion(false);
		}
	}, [docId, rightEditor, rightVersionId]);

	return {
		versions,
		setVersions,
		leftVersionId,
		setLeftVersionId,
		rightVersionId,
		setRightVersionId,
		draftContent,
		setDraftContent,
		draftContentJson,
		setDraftContentJson,
		draftOriginRef,
		draftActionRef,
		isSavingVersion,
		activeLeftVersion,
		activeRightVersion,
		handleSelectRightVersion,
		handleSaveCurrentVersionToDb,
	};
}
