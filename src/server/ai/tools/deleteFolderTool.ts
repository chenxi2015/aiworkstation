import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";
import { workbenchDb } from "../../db/sqlite.ts";
import type { ToolExecutionResult } from "./types";

export const deleteFolderInputSchema = z
	.object({
		folderName: z
			.string()
			.nullable()
			.optional()
			.describe("待删除的单个文件夹名称（单文件夹场景）"),
		folderNames: z
			.array(z.string())
			.nullable()
			.optional()
			.describe(
				"待批量删除的文件夹名称数组。当需要删除多个文件夹时必须使用此字段，一次性完成，严禁拆为多次单步调用",
			),
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
 * Pure execution function to delete single or batch folders in SQLite
 */
export function executeDeleteFolder(
	args: DeleteFolderInput,
): ToolExecutionResult {
	// 1. Normalize folder names into list
	const targetNames: string[] = [];
	if (Array.isArray(args.folderNames)) {
		targetNames.push(...args.folderNames.map((n) => (n || "").trim()));
	}
	if (args.folderName && typeof args.folderName === "string") {
		const singleName = args.folderName.trim();
		if (singleName && !targetNames.includes(singleName)) {
			targetNames.push(singleName);
		}
	}

	const validNames = Array.from(new Set(targetNames.filter(Boolean)));
	if (validNames.length === 0) {
		return {
			toolName: "delete_folder",
			summary: "删除文件夹失败：未指定有效的文件夹名称。",
			items: [],
			references: [],
			isMutation: false,
		};
	}

	const allFolders = workbenchDb.getAllFolders();
	const deletedNames: string[] = [];
	const missingNames: string[] = [];
	let totalBookmarksAffected = 0;

	for (const name of validNames) {
		const folder = allFolders.find(
			(f) => f.name.trim().toLowerCase() === name.toLowerCase(),
		);
		if (!folder) {
			missingNames.push(name);
			continue;
		}

		const itemCount = folder.items.length;
		totalBookmarksAffected += itemCount;

		if (args.deleteBookmarks) {
			workbenchDb.deleteItems(folder.items.map((item) => String(item.id)));
		}
		workbenchDb.deleteFolder(folder.id);
		deletedNames.push(folder.name);
	}

	if (deletedNames.length === 0) {
		return {
			toolName: "delete_folder",
			summary: `删除文件夹失败：未找到任何匹配的文件夹（${missingNames.join("、")}）。`,
			items: [],
			references: [],
			isMutation: false,
		};
	}

	// 2. Format result summary
	let summary = "";
	if (deletedNames.length === 1 && missingNames.length === 0) {
		const singleName = deletedNames[0];
		summary = args.deleteBookmarks
			? `已删除文件夹「${singleName}」及其中的 ${totalBookmarksAffected} 个书签。`
			: `已删除文件夹「${singleName}」，其中 ${totalBookmarksAffected} 个书签已移回未分类池，子文件夹已提升到顶层。`;
	} else {
		summary = args.deleteBookmarks
			? `已批量删除 ${deletedNames.length} 个文件夹（${deletedNames.map((n) => `「${n}」`).join("、")}）及其中的 ${totalBookmarksAffected} 个书签。`
			: `已批量删除 ${deletedNames.length} 个文件夹（${deletedNames.map((n) => `「${n}」`).join("、")}），共 ${totalBookmarksAffected} 个书签已移回未分类池，子文件夹已提升到顶层。`;
		if (missingNames.length > 0) {
			summary += `（另有 ${missingNames.length} 个未找到：${missingNames.join("、")}）`;
		}
	}

	return {
		toolName: "delete_folder",
		summary,
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
		"删除一个或多个文件夹。支持单个文件夹删除（folderName）或批量删除（folderNames）。默认保留书签（移回未分类池）并提升子文件夹；仅当明确要求连内容一起删除时才设置 deleteBookmarks=true。需要删除多个文件夹时必须使用 folderNames 数组一次性完成，严禁重复多次单步调用！",
	inputSchema: deleteFolderInputSchema,
});
