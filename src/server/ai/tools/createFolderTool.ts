import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";
import { workbenchDb } from "../../db/sqlite.ts";
import type { ToolExecutionResult } from "./types.ts";

export const createFolderInputSchema = z
	.object({
		name: z
			.string()
			.nullable()
			.optional()
			.describe("文件夹名称（单文件夹场景），例如：'AI 剪辑工具库'、'小红书爆款文案'"),
		folderName: z
			.string()
			.nullable()
			.optional()
			.describe("文件夹名称别名（与 name 作用相同）"),
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
		description: z
			.string()
			.nullable()
			.optional()
			.describe("描述别名（与 desc 作用相同）"),
		color: z
			.string()
			.nullable()
			.optional()
			.describe("文件夹主题颜色 Hex 代码，例如 '#4f46e5'"),
		folders: z
			.array(
				z.object({
					name: z.string().describe("文件夹名称"),
					category: z
						.string()
						.nullable()
						.optional()
						.describe("所属大分类，默认'工作台'"),
					desc: z
						.string()
						.nullable()
						.optional()
						.describe("主题说明或用途描述"),
					description: z
						.string()
						.nullable()
						.optional()
						.describe("描述别名"),
					color: z.string().nullable().optional().describe("颜色标识"),
				}),
			)
			.nullable()
			.optional()
			.describe(
				"批量创建文件夹列表。当需要一次性创建多个文件夹时必须优先使用此字段，严禁拆为多次单步调用",
			),
	})
	.passthrough();

export type CreateFolderInput = z.infer<typeof createFolderInputSchema>;

/**
 * Pure execution function to create single or batch folders in SQLite
 */
export function executeCreateFolder(
	args: CreateFolderInput,
): ToolExecutionResult {
	// 1. Gather all folder specifications
	interface FolderSpec {
		name: string;
		category: string;
		desc: string;
		color?: string;
	}

	const specs: FolderSpec[] = [];

	if (Array.isArray(args.folders) && args.folders.length > 0) {
		for (const f of args.folders) {
			const n = (f.name || "").trim();
			if (!n) continue;
			const cat =
				f.category && f.category !== "null" && f.category !== "undefined"
					? f.category.trim()
					: "工作台";
			const d = (f.desc || f.description || "").trim();
			const c = f.color ? f.color.trim() : undefined;
			specs.push({ name: n, category: cat, desc: d, color: c });
		}
	}

	const singleName = (args.name || args.folderName || "").trim();
	if (singleName && !specs.some((s) => s.name.toLowerCase() === singleName.toLowerCase())) {
		const singleCat =
			args.category && args.category !== "null" && args.category !== "undefined"
				? args.category.trim()
				: "工作台";
		const singleDesc = (args.desc || args.description || "").trim();
		const singleColor = args.color ? args.color.trim() : undefined;
		specs.push({
			name: singleName,
			category: singleCat,
			desc: singleDesc,
			color: singleColor,
		});
	}

	if (specs.length === 0) {
		return {
			toolName: "create_folder",
			summary: "创建文件夹失败：文件夹名称不能为空。",
			items: [],
			references: [],
			isMutation: false,
		};
	}

	const allFolders = workbenchDb.getAllFolders();
	const createdList: Array<{ name: string; category: string; id: number }> = [];
	const existedList: Array<{ name: string; category: string; id: number }> = [];

	for (const spec of specs) {
		const existing = allFolders.find(
			(f) => f.name.toLowerCase() === spec.name.toLowerCase(),
		);
		if (existing) {
			existedList.push({
				name: existing.name,
				category: existing.category,
				id: existing.id,
			});
			continue;
		}

		const created = workbenchDb.createFolder(
			spec.name,
			spec.category,
			spec.desc || `${spec.name} 主题资产库`,
			spec.color,
		);
		createdList.push({
			name: created.name,
			category: created.category,
			id: created.id,
		});
		// Update cache so subsequent items in the same batch can detect conflicts
		allFolders.push(created);
	}

	if (createdList.length === 0 && existedList.length > 0) {
		const names = existedList.map((e) => `「${e.name}」`).join("、");
		return {
			toolName: "create_folder",
			summary: `文件夹 ${names} 均已存在，无需重复创建。`,
			items: [],
			references: [],
			isMutation: false,
		};
	}

	// Format output summary
	let summary = "";
	if (createdList.length === 1 && existedList.length === 0) {
		const c = createdList[0];
		summary = `成功在 SQLite 数据库中创建新文件夹「${c.name}」（所属分类：${c.category}，ID：${c.id}）。`;
	} else {
		const names = createdList.map((c) => `「${c.name}」(${c.category})`).join("、");
		summary = `成功批量创建 ${createdList.length} 个文件夹：${names}。`;
		if (existedList.length > 0) {
			summary += `（另有 ${existedList.length} 个已存在略过：${existedList.map((e) => `「${e.name}」`).join("、")}）`;
		}
	}

	return {
		toolName: "create_folder",
		summary,
		items: [],
		references: [],
		isMutation: createdList.length > 0,
	};
}

/**
 * Tool Definition for TanStack AI
 */
export const createFolderToolDef = toolDefinition({
	name: "create_folder",
	description:
		"在本地 SQLite 数据库中创建单个或批量主题文件夹。支持单个创建（name）或批量创建（folders: [{name, category?, desc?}]）。当需要同时创建多个文件夹时必须使用 folders 数组一次性完成，严禁重复多次单步调用！",
	inputSchema: createFolderInputSchema,
});
