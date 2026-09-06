import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";
import type {
	SearchResultItem,
	WorkbenchItem,
} from "../../../components/workbench/types.ts";
import { workbenchDb } from "../../db/sqlite.ts";
import type { ToolExecutionResult } from "./types.ts";

export const moveBookmarksToFolderInputSchema = z
	.object({
		targetFolderName: z
			.string()
			.nullable()
			.optional()
			.describe("目标文件夹名称（单目标文件夹模式）"),
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
		batchPlans: z
			.array(
				z.object({
					targetFolderName: z.string().describe("目标文件夹名称"),
					itemIds: z.array(z.string()).nullable().optional().describe("书签ID列表"),
					itemNamesOrUrls: z
						.array(z.string())
						.nullable()
						.optional()
						.describe("书签标题或URL关键词列表"),
					tags: z.array(z.string()).nullable().optional().describe("标签筛选列表"),
					mode: z
						.enum(["move", "link"])
						.nullable()
						.optional()
						.describe("操作模式，默认 'move'"),
					targetCategory: z
						.string()
						.nullable()
						.optional()
						.describe("所属分类，默认'工作台'"),
					createIfNotExist: z.boolean().nullable().optional(),
				}),
			)
			.nullable()
			.optional()
			.describe(
				"多目标批量归类分发计划。当需要同时将不同书签整理分发到多个不同文件夹时，必须使用此字段一次性提交，严禁对每个文件夹单独发起一次调用！",
			),
	})
	.passthrough();

export type MoveBookmarksToFolderInput = z.infer<
	typeof moveBookmarksToFolderInputSchema
>;

/**
 * Helper to execute a single folder bookmark move
 */
function executeSingleMove(
	plan: {
		targetFolderName: string;
		itemIds?: string[] | null;
		itemNamesOrUrls?: string[] | null;
		tags?: string[] | null;
		mode?: "move" | "link" | null;
		targetCategory?: string | null;
		createIfNotExist?: boolean | null;
	},
): {
	targetFolderName: string;
	movedCount: number;
	createdFolder: boolean;
	movedItems: WorkbenchItem[];
	references: SearchResultItem[];
} {
	const isLinkMode = (plan.mode || "move").toLowerCase() === "link";
	const effectiveItemIds = Array.isArray(plan.itemIds)
		? plan.itemIds.filter(Boolean)
		: [];
	const effectiveItemNames = Array.isArray(plan.itemNamesOrUrls)
		? plan.itemNamesOrUrls.filter(Boolean)
		: [];
	const effectiveTags = Array.isArray(plan.tags)
		? plan.tags.filter(Boolean)
		: [];
	const effectiveCategory =
		plan.targetCategory &&
		plan.targetCategory !== "null" &&
		plan.targetCategory !== "undefined"
			? plan.targetCategory.trim()
			: "工作台";
	const targetNameTrimmed = (plan.targetFolderName || "").trim();
	const createIfNotExist = plan.createIfNotExist !== false;

	if (!targetNameTrimmed) {
		return {
			targetFolderName: "",
			movedCount: 0,
			createdFolder: false,
			movedItems: [],
			references: [],
		};
	}

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
			targetFolderName: targetNameTrimmed,
			movedCount: 0,
			createdFolder: false,
			movedItems: [],
			references: [],
		};
	}

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
		return {
			targetFolderName: targetFolder.name,
			movedCount: 0,
			createdFolder: newlyCreatedFolder,
			movedItems: [],
			references: [],
		};
	}

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

	const references: SearchResultItem[] = movedItems.map((item, idx) => ({
		...item,
		score: 1.0 - idx * 0.01,
		matchType: "keyword",
		matchReason: isLinkMode
			? `已成功关联复用到文件夹「${targetFolder.name}」`
			: `已成功移入文件夹「${targetFolder.name}」`,
	}));

	return {
		targetFolderName: targetFolder.name,
		movedCount: movedItems.length,
		createdFolder: newlyCreatedFolder,
		movedItems,
		references,
	};
}

/**
 * Pure execution function to move or link bookmarks into folder in SQLite
 */
export function executeMoveBookmarks(
	args: MoveBookmarksToFolderInput,
): ToolExecutionResult {
	// Case 1: Multiple plans specified
	if (Array.isArray(args.batchPlans) && args.batchPlans.length > 0) {
		const summaries: string[] = [];
		const allMovedItems: WorkbenchItem[] = [];
		const allReferences: SearchResultItem[] = [];
		let totalMoved = 0;

		for (const plan of args.batchPlans) {
			const res = executeSingleMove(plan);
			if (res.movedCount > 0) {
				totalMoved += res.movedCount;
				allMovedItems.push(...res.movedItems);
				allReferences.push(...res.references);
				summaries.push(`「${res.targetFolderName}」(${res.movedCount}条)`);
			}
		}

		if (totalMoved === 0) {
			return {
				toolName: "move_bookmarks_to_folder",
				summary: "批量归类整理完成，但未匹配到需要移动的书签条目。请确认书签名称或关键词。",
				items: [],
				references: [],
				isMutation: false,
			};
		}

		return {
			toolName: "move_bookmarks_to_folder",
			summary: `已成功批量将 ${totalMoved} 个书签分发归入 ${summaries.length} 个文件夹：${summaries.join("、")}。`,
			items: allMovedItems,
			references: allReferences,
			isMutation: true,
		};
	}

	// Case 2: Single target folder execution (backward compatible)
	const singleRes = executeSingleMove({
		targetFolderName: args.targetFolderName || "",
		itemIds: args.itemIds,
		itemNamesOrUrls: args.itemNamesOrUrls,
		tags: args.tags,
		mode: args.mode,
		targetCategory: args.targetCategory,
		createIfNotExist: args.createIfNotExist,
	});

	if (!args.targetFolderName?.trim()) {
		return {
			toolName: "move_bookmarks_to_folder",
			summary: "移动书签失败：目标文件夹名称不能为空。",
			items: [],
			references: [],
			isMutation: false,
		};
	}

	if (singleRes.movedCount === 0) {
		const actionWord = args.mode === "link" ? "关联复用" : "移动";
		return {
			toolName: "move_bookmarks_to_folder",
			summary: `在数据库中未找到需要${actionWord}的书签条目（目标文件夹：「${singleRes.targetFolderName || args.targetFolderName}」）。请确认书签 ID、名称或标签。`,
			items: [],
			references: [],
			isMutation: singleRes.createdFolder,
		};
	}

	const movedNamesList = singleRes.movedItems.map((m) => `《${m.name}》`).join("、");
	const actionWord = args.mode === "link" ? "关联复用" : "移入";
	const isLinkMode = args.mode === "link";
	const summaryText = singleRes.createdFolder
		? `成功新建文件夹「${singleRes.targetFolderName}」，并已将 ${singleRes.movedCount} 个书签（${movedNamesList}）${actionWord}其中${isLinkMode ? "（原分类位置保持不变）" : ""}。`
		: `已成功将 ${singleRes.movedCount} 个书签（${movedNamesList}）${actionWord}文件夹「${singleRes.targetFolderName}」${isLinkMode ? "（原分类位置保持不变）" : ""}。`;

	return {
		toolName: "move_bookmarks_to_folder",
		summary: summaryText,
		items: singleRes.movedItems,
		references: singleRes.references,
		isMutation: true,
	};
}

/**
 * Tool Definition for TanStack AI
 */
export const moveBookmarksToFolderToolDef = toolDefinition({
	name: "move_bookmarks_to_folder",
	description:
		"将书签整理移入或关联复用到目标文件夹。支持单目标模式（targetFolderName + itemNamesOrUrls/itemIds/tags）以及多目标批量分发模式（batchPlans: [{ targetFolderName, itemNamesOrUrls }]）。支持 mode='move'（整理剪切）与 mode='link'（任务装配引用，保留原位置）。当需要同时将书签分别归类到多个不同文件夹时，必须使用 batchPlans 一次性完成，严禁拆为多次单步调用！",
	inputSchema: moveBookmarksToFolderInputSchema,
});

