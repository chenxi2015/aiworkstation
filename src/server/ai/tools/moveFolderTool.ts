import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";
import { workbenchDb } from "../../db/sqlite.ts";
import type { ToolExecutionResult } from "./types";

export const moveFolderInputSchema = z
	.object({
		folderName: z.string().describe("待移动的文件夹名称"),
		targetParentFolderName: z
			.string()
			.nullable()
			.optional()
			.describe(
				"目标父文件夹名称。传 null、空字符串或「顶层」表示移动到分类顶层（不再嵌套）",
			),
	})
	.passthrough();

export type MoveFolderInput = z.infer<typeof moveFolderInputSchema>;

function findFolderByName(name: string) {
	const trimmed = name.trim().toLowerCase();
	return workbenchDb
		.getAllFolders()
		.find((f) => f.name.trim().toLowerCase() === trimmed);
}

/**
 * Pure execution function to nest / un-nest a folder in SQLite
 */
export function executeMoveFolder(args: MoveFolderInput): ToolExecutionResult {
	const folderName = (args.folderName || "").trim();
	const rawTarget = (args.targetParentFolderName || "").trim();

	if (!folderName) {
		return {
			toolName: "move_folder",
			summary: "移动文件夹失败：文件夹名称不能为空。",
			items: [],
			references: [],
			isMutation: false,
		};
	}

	const folder = findFolderByName(folderName);
	if (!folder) {
		return {
			toolName: "move_folder",
			summary: `移动文件夹失败：未找到名为「${folderName}」的文件夹。`,
			items: [],
			references: [],
			isMutation: false,
		};
	}

	// Move to top-level of its category
	const toTopLevel =
		!rawTarget ||
		rawTarget === "null" ||
		rawTarget === "undefined" ||
		["顶层", "根目录", "top", "root"].includes(rawTarget.toLowerCase());

	if (toTopLevel) {
		if ((folder.parentId ?? null) === null) {
			return {
				toolName: "move_folder",
				summary: `文件夹「${folder.name}」已经位于分类顶层，无需移动。`,
				items: [],
				references: [],
				isMutation: false,
			};
		}
		workbenchDb.moveFolder(folder.id, null);
		return {
			toolName: "move_folder",
			summary: `已将文件夹「${folder.name}」移出到「${folder.category}」分类顶层。`,
			items: [],
			references: [],
			isMutation: true,
		};
	}

	const targetParent = findFolderByName(rawTarget);
	if (!targetParent) {
		return {
			toolName: "move_folder",
			summary: `移动文件夹失败：未找到目标父文件夹「${rawTarget}」。`,
			items: [],
			references: [],
			isMutation: false,
		};
	}

	if ((folder.parentId ?? null) === targetParent.id) {
		return {
			toolName: "move_folder",
			summary: `文件夹「${folder.name}」已经在「${targetParent.name}」内，无需移动。`,
			items: [],
			references: [],
			isMutation: false,
		};
	}

	try {
		workbenchDb.moveFolder(folder.id, targetParent.id);
	} catch (err) {
		return {
			toolName: "move_folder",
			summary: `移动文件夹失败：${err instanceof Error ? err.message : "未知错误"}（不能把文件夹移入它自己或它的子文件夹）。`,
			items: [],
			references: [],
			isMutation: false,
		};
	}

	const categoryNote =
		folder.category !== targetParent.category
			? `（同时归入「${targetParent.category}」分类）`
			: "";

	return {
		toolName: "move_folder",
		summary: `已将文件夹「${folder.name}」移入「${targetParent.name}」${categoryNote}。`,
		items: [],
		references: [],
		isMutation: true,
	};
}

/**
 * Tool Definition for TanStack AI
 */
export const moveFolderToolDef = toolDefinition({
	name: "move_folder",
	description:
		"把一个文件夹移入另一个文件夹（建立嵌套分组），或把嵌套文件夹移回分类顶层。当用户要求调整文件夹层级、合并分组、建立父子分组时调用此工具。不能移入自身或其子文件夹。",
	inputSchema: moveFolderInputSchema,
});
