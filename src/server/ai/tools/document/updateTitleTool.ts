import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";
import { workbenchDb } from "../../../db/sqlite.ts";
import type { ToolExecutionResult } from "../types.ts";
import {
	createToolResult,
	resolveTargetDocument,
} from "./documentHelper.ts";

export const updateDocumentTitleInputSchema = z.object({
	documentId: z
		.number()
		.optional()
		.describe("要修改标题的文档 ID。省略时自动定位当前活跃文档"),
	newTitle: z
		.string()
		.min(1)
		.max(120)
		.describe("修改后的新标题（精炼、吸睛、符合文章受众心理）"),
	reason: z
		.string()
		.optional()
		.describe("修改理由或受众切入点说明（如：更具悬念感与创作传播度）"),
});
export type UpdateDocumentTitleInput = z.infer<
	typeof updateDocumentTitleInputSchema
>;

export function executeUpdateDocumentTitle(
	args: UpdateDocumentTitleInput & { activeDocumentId?: number },
): ToolExecutionResult {
	const trimmedTitle = args.newTitle.trim();
	if (!trimmedTitle) {
		return createToolResult(
			"update_document_title",
			"修改标题失败：新标题不能为空。",
			false,
		);
	}

	const resolution = resolveTargetDocument(args, { actionName: "修改标题" });
	if (resolution.errorSummary || !resolution.doc) {
		return createToolResult(
			"update_document_title",
			resolution.errorSummary ?? "无法修改标题。",
			false,
		);
	}

	const doc = resolution.doc;
	const oldTitle = doc.title;
	workbenchDb.updateDocument(doc.id, { title: trimmedTitle });

	return createToolResult(
		"update_document_title",
		`✅ 已成功将文档（ID: ${doc.id}）的标题从《${oldTitle}》更新为《${trimmedTitle}》${args.reason ? `\n修改理由：${args.reason}` : ""}`,
		true,
	);
}

export const updateDocumentTitleToolDef = toolDefinition({
	metadata: { executionClass: "global-headless" },
	name: "update_document_title",
	description:
		"修改当前创作文档或指定文档的标题。当用户要求修改标题、或者要求头脑风暴并应用最优标题时调用。省略 documentId 时自动定位当前正在编辑的活跃文档。",
	inputSchema: updateDocumentTitleInputSchema,
});

