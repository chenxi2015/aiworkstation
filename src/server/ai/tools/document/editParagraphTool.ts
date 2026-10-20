import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";
import {
	type JSONContent,
	markdownToTiptapDoc,
} from "../../../../components/editor/markdown.ts";
import type { ToolExecutionResult } from "../types.ts";
import {
	createToolResult,
	parseDocumentAst,
	resolveTargetDocument,
	saveDocumentAstMutation,
} from "./documentHelper.ts";
import {
	applyParagraphReplacement,
	compactTextForMatching,
	extractBlockText,
	isBlockMatchingSnippet,
} from "./matching.ts";

export const editDocumentParagraphInputSchema = z.object({
	documentId: z
		.number()
		.optional()
		.describe("要修改段落的文档 ID。省略时自动定位当前活跃文档"),
	targetParagraphSnippet: z
		.string()
		.describe(
			"要修改的原段落关键文字特征或首句，用于定位目标段落（可带 Markdown 标记或纯文字）",
		),
	newParagraphContent: z
		.string()
		.describe("修改/润色后的新段落完整内容（Markdown 格式）"),
	reason: z.string().optional().describe("修改的理由或优化点说明"),
	snapshotNote: z
		.string()
		.optional()
		.describe("写入前快照说明，默认「AI 定向修改段落前自动备份」"),
});
export type EditDocumentParagraphInput = z.infer<
	typeof editDocumentParagraphInputSchema
>;

/**
 * Calculates how many subsequent contiguous blocks (e.g. trailing images)
 * are part of the target snippet to be replaced together.
 */
function calculateConsumedNodeCount(
	content: JSONContent[],
	startIndex: number,
	rawSnippet: string,
): number {
	let count = 1;
	const compSnippet = compactTextForMatching(rawSnippet);

	for (let j = startIndex + 1; j < content.length; j++) {
		const nextNode = content[j];
		if (nextNode.type === "image") {
			const src = (nextNode.attrs?.src as string) || "";
			if (src && rawSnippet.includes(src)) {
				count++;
				continue;
			}
		}
		const compNext = compactTextForMatching(extractBlockText(nextNode));
		if (compNext.length >= 4 && compSnippet.includes(compNext)) {
			count++;
			continue;
		}
		break;
	}

	return count;
}

export function executeEditDocumentParagraph(
	args: EditDocumentParagraphInput & { activeDocumentId?: number },
): ToolExecutionResult {
	const resolution = resolveTargetDocument(args, { actionName: "修改段落" });
	if (resolution.errorSummary || !resolution.doc) {
		return createToolResult(
			"edit_document_paragraph",
			resolution.errorSummary ?? "修改失败：未指定 documentId 且当前无明确的活跃编辑文档。",
			false,
		);
	}

	const doc = resolution.doc;
	const docJson = parseDocumentAst(doc);

	const rawSnippet = args.targetParagraphSnippet.trim();
	if (!rawSnippet || !docJson.content || docJson.content.length === 0) {
		return createToolResult(
			"edit_document_paragraph",
			"修改失败：未提供目标段落特征文字或当前文档为空。",
			false,
		);
	}

	const targetIndex = docJson.content.findIndex((node) =>
		isBlockMatchingSnippet(node, rawSnippet),
	);

	if (targetIndex === -1) {
		return createToolResult(
			"edit_document_paragraph",
			`未找到匹配「${rawSnippet.slice(0, 30)}…」的目标段落，请确认段落特征文字是否准确。`,
			false,
		);
	}

	const { nodes: replacementNodes } = markdownToTiptapDoc(
		args.newParagraphContent.trim(),
	);
	if (replacementNodes.length === 0) {
		return createToolResult(
			"edit_document_paragraph",
			"修改失败：替换后的段落内容为空。",
			false,
		);
	}

	// Consume contiguous nodes if the snippet spans across multiple blocks (e.g. trailing images)
	const countToReplace = calculateConsumedNodeCount(
		docJson.content,
		targetIndex,
		rawSnippet,
	);

	applyParagraphReplacement(
		docJson.content,
		targetIndex,
		rawSnippet,
		replacementNodes,
		countToReplace,
	);

	saveDocumentAstMutation({
		documentId: doc.id,
		previousContent: doc.content,
		docJson,
		snapshotNote: args.snapshotNote ?? "AI 定向修改段落前自动备份",
	});

	return createToolResult(
		"edit_document_paragraph",
		`✅ 已成功定向修改目标段落（ID: ${doc.id}）！${args.reason ? `\n优化说明：${args.reason}` : ""}\n写入前已自动打快照备份，可在版本历史中回滚。`,
		true,
	);
}

export const editDocumentParagraphToolDef = toolDefinition({
	metadata: { executionClass: "content-generating" },
	name: "edit_document_paragraph",
	description:
		"定向替换/润色/修改指定的一个段落。通过提供原段落的特征关键句定位，并仅替换该段落内容，绝不影响其他未修改段落。当用户要求微调、润色某特定段落时必须调用此工具，严禁触发 trigger_paragraph_rewrite 全篇重写！",
	inputSchema: editDocumentParagraphInputSchema,
});

