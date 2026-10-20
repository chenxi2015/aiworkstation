import type { JSONContent } from "../../../../components/editor/markdown.ts";
import { tiptapJsonToMarkdown } from "../../../../components/editor/markdown.ts";

/**
 * Extracts plain text or markdown representation from a TipTap AST node.
 */
export function extractBlockText(node: JSONContent | undefined): string {
	if (!node) return "";
	if (typeof node.text === "string") return node.text;
	if (node.type === "image") {
		const alt = (node.attrs?.alt as string) || "插图";
		const src = (node.attrs?.src as string) || "";
		return `![${alt}](${src})`;
	}
	if (Array.isArray(node.content)) {
		return node.content.map(extractBlockText).join("");
	}
	return "";
}

/**
 * Normalizes text for resilient matching across Markdown and plain text.
 * Strips common markdown formatting syntax, converts full-width punctuation to half-width,
 * collapses whitespaces and converts to lowercase.
 */
export function normalizeTextForMatching(text: string): string {
	if (!text) return "";
	return (
		text
			// Strip markdown links [text](url) -> text
			.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
			// Strip markdown images ![alt](url) -> alt
			.replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
			// Strip bold and italic marks: **, *, __, _, ~~
			.replace(/(\*\*|__|\*|_|~~)/g, "")
			// Strip inline code backticks
			.replace(/`/g, "")
			// Strip block prefixes (#, >, -, *, +, 1.) at line starts
			.replace(/^[ \t]*(?:[#]+|>|[-*+]|\d+\.)[ \t]+/gm, "")
			// Normalize full-width punctuation to half-width
			.replace(/：/g, ":")
			.replace(/，/g, ",")
			.replace(/。/g, ".")
			.replace(/！/g, "!")
			.replace(/？/g, "?")
			.replace(/（/g, "(")
			.replace(/）/g, ")")
			.replace(/【/g, "[")
			.replace(/】/g, "]")
			.replace(/[“”]/g, '"')
			.replace(/[‘’]/g, "'")
			.replace(/[「『]/g, '"')
			.replace(/[」』]/g, '"')
			.replace(/；/g, ";")
			.replace(/[—–]/g, "-")
			.replace(/[…]+/g, "...")
			// Remove spaces around punctuation marks (common in Chinese / Markdown mixed text)
			.replace(/\s*([:()[\]{},;!?])\s*/g, "$1")
			// Collapse multiple spaces/newlines
			.replace(/\s+/g, " ")
			.toLowerCase()
			.trim()
	);
}

/**
 * Compacts text by stripping non-essential punctuation and whitespaces
 * for fuzzy character sequence fallback matching.
 */
export function compactTextForMatching(text: string): string {
	if (!text) return "";
	return text
		.replace(
			/[ \t\r\n.,;:!?()[\]{}'"`\-_*#~`/\\，。！？（）【】“”‘’、：；—…「」『』]+/g,
			"",
		)
		.toLowerCase()
		.trim();
}

/**
 * Robust block matching against a snippet, checking raw text, rendered markdown,
 * normalized text, and compact character sequences.
 */
export function isBlockMatchingSnippet(
	node: JSONContent,
	snippet: string,
): boolean {
	const rawText = extractBlockText(node);
	let mdText = "";
	try {
		mdText = tiptapJsonToMarkdown({ type: "doc", content: [node] });
	} catch {
		mdText = "";
	}

	const sLower = snippet.toLowerCase().trim();
	if (
		rawText.toLowerCase().includes(sLower) ||
		mdText?.toLowerCase().includes(sLower)
	) {
		return true;
	}

	const normSnippet = normalizeTextForMatching(snippet);
	if (!normSnippet) return false;

	const normRaw = normalizeTextForMatching(rawText);
	if (normRaw.includes(normSnippet)) return true;

	if (mdText) {
		const normMd = normalizeTextForMatching(mdText);
		if (normMd.includes(normSnippet)) return true;
	}

	const compSnippet = compactTextForMatching(snippet);
	const compRaw = compactTextForMatching(rawText);
	const compMd = mdText ? compactTextForMatching(mdText) : "";

	if (compSnippet.length >= 3) {
		if (compRaw && compRaw.includes(compSnippet)) return true;
		if (compMd && compMd.includes(compSnippet)) return true;

		// When snippet is a compound/multi-block snippet containing this block's full text
		if (compRaw.length >= 6 && compSnippet.includes(compRaw)) return true;
		if (compMd && compMd.length >= 6 && compSnippet.includes(compMd)) return true;
	}

	// If snippet has multiple lines or contains an image/heading, try matching by significant lines
	const lines = snippet
		.split("\n")
		.map((l) => l.trim())
		.filter((l) => l.length > 0);

	if (lines.length > 1) {
		for (const line of lines) {
			const compLine = compactTextForMatching(line);
			if (compLine.length >= 6) {
				if (compRaw.includes(compLine) || compLine.includes(compRaw)) {
					return true;
				}
				if (compMd && (compMd.includes(compLine) || compLine.includes(compMd))) {
					return true;
				}
			}
		}
	}

	return false;
}

/**
 * Applies paragraph replacement to doc content.
 * If target node is a list and replacement is a single item, replaces only the matched listItem.
 * Otherwise, replaces the matched top-level block node with replacementNodes.
 */
export function applyParagraphReplacement(
	docContent: JSONContent[],
	targetIndex: number,
	rawSnippet: string,
	replacementNodes: JSONContent[],
	countToReplace = 1,
): void {
	const targetNode = docContent[targetIndex];
	if (!targetNode) {
		docContent.splice(targetIndex, countToReplace, ...replacementNodes);
		return;
	}

	const listContent = targetNode.content;
	const isListTarget =
		(targetNode.type === "bulletList" || targetNode.type === "orderedList") &&
		Array.isArray(listContent) &&
		listContent.length > 0;

	// Check if replacement is also a full multi-item list of the same kind
	const isReplacementFullList =
		replacementNodes.length === 1 &&
		replacementNodes[0].type === targetNode.type &&
		Array.isArray(replacementNodes[0].content) &&
		replacementNodes[0].content.length > 1;

	if (isListTarget && Array.isArray(listContent) && !isReplacementFullList) {
		const matchedItemIndex = listContent.findIndex((item) =>
			isBlockMatchingSnippet(item, rawSnippet),
		);
		if (matchedItemIndex !== -1) {
			const itemToInsert =
				replacementNodes.length === 1 && replacementNodes[0].type === "listItem"
					? replacementNodes[0]
					: replacementNodes.length === 1 &&
							replacementNodes[0].type === targetNode.type &&
							Array.isArray(replacementNodes[0].content) &&
							replacementNodes[0].content.length === 1
						? replacementNodes[0].content[0]
						: { type: "listItem", content: replacementNodes };

			listContent.splice(matchedItemIndex, 1, itemToInsert);
			return;
		}
	}

	docContent.splice(targetIndex, countToReplace, ...replacementNodes);
}

