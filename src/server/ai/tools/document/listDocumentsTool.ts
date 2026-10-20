import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";
import { workbenchDb } from "../../../db/sqlite.ts";
import type { ToolExecutionResult } from "../types.ts";
import { createToolResult } from "./documentHelper.ts";

export const listDocumentsInputSchema = z.object({
	keyword: z
		.string()
		.optional()
		.describe("按标题或正文关键词模糊搜索，省略时返回全部文档"),
	status: z
		.enum(["editing", "finalized", "archived"])
		.optional()
		.describe("按状态过滤：editing / finalized / archived"),
	limit: z.number().optional().describe("返回数量上限，默认 20"),
});
export type ListDocumentsInput = z.infer<typeof listDocumentsInputSchema>;

export function executeListDocuments(
	args: ListDocumentsInput,
): ToolExecutionResult {
	const allDocs = workbenchDb.listDocuments(args.status === "archived");
	const limit = args.limit ?? 20;

	let filtered = allDocs;
	if (args.status && args.status !== "archived") {
		filtered = filtered.filter((d) => d.status === args.status);
	}
	if (args.keyword) {
		const kw = args.keyword.toLowerCase();
		filtered = filtered.filter(
			(d) =>
				d.title.toLowerCase().includes(kw) ||
				d.contentText?.toLowerCase().includes(kw),
		);
	}
	filtered = filtered.slice(0, limit);

	if (filtered.length === 0) {
		return createToolResult("list_documents", "未找到匹配的文档。", false);
	}

	const listText = filtered
		.map(
			(d, i) =>
				`${i + 1}. 《${d.title}》(ID: ${d.id}) — ${d.status} — ${d.contentText?.length ?? 0} 字 — ${d.updatedAt ?? "-"}`,
		)
		.join("\n");

	return createToolResult(
		"list_documents",
		`共找到 ${filtered.length} 篇文档：\n${listText}`,
		false,
	);
}

export const listDocumentsToolDef = toolDefinition({
	metadata: { executionClass: "global-headless" },
	name: "list_documents",
	description:
		"列出或搜索创作模块中的文档。支持按标题/正文关键词模糊搜索、按状态（editing/finalized/archived）过滤。",
	inputSchema: listDocumentsInputSchema,
});

