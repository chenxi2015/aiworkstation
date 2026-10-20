import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";
import { markdownToTiptapDoc } from "../../../../components/editor/markdown.ts";
import type { ToolExecutionResult } from "../types.ts";
import {
	createToolResult,
	parseDocumentAst,
	resolveTargetDocument,
	saveDocumentAstMutation,
} from "./documentHelper.ts";
import { isBlockMatchingSnippet } from "./matching.ts";

export const insertDocumentBlockInputSchema = z.object({
	documentId: z
		.number()
		.optional()
		.describe("要插入内容的文档 ID。省略时自动定位当前活跃文档"),
	targetAnchor: z
		.string()
		.optional()
		.describe(
			"定位锚点：目标段落的首句或关键词（例如某个副标题或特定论点句子）。若省略或未找到，默认插在文章末尾",
		),
	position: z
		.enum(["before", "after", "append"])
		.default("after")
		.describe("相对于锚点的位置：before(前) / after(后) / append(文章末尾)"),
	blockType: z
		.enum(["paragraph", "image", "mermaid", "chart", "heading", "blockquote"])
		.default("paragraph")
		.describe(
			"插入的块类型：paragraph(普通段落) / image(图片) / mermaid(架构/流程图) / chart(数据图表) / heading(小标题) / blockquote(引述)",
		),
	content: z
		.string()
		.describe(
			"要插入的具体内容。如果是图片可传入 URL 或 ![alt](url)；如果是 mermaid 可传入 mermaid 代码或 ```mermaid 代码块；如果是 chart 可传入图表 spec JSON 或 ```chart 代码块；如果是段落传入 Markdown 文本",
		),
	caption: z.string().optional().describe("可选的图片说明、图注或标题"),
	snapshotNote: z
		.string()
		.optional()
		.describe("写入前快照说明，默认「AI 插入内容前自动备份」"),
});
export type InsertDocumentBlockInput = z.input<
	typeof insertDocumentBlockInputSchema
>;

/**
 * Normalizes input block content into valid markdown based on its blockType.
 */
function formatBlockMarkdown(
	content: string,
	blockType: string,
	caption?: string,
): string {
	const raw = content.trim();
	if (blockType === "image") {
		const isMarkdownImg = /^!\[.*\]\(.+\)$/.test(raw);
		if (!isMarkdownImg) {
			const altText = caption || "插图";
			return `![${altText}](${raw})`;
		}
		return raw;
	}
	if (blockType === "mermaid") {
		return raw.startsWith("```mermaid") ? raw : `\`\`\`mermaid\n${raw}\n\`\`\``;
	}
	if (blockType === "chart") {
		return raw.startsWith("```chart") ? raw : `\`\`\`chart\n${raw}\n\`\`\``;
	}
	if (blockType === "heading" && !raw.startsWith("#")) {
		return `### ${raw}`;
	}
	if (blockType === "blockquote" && !raw.startsWith(">")) {
		return `> ${raw}`;
	}
	return raw;
}

export function executeInsertDocumentBlock(
	args: InsertDocumentBlockInput & { activeDocumentId?: number },
): ToolExecutionResult {
	const resolution = resolveTargetDocument(args, { actionName: "插入内容" });
	if (resolution.errorSummary || !resolution.doc) {
		return createToolResult(
			"insert_document_block",
			resolution.errorSummary ?? "插入失败：未指定 documentId 且当前无明确的活跃编辑文档。",
			false,
		);
	}

	const doc = resolution.doc;
	const blockType = args.blockType ?? "paragraph";
	const position = args.position ?? "after";

	// 1. Format raw content to valid Markdown based on blockType
	const rawMarkdown = formatBlockMarkdown(args.content, blockType, args.caption);
	const { nodes: newBlocks } = markdownToTiptapDoc(rawMarkdown);
	if (newBlocks.length === 0) {
		return createToolResult(
			"insert_document_block",
			"插入失败：解析后的内容为空。",
			false,
		);
	}

	// 2. Parse current document AST
	const docJson = parseDocumentAst(doc);
	if (!Array.isArray(docJson.content)) {
		docJson.content = [];
	}

	// 3. Locate insertion position by targetAnchor
	let anchorIndex = -1;
	const anchor = args.targetAnchor?.trim();
	if (anchor && position !== "append") {
		anchorIndex = docJson.content.findIndex((node) =>
			isBlockMatchingSnippet(node, anchor),
		);
	}

	if (anchorIndex !== -1) {
		const spliceIndex = position === "before" ? anchorIndex : anchorIndex + 1;
		docJson.content.splice(spliceIndex, 0, ...newBlocks);
	} else {
		// Append to end if anchor not found or position === 'append'
		docJson.content.push(...newBlocks);
	}

	// 4. Auto-snapshot and persist changes
	saveDocumentAstMutation({
		documentId: doc.id,
		previousContent: doc.content,
		docJson,
		snapshotNote: args.snapshotNote ?? `AI 插入${blockType}内容前自动备份`,
	});

	const locationDesc =
		anchorIndex !== -1
			? `在「${args.targetAnchor?.slice(0, 20)}…」${position === "before" ? "之前" : "之后"}`
			: "在文章末尾追加";

	return createToolResult(
		"insert_document_block",
		`✅ 已成功${locationDesc}插入 ${blockType} 内容，原文已更新！\n写入前已打版本快照，支持回滚。`,
		true,
	);
}

export const insertDocumentBlockToolDef = toolDefinition({
	metadata: { executionClass: "content-generating" },
	name: "insert_document_block",
	description:
		"在当前文档的指定位置（如某段话前/后或文末）精确插入新段落、插图、Mermaid 架构图/流程图、数据图表（chart）、小标题或引用。当用户要求配图、补充某段分析、加图表或插内容时必须调用此工具，绝不要调用 trigger_paragraph_rewrite 全篇重写！数据图表优先使用 generate_data_chart 工具。",
	inputSchema: insertDocumentBlockInputSchema,
});

