import {
	type JSONContent,
	markdownToTiptapDoc,
	tiptapJsonToMarkdown,
} from "../../../../components/editor/markdown.ts";
import type { DocumentVersionOrigin } from "../../../../components/editor/types.ts";
import { workbenchDb } from "../../../db/sqlite.ts";
import type { ToolExecutionResult } from "../types.ts";

export interface TargetDocResolution {
	doc?: ReturnType<typeof workbenchDb.getDocument>;
	resolvedId?: number;
	errorSummary?: string;
}

export interface ResolveDocOptions {
	actionName?: string;
	provideSuggestionsOnMultiple?: boolean;
}

/**
 * Resolves the target document by documentId, activeDocumentId, or single database fallback.
 */
export function resolveTargetDocument(
	args: { documentId?: number; activeDocumentId?: number },
	options: ResolveDocOptions = {},
): TargetDocResolution {
	const action = options.actionName ?? "操作文档";
	let id = args.documentId ?? args.activeDocumentId;

	if (!id) {
		const recentDocs = workbenchDb.listDocuments(false);
		if (recentDocs.length === 1) {
			id = recentDocs[0].id;
		} else if (recentDocs.length > 1) {
			if (options.provideSuggestionsOnMultiple) {
				const listStr = recentDocs
					.slice(0, 5)
					.map((d) => `• ID: ${d.id} - 《${d.title}》`)
					.join("\n");
				return {
					errorSummary: `未指定 documentId 且当前无明确活跃文档。数据库中现有的文档如下，可传入对应 documentId 读取：\n${listStr}`,
				};
			}
			return {
				errorSummary: `无法${action}：未指定 documentId 且当前无明确的活跃编辑文档。`,
			};
		} else {
			return {
				errorSummary: `无法${action}：未指定 documentId 且当前创作库中暂无文档。`,
			};
		}
	}

	const doc = workbenchDb.getDocument(id);
	if (!doc) {
		return {
			errorSummary: `文档 ID=${id} 不存在${options.actionName ? `，无法${action}` : ""}。`,
		};
	}

	return { doc, resolvedId: id };
}

/**
 * Parses the document's JSON content safely, falling back to markdown conversion.
 */
export function parseDocumentAst(doc: {
	content?: string | null;
	contentText?: string | null;
}): { type: string; content: JSONContent[] } {
	try {
		const docJson = doc.content
			? JSON.parse(doc.content)
			: { type: "doc", content: [] };
		if (!Array.isArray(docJson.content)) {
			docJson.content = [];
		}
		return docJson;
	} catch {
		return {
			type: "doc",
			content: markdownToTiptapDoc(doc.contentText || "").nodes,
		};
	}
}

/**
 * Creates a pre-mutation snapshot and persists the updated AST to SQLite.
 */
export function saveDocumentAstMutation(params: {
	documentId: number;
	previousContent?: string | null;
	docJson: { type: string; content?: JSONContent[] };
	snapshotNote: string;
	origin?: DocumentVersionOrigin;
}): { updatedMarkdown: string; contentText: string } {
	const { documentId, previousContent, docJson, snapshotNote, origin = "ai" } =
		params;

	// Record version snapshot before applying mutation
	workbenchDb.createDocumentVersion({
		documentId,
		content: previousContent ?? "",
		origin,
		note: snapshotNote,
	});

	const updatedJsonString = JSON.stringify(docJson);
	const updatedMarkdown = tiptapJsonToMarkdown(docJson);
	const contentText = updatedMarkdown.replace(/!\[.*?\]\(.*?\)/g, "").trim();

	workbenchDb.updateDocument(documentId, {
		content: updatedJsonString,
		contentText,
	});

	return { updatedMarkdown, contentText };
}

/**
 * Helper to construct a standard ToolExecutionResult.
 */
export function createToolResult(
	toolName: string,
	summary: string,
	isMutation = false,
): ToolExecutionResult {
	return {
		toolName,
		summary,
		items: [],
		references: [],
		isMutation,
	};
}

