import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";
import { workbenchDb } from "../../db/sqlite.ts";
import type { ToolExecutionResult } from "./types.ts";

export const mergeFoldersInputSchema = z
	.object({
		sourceFolderNames: z
			.array(z.string())
			.describe(
				"待合并归集的源文件夹名称列表（例如：['React组件库', '重要的react组件库', '前端学习']）",
			),
		targetFolderName: z
			.string()
			.describe("合并汇集的目标文件夹名称（例如：'前端生态大全'）"),
		targetCategory: z
			.string()
			.nullable()
			.optional()
			.describe(
				"目标文件夹所属大分类（若目标文件夹尚不存在需自动创建时生效，默认'工作台'）",
			),
		deleteSourceFolders: z
			.boolean()
			.nullable()
			.optional()
			.describe(
				"合并完成后是否自动删除源文件夹（避免留下空壳目录）。默认 true",
			),
	})
	.passthrough();

export type MergeFoldersInput = z.infer<typeof mergeFoldersInputSchema>;

/**
 * Pure execution function to consolidate multiple source folders into a single target folder
 */
export function executeMergeFolders(
	args: MergeFoldersInput,
): ToolExecutionResult {
	const sourceNames = (args.sourceFolderNames || [])
		.map((n) => (n || "").trim())
		.filter(Boolean);
	const targetName = (args.targetFolderName || "").trim();
	const deleteSources = args.deleteSourceFolders !== false;

	if (!targetName) {
		return {
			toolName: "merge_folders",
			summary: "合并文件夹失败：目标文件夹名称不能为空。",
			items: [],
			references: [],
			isMutation: false,
		};
	}

	if (sourceNames.length === 0) {
		return {
			toolName: "merge_folders",
			summary: "合并文件夹失败：请至少提供一个源文件夹名称。",
			items: [],
			references: [],
			isMutation: false,
		};
	}

	const allFolders = workbenchDb.getAllFolders();

	// 1. Locate or create target folder
	let targetFolder = allFolders.find(
		(f) => f.name.trim().toLowerCase() === targetName.toLowerCase(),
	);
	let createdTarget = false;

	if (!targetFolder) {
		const category =
			args.targetCategory &&
			args.targetCategory !== "null" &&
			args.targetCategory !== "undefined"
				? args.targetCategory.trim()
				: "工作台";
		targetFolder = workbenchDb.createFolder(
			targetName,
			category,
			`${targetName} 归集整理库`,
		);
		createdTarget = true;
	}

	// 2. Identify source folders (excluding target folder itself)
	const matchedSources: typeof allFolders = [];
	const missingSources: string[] = [];

	for (const name of sourceNames) {
		if (name.toLowerCase() === targetFolder.name.toLowerCase()) {
			continue;
		}
		const folder = allFolders.find(
			(f) => f.name.trim().toLowerCase() === name.toLowerCase(),
		);
		if (folder) {
			matchedSources.push(folder);
		} else {
			missingSources.push(name);
		}
	}

	if (matchedSources.length === 0) {
		return {
			toolName: "merge_folders",
			summary: `合并文件夹失败：未找到任何有效的源文件夹（未找到：${missingSources.join("、")}）。`,
			items: [],
			references: [],
			isMutation: createdTarget,
		};
	}

	// 3. Collect bookmarks from source folders and migrate them to target folder
	let migratedBookmarksCount = 0;
	const existingTargetItemIds = new Set(
		targetFolder.items.map((i) => String(i.id)),
	);

	for (const src of matchedSources) {
		for (const item of src.items) {
			const itemId = String(item.id);
			if (!existingTargetItemIds.has(itemId)) {
				workbenchDb.linkItemToFolder(itemId, targetFolder.id);
				existingTargetItemIds.add(itemId);
				migratedBookmarksCount++;
			}
		}
	}

	// 4. Optionally clean up source folders
	const deletedSourceNames: string[] = [];
	if (deleteSources) {
		for (const src of matchedSources) {
			workbenchDb.deleteFolder(src.id);
			deletedSourceNames.push(src.name);
		}
	}

	// 5. Build clean outcome summary
	const sourceSummary = matchedSources.map((f) => `「${f.name}」`).join("、");
	let summary = `已成功将 ${matchedSources.length} 个文件夹（${sourceSummary}）中的 ${migratedBookmarksCount} 个书签合并归集到「${targetFolder.name}」`;
	if (createdTarget) {
		summary += `（已自动新建目标文件夹）`;
	}
	if (deleteSources && deletedSourceNames.length > 0) {
		summary += `，并清理了 ${deletedSourceNames.length} 个旧文件夹。`;
	} else {
		summary += `，源文件夹已保留。`;
	}

	if (missingSources.length > 0) {
		summary += `（另有 ${missingSources.length} 个未找到已跳过：${missingSources.join("、")}）`;
	}

	return {
		toolName: "merge_folders",
		summary,
		items: [],
		references: [],
		isMutation: true,
	};
}

/**
 * Tool Definition for TanStack AI
 */
export const mergeFoldersToolDef = toolDefinition({
	name: "merge_folders",
	description:
		"【高阶治理推荐】文件夹合并与知识归集工具。将多个源文件夹中的所有书签一键合并归拢到指定目标文件夹（若目标不存在则自动创建），并可自动清理旧的空壳文件夹。在分类结构重塑、冗余文件夹整合、主题合并时优先调用此工具，严禁拆分成多次移动和单点删除！",
	inputSchema: mergeFoldersInputSchema,
});
