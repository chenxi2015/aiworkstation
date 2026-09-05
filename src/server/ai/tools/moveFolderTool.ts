import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";
import { workbenchDb } from "../../db/sqlite.ts";
import type { ToolExecutionResult } from "./types";

export const moveFolderInputSchema = z
	.object({
		folderName: z.string().describe("待移动的文件夹名称"),
		targetCategory: z
			.string()
			.nullable()
			.optional()
			.describe(
				"目标分类名称（例如「工作台」、「自媒体」、「电商」、「学习」等）。当用户希望把文件夹移动到导航分类（特别是移动到「工作台」开始工作，或者归类到其他领域）时传入",
			),
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
 * Pure execution function to nest / un-nest a folder or move into a category/workbench in SQLite
 */
export function executeMoveFolder(args: MoveFolderInput): ToolExecutionResult {
	const folderName = (args.folderName || "").trim();
	const targetCategory = (args.targetCategory || "").trim();
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

	// 1. Move to a target category (e.g. "工作台" to start focused work)
	if (targetCategory) {
		if (
			folder.category === targetCategory &&
			(folder.parentId ?? null) === null
		) {
			return {
				toolName: "move_folder",
				summary:
					targetCategory === "工作台"
						? `文件夹「${folder.name}」当前已位于「工作台」中，随时可以开展工作。`
						: `文件夹「${folder.name}」已经位于「${targetCategory}」分类顶层。`,
				items: [],
				references: [],
				isMutation: false,
			};
		}
		workbenchDb.moveFolderToCategory(folder.id, targetCategory);
		return {
			toolName: "move_folder",
			summary:
				targetCategory === "工作台"
					? `已成功将文件夹「${folder.name}」移入「工作台」桌面，您可以直接在工作台开始该项工作！`
					: `已成功将文件夹「${folder.name}」移动到「${targetCategory}」分类。`,
			items: [],
			references: [],
			isMutation: true,
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
		"移动文件夹。支持：1. 把文件夹移动到指定导航分类（尤其是移动到「工作台」开启当前专注工作，或归类到其他分类）；2. 把一个文件夹移入另一个文件夹（建立嵌套父子分组）；3. 把嵌套文件夹移回分类顶层。",
	inputSchema: moveFolderInputSchema,
});
