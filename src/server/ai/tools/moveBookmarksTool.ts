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
			.describe("待移动或关联的书签 ID 数组（如果有准确 ID）"),
		itemNamesOrUrls: z
			.array(z.string())
			.nullable()
			.optional()
			.describe(
				"待移动或关联的书签标题关键词或 URL 关键词数组（用于上下文模糊匹配，例如：['剪映', 'CapCut', 'Runway']）",
			),
		tags: z
			.array(z.string())
			.nullable()
			.optional()
			.describe(
				"待筛选的书签标签数组（例如 ['自媒体', '视频']）。当用户希望把某种标签下的所有工具/书签汇总或复用时传入",
			),
		mode: z
			.enum(["move", "link"])
			.nullable()
			.optional()
			.describe(
				"操作模式：'move'（默认）表示物理整理/规整（从原位置剪切移入新文件夹）；'link' 表示任务复用/软链接（保留原分类归属，仅向新文件夹添加多对多引用，适合自媒体工具箱等任务场景）",
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
 * Pure execution function to move or link bookmarks into folder in SQLite
 */
export function executeMoveBookmarks(
	args: MoveBookmarksToFolderInput,
): ToolExecutionResult {
	const {
		targetFolderName,
		itemIds,
		itemNamesOrUrls,
		tags,
		mode = "move",
		targetCategory,
		createIfNotExist = true,
	} = args;

	const isLinkMode = (mode || "move").toLowerCase() === "link";
	const effectiveItemIds = Array.isArray(itemIds)
		? itemIds.filter(Boolean)
		: [];
	const effectiveItemNames = Array.isArray(itemNamesOrUrls)
		? itemNamesOrUrls.filter(Boolean)
		: [];
	const effectiveTags = Array.isArray(tags) ? tags.filter(Boolean) : [];
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

	// 2. Resolve target bookmarks to move or link
	const targetItemIds = new Set<string>();

	for (const id of effectiveItemIds) {
		if (id) targetItemIds.add(String(id));
	}

	if (effectiveItemNames.length > 0 || effectiveTags.length > 0) {
		const unclassified = workbenchDb.getUnclassifiedItems();
		const allItems: WorkbenchItem[] = [
			...unclassified,
			...allFolders.flatMap((f) => f.items),
		];

		// Match by keyword in name or url
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

		// Match by tags
		for (const tag of effectiveTags) {
			const tagLower = tag.toLowerCase().trim();
			if (!tagLower) continue;
			for (const item of allItems) {
				const hasTag = (item.tags || []).some((t) =>
					t.toLowerCase().includes(tagLower),
				);
				if (hasTag) {
					targetItemIds.add(String(item.id));
				}
			}
		}
	}

	if (targetItemIds.size === 0) {
		const actionWord = isLinkMode ? "关联复用" : "移动";
		return {
			toolName: "move_bookmarks_to_folder",
			summary: `在数据库中未找到需要${actionWord}的书签条目（目标文件夹：「${targetFolder.name}」）。请确认书签 ID、名称或标签。`,
			items: [],
			references: [],
			isMutation: newlyCreatedFolder,
		};
	}

	// 3. Move or link items into target folder
	const movedItems: WorkbenchItem[] = [];
	const unclassified = workbenchDb.getUnclassifiedItems();
	const allItems: WorkbenchItem[] = [
		...unclassified,
		...allFolders.flatMap((f) => f.items),
	];

	for (const id of targetItemIds) {
		const itemObj = allItems.find((it) => String(it.id) === id);
		const sourceFolderId = itemObj?.folderId ?? null;

		if (isLinkMode) {
			workbenchDb.linkItemToFolder(id, targetFolder.id);
		} else {
			workbenchDb.moveItem(id, sourceFolderId, targetFolder.id);
		}

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
	const actionWord = isLinkMode ? "关联复用" : "移入";
	const summaryText = newlyCreatedFolder
		? `成功新建文件夹「${targetFolder.name}」，并已将 ${movedItems.length} 个书签（${movedNamesList}）${actionWord}其中${isLinkMode ? "（原分类位置保持不变）" : ""}。`
		: `已成功将 ${movedItems.length} 个书签（${movedNamesList}）${actionWord}文件夹「${targetFolder.name}」${isLinkMode ? "（原分类位置保持不变）" : ""}。`;

	const references: SearchResultItem[] = movedItems.map((item, idx) => ({
		...item,
		score: 1.0 - idx * 0.01,
		matchType: "keyword",
		matchReason: isLinkMode
			? `已成功关联复用到文件夹「${targetFolder.name}」`
			: `已成功移入文件夹「${targetFolder.name}」`,
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
		"将指定的一个或多个书签整理移入或关联复用到目标文件夹。支持通过书签 ID、标题关键词、URL 或标签 tags 进行批量匹配。支持 mode='move'（整理剪切）与 mode='link'（任务装配引用，保留原位置）。如果目标文件夹不存在且开启了 createIfNotExist，会自动先创建该文件夹。",
	inputSchema: moveBookmarksToFolderInputSchema,
});
