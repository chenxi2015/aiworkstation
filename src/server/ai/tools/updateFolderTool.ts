import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";
import { workbenchDb } from "../../db/sqlite.ts";
import type { ToolExecutionResult } from "./types";

export const updateFolderInputSchema = z
	.object({
		folderName: z.string().describe("当前待修改的文件夹名称"),
		newName: z.string().nullable().optional().describe("修改后的新文件夹名称"),
		newCategory: z
			.string()
			.nullable()
			.optional()
			.describe("修改后的新所属分类"),
		newDesc: z.string().nullable().optional().describe("修改后的新描述"),
		newColor: z
			.string()
			.nullable()
			.optional()
			.describe("修改后的新主题颜色 Hex 代码，例如 '#4f46e5'"),
	})
	.passthrough();

export type UpdateFolderInput = z.infer<typeof updateFolderInputSchema>;

/**
 * Pure execution function to update folder metadata in SQLite
 */
export function executeUpdateFolder(
	args: UpdateFolderInput,
): ToolExecutionResult {
	const { folderName, newName, newCategory, newDesc, newColor } = args;
	const cleanStr = (s?: string | null) =>
		s && s !== "null" && s !== "undefined" ? s.trim() : undefined;
	const nameTrimmed = cleanStr(folderName) || "";

	const allFolders = workbenchDb.getAllFolders();
	const folder = allFolders.find(
		(f) => f.name.toLowerCase() === nameTrimmed.toLowerCase(),
	);

	if (!folder) {
		return {
			toolName: "update_folder",
			summary: `未找到名称为「${nameTrimmed}」的文件夹。`,
			items: [],
			references: [],
			isMutation: false,
		};
	}

	const updatedName = newName?.trim() || folder.name;
	const updatedCategory = newCategory?.trim() || folder.category;
	const updatedDesc =
		newDesc !== undefined && newDesc !== null ? newDesc : folder.desc || "";
	const updatedColor =
		newColor && newColor !== "null" && newColor !== "undefined"
			? newColor
			: folder.color || undefined;

	workbenchDb.updateFolder(
		folder.id,
		updatedName,
		updatedCategory,
		updatedDesc,
		updatedColor,
	);

	return {
		toolName: "update_folder",
		summary: `已成功更新文件夹（ID: ${folder.id}）信息：名称「${updatedName}」，所属分类「${updatedCategory}」${updatedDesc ? `，描述「${updatedDesc}」` : ""}。`,
		items: [],
		references: [],
		isMutation: true,
	};
}

/**
 * Tool Definition for TanStack AI
 */
export const updateFolderToolDef = toolDefinition({
	name: "update_folder",
	description: "修改已有文件夹的名称、所属分类或描述信息。",
	inputSchema: updateFolderInputSchema,
});
