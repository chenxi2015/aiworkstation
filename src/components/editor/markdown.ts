import { type JSONContent, mergeAttributes, Node } from "@tiptap/core";
import Image from "@tiptap/extension-image";
import { Table } from "@tiptap/extension-table";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import TableRow from "@tiptap/extension-table-row";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import { generateJSON } from "@tiptap/html";
import StarterKit from "@tiptap/starter-kit";
import { renderToMarkdown } from "@tiptap/static-renderer";
import { marked } from "marked";

export type { JSONContent };

/**
 * Headless Video node definition for HTML/Markdown roundtrip serialization without React runtime
 */
const HeadlessVideo = Node.create({
	name: "video",
	group: "block",
	atom: true,
	addAttributes() {
		return {
			src: { default: null },
			poster: { default: null },
		};
	},
	parseHTML() {
		return [{ tag: "video[src]" }];
	},
	renderHTML({ HTMLAttributes }) {
		return ["video", mergeAttributes(HTMLAttributes, { controls: "true" })];
	},
});

/**
 * Shared core extensions for TipTap schema and AST conversion (works isomorphically in Browser and Node.js)
 */
export const coreConversionExtensions = [
	StarterKit.configure({
		heading: { levels: [1, 2, 3, 4, 5, 6] },
		link: { openOnClick: false },
	}),
	Table.configure({ resizable: false }),
	TableRow,
	TableHeader,
	TableCell,
	TaskList.configure({ HTMLAttributes: { class: "task-list" } }),
	TaskItem.configure({
		nested: true,
		HTMLAttributes: { class: "task-list-item" },
	}),
	Image.configure({ inline: false }),
	HeadlessVideo,
];

/**
 * Converts Markdown text into clean HTML using marked with GFM support
 */
export function markdownToHtml(markdown: string): string {
	if (!markdown || !markdown.trim()) return "";
	return marked.parse(markdown, {
		gfm: true,
		breaks: true,
	}) as string;
}

/**
 * Converts TipTap Document JSON tree into standard Markdown string using TipTap official static-renderer
 */
export function tiptapJsonToMarkdown(doc: JSONContent): string {
	if (!doc || !doc.content || doc.content.length === 0) return "";
	try {
		const md = renderToMarkdown({
			content: doc,
			extensions: coreConversionExtensions,
		});
		return (md || "").trim();
	} catch (err) {
		console.warn("[tiptapJsonToMarkdown] Error rendering to markdown:", err);
		return "";
	}
}

/**
 * Converts Markdown string into standardized TipTap Document JSON AST using TipTap official generateJSON
 */
export function markdownToTiptapJson(markdown: string): JSONContent {
	if (!markdown || !markdown.trim()) {
		return { type: "doc", content: [{ type: "paragraph" }] };
	}
	const html = markdownToHtml(markdown);
	try {
		const json = generateJSON(html, coreConversionExtensions);
		if (!json || !json.content || json.content.length === 0) {
			return { type: "doc", content: [{ type: "paragraph" }] };
		}
		return json;
	} catch (err) {
		console.warn(
			"[markdownToTiptapJson] Error parsing HTML to TipTap JSON:",
			err,
		);
		return {
			type: "doc",
			content: [
				{ type: "paragraph", content: [{ type: "text", text: markdown }] },
			],
		};
	}
}

/**
 * Converts Markdown text into nodes, doc JSON string, and plain text
 */
export function markdownToTiptapDoc(markdownText: string): {
	nodes: JSONContent[];
	jsonString: string;
	contentText: string;
} {
	const doc = markdownToTiptapJson(markdownText);
	const nodes = doc.content ?? [{ type: "paragraph" }];
	return {
		nodes,
		jsonString: JSON.stringify(doc),
		contentText: markdownText || "",
	};
}

/**
 * Renders a single TipTap JSON block node to markdown string
 */
export function renderBlock(node: JSONContent, _indent = ""): string {
	if (!node) return "";
	return tiptapJsonToMarkdown({ type: "doc", content: [node] });
}

/**
 * Parses inline markdown text into TipTap inline nodes
 */
export function parseInlineMarkdownToNodes(text: string): JSONContent[] {
	if (!text) return [];
	const doc = markdownToTiptapJson(text);
	const firstBlock = doc.content?.[0];
	if (firstBlock?.content && firstBlock.content.length > 0) {
		return firstBlock.content;
	}
	return [{ type: "text", text }];
}
