import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";
import { workbenchDb } from "../../db/sqlite.ts";
import type { ToolExecutionResult } from "./types";

export const deleteFolderInputSchema = z
	.object({
		folderName: z.string().describe("待删除的文件夹名称"),
		deleteBookmarks: z
			.boolean()
			.nullable()
			.optional()
			.describe(
				"是否连同文件夹内的书签一起删除。默认 false：书签移回未分类池，子文件夹提升到顶层",
			),
	})
	.passthrough();

export type DeleteFolderInput = z.infer<typeof deleteFolderInputSchema>;

/**
 * Pure execution function to delete a folder in SQLite
 */
export function executeDeleteFolder(
	args: DeleteFolderInput,
): ToolExecutionResult {
	const folderName = (args.folderName || "").trim();
	if (!folderName) {
		return {
			toolName: "delete_folder",
			summary: "删除文件夹失败：文件夹名称不能为空。",
			items: [],
			references: [],
			isMutation: false,
		};
	}

	const folder = workbenchDb
		.getAllFolders()
		.find((f) => f.name.trim().toLowerCase() === folderName.toLowerCase());
	if (!folder) {
		return {
			toolName: "delete_folder",
			summary: `删除文件夹失败：未找到文件夹「${folderName}」。`,
			items: [],
			references: [],
			isMutation: false,
		};
	}

	const itemCount = folder.items.length;

	if (args.deleteBookmarks) {
		workbenchDb.deleteItems(folder.items.map((item) => String(item.id)));
	}
	workbenchDb.deleteFolder(folder.id);

	return {
		toolName: "delete_folder",
		summary: args.deleteBookmarks
			? `已删除文件夹「${folder.name}」及其中的 ${itemCount} 个书签。`
			: `已删除文件夹「${folder.name}」，其中 ${itemCount} 个书签已移回未分类池，子文件夹已提升到顶层。`,
		items: [],
		references: [],
		isMutation: true,
	};
}

/**
 * Tool Definition for TanStack AI
 */
export const deleteFolderToolDef = toolDefinition({
	name: "delete_folder",
	description:
		"删除指定文件夹。默认只删除文件夹本身（书签移回未分类、子文件夹提升到顶层）；仅当用户明确要求连内容一起删除时才设置 deleteBookmarks=true。",
	inputSchema: deleteFolderInputSchema,
});
