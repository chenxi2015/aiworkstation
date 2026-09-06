import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";
import { workbenchDb } from "../../db/sqlite.ts";
import type { ToolExecutionResult } from "./types.ts";

export const moveFolderInputSchema = z
	.object({
		folderName: z
			.string()
			.nullable()
			.optional()
			.describe("待移动的单个文件夹名称（单文件夹场景）"),
		folderNames: z
			.array(z.string())
			.nullable()
			.optional()
			.describe(
				"待批量移动的文件夹名称数组。当需要将多个文件夹同时移入同一父文件夹或分类时必须使用此字段，严禁重复多次单步调用",
			),
		targetCategory: z
			.string()
			.nullable()
			.optional()
			.describe(
				"目标分类名称（例如「工作台」、「自媒体」、「电商」、「学习」等）。当希望将文件夹移动到导航分类（特别是移到「工作台」开始工作，或批量归类）时传入",
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
 * Pure execution function to nest / un-nest single or batch folders in SQLite
 */
export function executeMoveFolder(args: MoveFolderInput): ToolExecutionResult {
	// 1. Gather all folder names
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
			toolName: "move_folder",
			summary: "移动文件夹失败：未指定有效的文件夹名称。",
			items: [],
			references: [],
			isMutation: false,
		};
	}

	const targetCategory = (args.targetCategory || "").trim();
	const rawTarget = (args.targetParentFolderName || "").trim();
	const allFolders = workbenchDb.getAllFolders();

	const toTopLevel =
		!rawTarget ||
		rawTarget === "null" ||
		rawTarget === "undefined" ||
		["顶层", "根目录", "top", "root"].includes(rawTarget.toLowerCase());

	// Resolve target parent if not moving to top-level and not pure category move
	let targetParentFolder: ReturnType<typeof findFolderByName> | undefined;
	if (!targetCategory && !toTopLevel) {
		targetParentFolder = findFolderByName(rawTarget);
		if (!targetParentFolder) {
			return {
				toolName: "move_folder",
				summary: `移动文件夹失败：未找到目标父文件夹「${rawTarget}」。`,
				items: [],
				references: [],
				isMutation: false,
			};
		}
	}

	const movedNames: string[] = [];
	const skippedNames: string[] = [];
	const failedReasons: string[] = [];

	for (const name of validNames) {
		const folder = allFolders.find(
			(f) => f.name.trim().toLowerCase() === name.toLowerCase(),
		);
		if (!folder) {
			skippedNames.push(name);
			continue;
		}

		// Case A: Move to Category
		if (targetCategory) {
			if (
				folder.category === targetCategory &&
				(folder.parentId ?? null) === null
			) {
				skippedNames.push(folder.name);
				continue;
			}
			workbenchDb.moveFolderToCategory(folder.id, targetCategory);
			movedNames.push(folder.name);
			continue;
		}

		// Case B: Move to top-level
		if (toTopLevel) {
			if ((folder.parentId ?? null) === null) {
				skippedNames.push(folder.name);
				continue;
			}
			workbenchDb.moveFolder(folder.id, null);
			movedNames.push(folder.name);
			continue;
		}

		// Case C: Move into parent folder
		if (targetParentFolder) {
			if ((folder.parentId ?? null) === targetParentFolder.id) {
				skippedNames.push(folder.name);
				continue;
			}
			try {
				workbenchDb.moveFolder(folder.id, targetParentFolder.id);
				movedNames.push(folder.name);
			} catch (err) {
				failedReasons.push(
					`「${folder.name}」: ${err instanceof Error ? err.message : "无法移动"}`,
				);
			}
		}
	}

	if (movedNames.length === 0 && skippedNames.length > 0) {
		return {
			toolName: "move_folder",
			summary: `所选文件夹（${skippedNames.map((n) => `「${n}」`).join("、")}）已处于目标位置，无需移动。`,
			items: [],
			references: [],
			isMutation: false,
		};
	}

	let summary = "";
	if (targetCategory) {
		summary = `已成功将 ${movedNames.length} 个文件夹（${movedNames.map((n) => `「${n}」`).join("、")}）移入「${targetCategory}」分类。`;
	} else if (toTopLevel) {
		summary = `已成功将 ${movedNames.length} 个文件夹（${movedNames.map((n) => `「${n}」`).join("、")}）移出到顶层。`;
	} else if (targetParentFolder) {
		summary = `已成功将 ${movedNames.length} 个文件夹（${movedNames.map((n) => `「${n}」`).join("、")}）移入「${targetParentFolder.name}」。`;
	}

	if (skippedNames.length > 0) {
		summary += `（${skippedNames.length} 个原本已在目标位置）`;
	}
	if (failedReasons.length > 0) {
		summary += `；失败提示：${failedReasons.join("; ")}`;
	}

	return {
		toolName: "move_folder",
		summary,
		items: [],
		references: [],
		isMutation: movedNames.length > 0,
	};
}

/**
 * Tool Definition for TanStack AI
 */
export const moveFolderToolDef = toolDefinition({
	name: "move_folder",
	description:
		"移动单个或批量文件夹。支持：1. 把一个或多个文件夹（folderNames）移动到指定导航分类（尤其是移到「工作台」开启当前工作，或归类到其他领域）；2. 把多个文件夹同时移入另一个文件夹（建立嵌套父子分组，如统一移入「大前端」）；3. 把嵌套文件夹移回分类顶层。需要移动多个文件夹时必须使用 folderNames 数组一次性完成，严禁重复多次单步调用！",
	inputSchema: moveFolderInputSchema,
});
