import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";
import type {
	SearchResultItem,
	WorkbenchItem,
} from "../../../components/workbench/types";
import { workbenchDb } from "../../db/sqlite.ts";
import type { ToolExecutionResult } from "./types";

export const moveBookmarksToFolderInputSchema = z
	.object({
		targetFolderName: z.string().describe("目标文件夹名称"),
		itemIds: z
			.array(z.string())
			.nullable()
			.optional()
			.describe("待移动的书签 ID 数组（如果有准确 ID）"),
		itemNamesOrUrls: z
			.array(z.string())
			.nullable()
			.optional()
			.describe(
				"待移动的书签标题关键词或 URL 关键词数组（用于上下文模糊匹配，例如：['剪映', 'CapCut', 'Runway']）",
			),
		targetCategory: z
			.string()
			.nullable()
			.optional()
			.describe(
				"目标文件夹所属分类（当需要自动新建文件夹时生效，默认'工作台'）",
			),
		createIfNotExist: z
			.boolean()
			.nullable()
			.optional()
			.describe("若目标文件夹尚不存在，是否自动创建？默认 true"),
	})
	.passthrough();

export type MoveBookmarksToFolderInput = z.infer<
	typeof moveBookmarksToFolderInputSchema
>;

/**
 * Pure execution function to move bookmarks into folder in SQLite
 */
export function executeMoveBookmarks(
	args: MoveBookmarksToFolderInput,
): ToolExecutionResult {
	const {
		targetFolderName,
		itemIds,
		itemNamesOrUrls,
		targetCategory,
		createIfNotExist = true,
	} = args;

	const effectiveItemIds = Array.isArray(itemIds)
		? itemIds.filter(Boolean)
		: [];
	const effectiveItemNames = Array.isArray(itemNamesOrUrls)
		? itemNamesOrUrls.filter(Boolean)
		: [];
	const effectiveCategory =
		targetCategory &&
		targetCategory !== "null" &&
		targetCategory !== "undefined"
			? targetCategory.trim()
			: "工作台";

	const targetNameTrimmed = (targetFolderName || "").trim();
	if (!targetNameTrimmed) {
		return {
			toolName: "move_bookmarks_to_folder",
			summary: "移动书签失败：目标文件夹名称不能为空。",
			items: [],
			references: [],
			isMutation: false,
		};
	}

	// 1. Locate or create target folder
	let allFolders = workbenchDb.getAllFolders();
	let targetFolder = allFolders.find(
		(f) => f.name.toLowerCase() === targetNameTrimmed.toLowerCase(),
	);

	let newlyCreatedFolder = false;
	if (!targetFolder && createIfNotExist) {
		targetFolder = workbenchDb.createFolder(
			targetNameTrimmed,
			effectiveCategory,
			`自动创建的「${targetNameTrimmed}」主题文件夹`,
		);
		newlyCreatedFolder = true;
		allFolders = workbenchDb.getAllFolders();
	}

	if (!targetFolder) {
		return {
			toolName: "move_bookmarks_to_folder",
			summary: `移动书签失败：目标文件夹「${targetNameTrimmed}」不存在，且未允许自动创建。`,
			items: [],
			references: [],
			isMutation: false,
		};
	}

	// 2. Resolve target bookmarks to move
	const targetItemIds = new Set<string>();

	for (const id of effectiveItemIds) {
		if (id) targetItemIds.add(String(id));
	}

	if (effectiveItemNames.length > 0) {
		const unclassified = workbenchDb.getUnclassifiedItems();
		const allItems: WorkbenchItem[] = [
			...unclassified,
			...allFolders.flatMap((f) => f.items),
		];

		for (const keyword of effectiveItemNames) {
			const kw = keyword.toLowerCase().trim();
			if (!kw) continue;
			for (const item of allItems) {
				const matchName = item.name.toLowerCase().includes(kw);
				const matchUrl = (item.url || "").toLowerCase().includes(kw);
				if (matchName || matchUrl) {
					targetItemIds.add(String(item.id));
				}
			}
		}
	}

	if (targetItemIds.size === 0) {
		return {
			toolName: "move_bookmarks_to_folder",
			summary: `在数据库中未找到需要移动的书签条目（目标文件夹：「${targetFolder.name}」）。请确认书签 ID 或名称。`,
			items: [],
			references: [],
			isMutation: newlyCreatedFolder,
		};
	}

	// 3. Move items into target folder
	const movedItems: WorkbenchItem[] = [];
	const unclassified = workbenchDb.getUnclassifiedItems();
	const allItems: WorkbenchItem[] = [
		...unclassified,
		...allFolders.flatMap((f) => f.items),
	];

	for (const id of targetItemIds) {
		const itemObj = allItems.find((it) => String(it.id) === id);
		const sourceFolderId = itemObj?.folderId ?? null;
		workbenchDb.moveItem(id, sourceFolderId, targetFolder.id);

		if (itemObj) {
			movedItems.push({
				...itemObj,
				folderId: targetFolder.id,
				folderName: targetFolder.name,
				category: targetFolder.category,
			});
		}
	}

	const movedNamesList = movedItems.map((m) => `《${m.name}》`).join("、");
	const summaryText = newlyCreatedFolder
		? `成功新建文件夹「${targetFolder.name}」，并已将 ${movedItems.length} 个书签（${movedNamesList}）移入其中。`
		: `已成功将 ${movedItems.length} 个书签（${movedNamesList}）移入文件夹「${targetFolder.name}」。`;

	const references: SearchResultItem[] = movedItems.map((item, idx) => ({
		...item,
		score: 1.0 - idx * 0.01,
		matchType: "keyword",
		matchReason: `已成功移入文件夹「${targetFolder.name}」`,
	}));

	return {
		toolName: "move_bookmarks_to_folder",
		summary: summaryText,
		items: movedItems,
		references,
		isMutation: true,
	};
}

/**
 * Tool Definition for TanStack AI
 */
export const moveBookmarksToFolderToolDef = toolDefinition({
	name: "move_bookmarks_to_folder",
	description:
		"将指定的一个或多个书签移入目标文件夹。支持通过书签 ID、书签标题或 URL 关键词进行批量归类。如果目标文件夹不存在且开启了 createIfNotExist，会自动先创建该文件夹。",
	inputSchema: moveBookmarksToFolderInputSchema,
});
