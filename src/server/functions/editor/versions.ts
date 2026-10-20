import { createServerFn } from "@tanstack/react-start";
import type {
	DocumentVersion,
	DocumentVersionOrigin,
} from "../../../components/editor/types.ts";
import { workbenchDb } from "../../db/sqlite.ts";

/**
 * Server Function: 版本快照列表
 */
export const listDocumentVersions = createServerFn({ method: "GET" })
	.validator((data: { documentId: number }) => data)
	.handler(async ({ data }): Promise<DocumentVersion[]> => {
		return workbenchDb.listDocumentVersions(data.documentId);
	});

/**
 * Server Function: 手动打版本快照（AI 回写前的自动快照也走这里，origin='ai'；支持自定义 content）
 */
export const snapshotDocumentVersion = createServerFn({ method: "POST" })
	.validator(
		(data: {
			documentId: number;
			content?: string;
			origin?: DocumentVersionOrigin;
			note?: string;
		}) => data,
	)
	.handler(async ({ data }): Promise<DocumentVersion> => {
		const doc = workbenchDb.getDocument(data.documentId);
		if (!doc) throw new Error("文档不存在");
		const contentToSave =
			data.content !== undefined ? data.content : doc.content;
		const id = workbenchDb.createDocumentVersion({
			documentId: data.documentId,
			content: contentToSave,
			origin: data.origin ?? "human",
			note: data.note ?? null,
		});
		const version = workbenchDb
			.listDocumentVersions(data.documentId)
			.find((v) => v.id === id);
		if (!version) throw new Error("快照创建失败");
		return version;
	});

