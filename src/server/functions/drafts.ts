import { rmSync } from "node:fs";
import { createServerFn } from "@tanstack/react-start";
import { markdownToTiptapDoc } from "../../components/editor/markdown.ts";
import {
	deleteDraft,
	getDraft,
	markArchived,
} from "../ai/drafts/draftStore.ts";
import { workbenchDb } from "../db/sqlite.ts";
import { createVaultNote } from "../services/obsidian/index.ts";

/**
 * Server Function: Get draft preview content and metadata
 */
export const getDraftPreview = createServerFn({ method: "POST" })
	.validator((data: { draftId: string }) => data)
	.handler(async ({ data }) => {
		const draft = getDraft(data.draftId);
		if (!draft || draft.status === "expired") {
			return {
				exists: false,
				status: "expired" as const,
				title: draft?.title || "",
				content: "",
				wordCount: draft?.wordCount || 0,
				createdAt: draft?.createdAt || "",
				archivedTo: draft?.archivedTo,
			};
		}
		return {
			exists: true,
			status: draft.status,
			title: draft.title,
			content: draft.content,
			wordCount: draft.wordCount,
			createdAt: draft.createdAt,
			archivedTo: draft.archivedTo,
		};
	});

/**
 * Server Function: Save draft into documents database table and mark archived
 */
export const saveDraftAsDocument = createServerFn({ method: "POST" })
	.validator(
		(data: { draftId: string; folderId?: number | null }) => data,
	)
	.handler(async ({ data }) => {
		const draft = getDraft(data.draftId);
		if (!draft || draft.status === "expired") {
			throw new Error("草稿不存在或已过期");
		}

		const { nodes, contentText } = markdownToTiptapDoc(draft.content);
		const jsonString = JSON.stringify({
			type: "doc",
			content: nodes.length > 0 ? nodes : [{ type: "paragraph" }],
		});

		const documentId = workbenchDb.createDocument({
			title: draft.title,
			content: jsonString,
			contentText: contentText || draft.content,
			folderId: data.folderId ?? null,
		});

		markArchived(data.draftId, {
			kind: "document",
			ref: String(documentId),
		});

		if (draft.filePath) {
			try {
				rmSync(draft.filePath, { force: true });
			} catch {
				// non-critical, sweep will clean up
			}
		}

		return {
			documentId,
			title: draft.title,
		};
	});

/**
 * Server Function: Save draft as an Obsidian Markdown note in vault and mark archived
 */
export const saveDraftAsNote = createServerFn({ method: "POST" })
	.validator((data: { draftId: string; dirRelPath?: string }) => data)
	.handler(async ({ data }) => {
		const draft = getDraft(data.draftId);
		if (!draft || draft.status === "expired") {
			throw new Error("草稿不存在或已过期");
		}

		const dirRel = (data.dirRelPath || "").trim();
		const result = await createVaultNote(
			dirRel,
			draft.title,
			draft.rawContent || draft.content,
		);

		if (!result.success || !result.relPath) {
			throw new Error(result.error || "保存至 Obsidian 笔记失败");
		}

		markArchived(data.draftId, {
			kind: "note",
			ref: result.relPath,
		});

		if (draft.filePath) {
			try {
				rmSync(draft.filePath, { force: true });
			} catch {
				// non-critical, sweep will clean up
			}
		}

		return {
			relPath: result.relPath,
			title: draft.title,
		};
	});

/**
 * Server Function: Discard draft via trash and mark status expired
 */
export const discardDraft = createServerFn({ method: "POST" })
	.validator((data: { draftId: string }) => data)
	.handler(async ({ data }) => {
		const success = deleteDraft(data.draftId);
		return { success };
	});
