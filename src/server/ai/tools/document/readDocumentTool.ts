import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";
import { tiptapJsonToMarkdown } from "../../../../components/editor/markdown.ts";
import type { ToolExecutionResult } from "../types.ts";
import {
	createToolResult,
	resolveTargetDocument,
} from "./documentHelper.ts";

export const readDocumentInputSchema = z.object({
	documentId: z
		.number()
		.optional()
		.describe(
			"要读取的文档 id。省略时读取当前活跃文档（由调用方注入 activeDocumentId 上下文）",
		),
});
export type ReadDocumentInput = z.infer<typeof readDocumentInputSchema>;

export function executeReadDocument(
	args: ReadDocumentInput & { activeDocumentId?: number },
): ToolExecutionResult {
	const resolution = resolveTargetDocument(args, {
		actionName: "读取文档",
		provideSuggestionsOnMultiple: true,
	});

	if (resolution.errorSummary || !resolution.doc) {
		return createToolResult(
			"read_document",
			resolution.errorSummary ?? "无法读取文档。",
		);
	}

	const doc = resolution.doc;
	let markdownContent = "";
	if (doc.content) {
		try {
			const parsed = JSON.parse(doc.content);
			markdownContent = tiptapJsonToMarkdown(parsed);
		} catch {
			markdownContent = doc.contentText || "";
		}
	} else {
		markdownContent = doc.contentText || "";
	}

	const wordCount = doc.contentText?.length ?? markdownContent.length;

	const summary = `## 文档「${doc.title}」\n- **状态**: ${doc.status}  **风格**: ${doc.stylePreset || "无"}\n- **字数**: ${wordCount} 字  **更新**: ${doc.updatedAt ?? "-"}\n\n### 完整正文（含图片/视频标记）\n${markdownContent || "(空文档)"}`;

	return createToolResult("read_document", summary, false);
}

export const readDocumentToolDef = toolDefinition({
	metadata: { executionClass: "global-headless" },
	name: "read_document",
	description:
		"读取创作模块中的某个文档（纯文本正文 + 元数据）。省略 documentId 时读取当前正在编辑的文档。可用于分析文档结构、字数统计、内容理解。",
	inputSchema: readDocumentInputSchema,
});

