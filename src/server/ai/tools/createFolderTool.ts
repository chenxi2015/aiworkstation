import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";
import { workbenchDb } from "../../db/sqlite.ts";
import type { ToolExecutionResult } from "./types";

export const createFolderInputSchema = z
	.object({
		name: z
			.string()
			.describe("文件夹名称，例如：'AI 剪辑工具库'、'小红书爆款文案'"),
		category: z
			.string()
			.nullable()
			.optional()
			.describe(
				"所属工作台大分类（如：工作台、自媒体、技能、电商、收藏等），默认'工作台'",
			),
		desc: z
			.string()
			.nullable()
			.optional()
			.describe("文件夹主题说明或使用场景描述"),
		color: z
			.string()
			.nullable()
			.optional()
			.describe("文件夹主题颜色 Hex 代码，例如 '#4f46e5'"),
	})
	.passthrough();

export type CreateFolderInput = z.infer<typeof createFolderInputSchema>;

/**
 * Pure execution function to create folder in SQLite
 */
export function executeCreateFolder(
	args: CreateFolderInput,
): ToolExecutionResult {
	const { name, category, desc = "", color } = args;
	const trimmedName = (name || "").trim();
	const effectiveCategory =
		category && category !== "null" && category !== "undefined"
			? category.trim()
			: "工作台";
	const effectiveDesc =
		desc && desc !== "null" && desc !== "undefined" ? desc.trim() : "";
	const effectiveColor =
		color && color !== "null" && color !== "undefined"
			? color.trim()
			: undefined;

	if (!trimmedName) {
		return {
			toolName: "create_folder",
			summary: "创建文件夹失败：文件夹名称不能为空。",
			items: [],
			references: [],
			isMutation: false,
		};
	}

	const allFolders = workbenchDb.getAllFolders();
	const existing = allFolders.find(
		(f) => f.name.toLowerCase() === trimmedName.toLowerCase(),
	);

	if (existing) {
		return {
			toolName: "create_folder",
			summary: `文件夹「${existing.name}」已存在（分类：${existing.category}，ID：${existing.id}），无需重复创建。`,
			items: [],
			references: [],
			isMutation: false,
		};
	}

	const created = workbenchDb.createFolder(
		trimmedName,
		effectiveCategory,
		effectiveDesc || `${trimmedName} 主题资产库`,
		effectiveColor,
	);

	return {
		toolName: "create_folder",
		summary: `成功在 SQLite 数据库中创建新文件夹「${created.name}」（所属分类：${created.category}，ID：${created.id}）。`,
		items: [],
		references: [],
		isMutation: true,
	};
}

/**
 * Tool Definition for TanStack AI
 */
export const createFolderToolDef = toolDefinition({
	name: "create_folder",
	description:
		"在本地 SQLite 数据库中创建新的主题文件夹。当用户要求新建文件夹、为某批内容建立新分组时调用此工具。",
	inputSchema: createFolderInputSchema,
});
