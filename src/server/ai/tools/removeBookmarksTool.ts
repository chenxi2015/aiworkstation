import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";
import type { WorkbenchItem } from "../../../components/workbench/types";
import { workbenchDb } from "../../db/sqlite.ts";
import type { ToolExecutionResult } from "./types";

export const removeBookmarksInputSchema = z
	.object({
		folderName: z.string().describe("要从中移出书签的文件夹名称"),
		itemIds: z
			.array(z.string())
			.nullable()
			.optional()
			.describe("待移出的书签 ID 数组（如果有准确 ID）"),
		itemNamesOrUrls: z
			.array(z.string())
			.nullable()
			.optional()
			.describe("待移出的书签标题或 URL 关键词数组（模糊匹配）"),
		removeAll: z
			.boolean()
			.nullable()
			.optional()
			.describe("是否移出该文件夹的全部书签，默认 false"),
	})
	.passthrough();

export type RemoveBookmarksInput = z.infer<typeof removeBookmarksInputSchema>;

/**
 * Pure execution function to move bookmarks out of a folder (back to unclassified)
 */
export function executeRemoveBookmarks(
	args: RemoveBookmarksInput,
): ToolExecutionResult {
	const folderName = (args.folderName || "").trim();
	if (!folderName) {
		return {
			toolName: "remove_bookmarks_from_folder",
			summary: "移出书签失败：文件夹名称不能为空。",
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
			toolName: "remove_bookmarks_from_folder",
			summary: `移出书签失败：未找到文件夹「${folderName}」。`,
			items: [],
			references: [],
			isMutation: false,
		};
	}

	let targets: WorkbenchItem[];
	if (args.removeAll) {
		targets = folder.items;
	} else {
		const ids = new Set((args.itemIds || []).map(String));
		const keywords = (args.itemNamesOrUrls || [])
			.map((k) => k.trim().toLowerCase())
			.filter(Boolean);
		targets = folder.items.filter((item) => {
			if (ids.has(String(item.id))) return true;
			return keywords.some(
				(kw) =>
					item.name.toLowerCase().includes(kw) ||
					(item.url || "").toLowerCase().includes(kw),
			);
		});
	}

	if (targets.length === 0) {
		return {
			toolName: "remove_bookmarks_from_folder",
			summary: `在文件夹「${folder.name}」中未找到需要移出的书签，请确认书签 ID 或名称。`,
			items: [],
			references: [],
			isMutation: false,
		};
	}

	for (const item of targets) {
		workbenchDb.moveItem(String(item.id), folder.id, null);
	}

	const namesList = targets
		.slice(0, 5)
		.map((m) => `《${m.name}》`)
		.join("、");
	const suffix = targets.length > 5 ? ` 等 ${targets.length} 个书签` : "";

	return {
		toolName: "remove_bookmarks_from_folder",
		summary: `已将 ${namesList}${targets.length > 5 ? suffix : ""}从文件夹「${folder.name}」移出到未分类。`,
		items: targets,
		references: [],
		isMutation: true,
	};
}

/**
 * Tool Definition for TanStack AI
 */
export const removeBookmarksFromFolderToolDef = toolDefinition({
	name: "remove_bookmarks_from_folder",
	description:
		"把书签从指定文件夹中移出（回到未分类池）。支持按书签 ID、名称/URL 关键词批量移出，或 removeAll 清空整个文件夹。当用户要求把某些链接移出分组、解散文件夹内容时调用此工具。",
	inputSchema: removeBookmarksInputSchema,
});
