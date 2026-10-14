import type { Editor } from "@tiptap/core";
import type { JSONContent } from "@tiptap/react";
import type { DocumentVersion as DbDocumentVersion } from "../../types";
import {
	markdownToHtml,
	markdownToTiptapDoc,
	parseInlineMarkdownToNodes,
	renderBlock,
	tiptapJsonToMarkdown,
} from "../../markdown";
import type { DocBlock, DocumentVersion } from "./types";

/**
 * Safely parse a JSON string into a TipTap JSONContent structure.
 */
export function tryParseJson(str?: string | null): JSONContent | undefined {
	if (!str) return undefined;
	try {
		const parsed = JSON.parse(str);
		if (parsed && (parsed.type === "doc" || Array.isArray(parsed.content))) {
			return parsed;
		}
	} catch {
		// Non-JSON content string
	}
	return undefined;
}

/**
 * Map raw database document_versions record into frontend DocumentVersion model.
 */
export function mapDbVersionToUiVersion(dv: DbDocumentVersion): DocumentVersion {
	let contentMd = "";
	let contentJson: JSONContent | undefined;
	try {
		const parsed = JSON.parse(dv.content);
		contentMd = tiptapJsonToMarkdown(parsed) || dv.content;
		if (parsed && (parsed.type === "doc" || Array.isArray(parsed.content))) {
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
		createdAt: dv.createdAt ? new Date(dv.createdAt).getTime() : Date.now(),
		dbVersionId: dv.id,
		origin: dv.origin,
		isSavedToDb: true,
	};
}

/**
 * Check whether a text string contains Markdown table format
 */
export function hasMarkdownTable(text?: string): boolean {
	if (!text || !text.includes("|")) return false;
	return (
		/\|.+?\|\s*\n\s*\|[-: ]+?\|/.test(text) ||
		(text.includes("|") && text.includes("---"))
	);
}

/**
 * Parse top-level nodes of a TipTap editor document into structured blocks.
 */
export function parseDocToBlocks(editor: Editor): DocBlock[] {
	const json = editor.getJSON();
	const content = json.content || [];
	let textCount = 0;

	return content.map((node, i) => {
		const isText = node.type === "paragraph" || node.type === "heading";
		const isImage = node.type === "image";
		const isVideo = node.type === "video";
		const isTable = node.type === "table";

		let originalText = "";
		if (isText && Array.isArray(node.content)) {
			originalText = node.content.map((c: any) => c.text || "").join("");
		} else if (isTable) {
			originalText = renderBlock(node as any, "");
		}

		if (isText && originalText.trim().length >= 2) {
			textCount += 1;
			return {
				id: `block_${i}`,
				type: "text" as const,
				nodeType: node.type || "paragraph",
				attrs: node.attrs,
				originalText,
				revisedText: "", // Starts empty for right-side streaming
				status: "pending" as const,
				textIndex: textCount,
			};
		}

		if (isTable) {
			textCount += 1;
			return {
				id: `block_${i}`,
				type: "table" as const,
				nodeType: "table",
				attrs: { ...node.attrs, tableContent: node.content },
				originalText,
				revisedText: originalText,
				aiRevisedText: originalText,
				status: "done" as const,
				textIndex: textCount,
			};
		}

		if (isImage) {
			return {
				id: `block_${i}`,
				type: "image" as const,
				nodeType: "image",
				attrs: node.attrs,
				originalText: "",
				revisedText: "",
				status: "done" as const,
			};
		}

		if (isVideo) {
			return {
				id: `block_${i}`,
				type: "video" as const,
				nodeType: "video",
				attrs: node.attrs,
				originalText: "",
				revisedText: "",
				status: "done" as const,
			};
		}

		return {
			id: `block_${i}`,
			type: "other" as const,
			nodeType: node.type || "paragraph",
			attrs: node.attrs,
			originalText,
			revisedText: originalText,
			aiRevisedText: originalText,
			status: "done" as const,
		};
	});
}

/**
 * Reassemble DocBlock list back into standard ProseMirror document JSON.
 * Accurately parses block-level Markdown (such as tables, multiple headings, lists)
 * into native ProseMirror nodes when accepted.
 */
export function buildDocFromBlocks(blocks: DocBlock[]) {
	const content: any[] = [];

	for (const b of blocks) {
		if (b.type === "text" || b.type === "table") {
			const textToUse = b.revisedText || b.originalText;

			// If text contains block-level markdown structures (tables, multi-line blocks, lists),
			// parse via markdownToTiptapDoc so true table, list, and multi-paragraph nodes are preserved.
			if (
				textToUse &&
				(hasMarkdownTable(textToUse) ||
					textToUse.includes("\n\n") ||
					/(?:^|\n)\s*[-*+]\s+/m.test(textToUse) ||
					/(?:^|\n)\s*\d+\.\s+/m.test(textToUse))
			) {
				const { nodes } = markdownToTiptapDoc(textToUse);
				if (nodes && nodes.length > 0) {
					content.push(...nodes);
					continue;
				}
			}

			if (
				b.type === "table" &&
				(!b.revisedText || b.revisedText === b.originalText)
			) {
				content.push({
					type: "table",
					attrs: b.attrs,
					content: b.attrs?.tableContent || [],
				});
				continue;
			}

			const inlineNodes = textToUse
				? parseInlineMarkdownToNodes(textToUse)
				: [];

			content.push({
				type: b.nodeType || "paragraph",
				attrs: b.attrs,
				content:
					inlineNodes.length > 0
						? inlineNodes
						: textToUse
							? [{ type: "text", text: textToUse }]
							: [],
			});
		} else {
			content.push({
				type: b.nodeType,
				attrs: b.attrs,
			});
		}
	}
	return {
		type: "doc",
		content: content.length > 0 ? content : [{ type: "paragraph" }],
	};
}

/**
 * Render version content into target editor: uses JSONContent directly if present,
 * otherwise parses markdown to HTML.
 */
export function applyVersionContent(
	targetEditor: { commands: { setContent: (content: any, options?: { emitUpdate?: boolean }) => any } },
	version: DocumentVersion,
	emitUpdate = false,
) {
	if (version.contentJson) {
		targetEditor.commands.setContent(version.contentJson, {
			emitUpdate,
		});
		return;
	}
	const html = markdownToHtml(version.content);
	targetEditor.commands.setContent(html || "<p></p>", { emitUpdate });
}

