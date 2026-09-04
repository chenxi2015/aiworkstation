import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";
import type { Folder } from "../../../components/workbench/types";
import { workbenchDb } from "../../db/sqlite.ts";
import type { ToolExecutionResult } from "./types";

export const reorderFoldersInputSchema = z
	.object({
		orderedFolderNames: z
			.array(z.string())
			.nullable()
			.optional()
			.describe(
				"期望的文件夹名称顺序（同一层级内）。未列出的同级文件夹会保持原顺序排在最后",
			),
		sortBy: z
			.enum(["name", "items", "created"])
			.nullable()
			.optional()
			.describe(
				"快捷排序规则：name=按名称，items=按内容数量（多到少），created=按创建时间（新到旧）。与 orderedFolderNames 二选一",
			),
		parentFolderName: z
			.string()
			.nullable()
			.optional()
			.describe("要排序的子层级所属父文件夹名称；不传表示排序分类顶层的文件夹"),
		category: z
			.string()
			.nullable()
			.optional()
			.describe("要排序的分类名称（仅顶层排序时生效），默认「工作台」"),
	})
	.passthrough();

export type ReorderFoldersInput = z.infer<typeof reorderFoldersInputSchema>;

function sortSiblings(
	siblings: Folder[],
	sortBy: "name" | "items" | "created",
) {
	const sorted = [...siblings];
	if (sortBy === "name") {
		sorted.sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN"));
	} else if (sortBy === "items") {
		sorted.sort((a, b) => b.items.length - a.items.length);
	} else {
		sorted.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
	}
	return sorted;
}

/**
 * Pure execution function to persist sibling folder order in SQLite
 */
export function executeReorderFolders(
	args: ReorderFoldersInput,
): ToolExecutionResult {
	const allFolders = workbenchDb.getAllFolders();

	// 1. Resolve the container (top-level of a category, or a parent folder)
	let parentId: number | null = null;
	let containerLabel: string;
	const rawParent = (args.parentFolderName || "").trim();
	if (rawParent && rawParent !== "null" && rawParent !== "undefined") {
		const parent = allFolders.find(
			(f) => f.name.trim().toLowerCase() === rawParent.toLowerCase(),
		);
		if (!parent) {
			return {
				toolName: "reorder_folders",
				summary: `文件夹排序失败：未找到父文件夹「${rawParent}」。`,
				items: [],
				references: [],
				isMutation: false,
			};
		}
		parentId = parent.id;
		containerLabel = `「${parent.name}」内`;
	} else {
		const category =
			args.category && args.category !== "null" && args.category !== "undefined"
				? args.category.trim()
				: "工作台";
		containerLabel = `「${category}」分类顶层`;
	}

	const siblings = allFolders.filter(
		(f) =>
			(f.parentId ?? null) === parentId &&
			(parentId !== null ||
				!args.category ||
				f.category ===
					(args.category !== "null" && args.category !== "undefined"
						? args.category.trim()
						: "工作台")),
	);

	if (siblings.length < 2) {
		return {
			toolName: "reorder_folders",
			summary: `${containerLabel}只有 ${siblings.length} 个文件夹，无需排序。`,
			items: [],
			references: [],
			isMutation: false,
		};
	}

	// 2. Compute the desired order
	let ordered: Folder[];
	const requestedNames = (args.orderedFolderNames || [])
		.map((n) => n.trim().toLowerCase())
		.filter(Boolean);

	if (requestedNames.length > 0) {
		const picked: Folder[] = [];
		const rest = [...siblings];
		for (const name of requestedNames) {
			const idx = rest.findIndex((f) => f.name.trim().toLowerCase() === name);
			if (idx !== -1) {
				picked.push(rest[idx]);
				rest.splice(idx, 1);
			}
		}
		ordered = [...picked, ...rest];
	} else if (args.sortBy) {
		ordered = sortSiblings(siblings, args.sortBy);
	} else {
		return {
			toolName: "reorder_folders",
			summary:
				"文件夹排序失败：请提供 orderedFolderNames（显式顺序）或 sortBy（name/items/created）之一。",
			items: [],
			references: [],
			isMutation: false,
		};
	}

	// 3. Skip when already in the desired order
	const before = siblings.map((f) => f.id).join(",");
	const after = ordered.map((f) => f.id).join(",");
	if (before === after) {
		return {
			toolName: "reorder_folders",
			summary: `${containerLabel}的文件夹顺序已经符合要求，无需调整。`,
			items: [],
			references: [],
			isMutation: false,
		};
	}

	workbenchDb.reorderFolders(ordered.map((f) => f.id));

	const orderPreview = ordered.map((f) => f.name).join(" → ");
	return {
		toolName: "reorder_folders",
		summary: `已调整${containerLabel}的文件夹顺序：${orderPreview}。`,
		items: [],
		references: [],
		isMutation: true,
	};
}

/**
 * Tool Definition for TanStack AI
 */
export const reorderFoldersToolDef = toolDefinition({
	name: "reorder_folders",
	description:
		"对同一层级（某个分类顶层或某个父文件夹内）的文件夹进行排序。支持显式名称顺序，或按名称/内容数量/创建时间快捷排序。当用户要求调整文件夹排列顺序时调用此工具。",
	inputSchema: reorderFoldersInputSchema,
});
