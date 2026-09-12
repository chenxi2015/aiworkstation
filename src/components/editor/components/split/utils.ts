import type { Editor } from "@tiptap/core";
import { parseInlineMarkdownToNodes } from "../../markdown";
import type { DocBlock } from "./types";

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

		let originalText = "";
		if (isText && Array.isArray(node.content)) {
			originalText = node.content.map((c: any) => c.text || "").join("");
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
 */
export function buildDocFromBlocks(blocks: DocBlock[]) {
	return {
		type: "doc",
		content: blocks.map((b) => {
			if (b.type === "text") {
				const textToUse = b.revisedText || b.originalText;
				const inlineNodes = textToUse
					? parseInlineMarkdownToNodes(textToUse)
					: [];
				return {
					type: b.nodeType,
					attrs: b.attrs,
					content:
						inlineNodes.length > 0
							? inlineNodes
							: textToUse
								? [{ type: "text", text: textToUse }]
								: [],
				};
			}
			return {
				type: b.nodeType,
				attrs: b.attrs,
			};
		}),
	};
}
