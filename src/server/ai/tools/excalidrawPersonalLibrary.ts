import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";
import {
	describePersonalItem,
	listPersonalLibraryItems,
	searchPersonalLibraryItems,
} from "../../services/personalLibrary.ts";
import {
	executeInsertPersonalLibraryItems,
	headlessInsertPersonalLibraryItems,
} from "./personalLibraryPlacement.ts";
import { excalidrawLibraryAnchorSchema } from "./excalidrawTools.ts";
import type { ToolExecutionResult } from "./types.ts";

/**
 * AI access to the user's personal Excalidraw library
 * (excalidraw_library_items table — items the user imported/curated in the
 * editor). Kept separate from the public-catalog tools on purpose: personal
 * items are the user's preferred building blocks, and unlike public items
 * their image elements carry usable dataURLs.
 */

export const searchPersonalLibraryInputSchema = z.object({
	query: z
		.string()
		.optional()
		.describe(
			"按素材名称或素材内文字搜索的关键词（中英文均可），如 '数据库'、'server'。省略时列出全部个人素材",
		),
});

export type SearchPersonalLibraryInput = z.input<
	typeof searchPersonalLibraryInputSchema
>;

export const searchPersonalLibraryToolDef = toolDefinition({
	metadata: { executionClass: "global-headless" },
	name: "search_personal_library",
	description:
		"检索用户的个人 Excalidraw 素材库（用户在画板里亲自导入/收藏的素材，优先级高于公共图库）。返回每条素材的 id、名称、元素数、尺寸与包含的文字。拿到 id 后用 excalidraw_insert_personal_item 插入画板。当用户提到「我的素材/我导入的/我之前收藏的」时优先用本工具；公共图库请用 search_excalidraw_library。",
	inputSchema: searchPersonalLibraryInputSchema,
});

export function executeSearchPersonalLibrary(
	args: SearchPersonalLibraryInput,
): ToolExecutionResult {
	const done = (summary: string): ToolExecutionResult => ({
		toolName: "search_personal_library",
		summary,
		items: [],
		references: [],
		isMutation: false,
	});

	const hits = args.query?.trim()
		? searchPersonalLibraryItems(args.query)
		: listPersonalLibraryItems().slice(0, 30);

	if (hits.length === 0) {
		return done(
			args.query?.trim()
				? `个人素材库中没有匹配「${args.query}」的素材。可改用 search_excalidraw_library 检索公共图库`
				: "个人素材库为空（用户尚未导入任何素材）。可改用 search_excalidraw_library 检索公共图库",
		);
	}
	const lines = hits.map(describePersonalItem);
	return done(
		`个人素材库候选：\n${lines.join("\n")}\n下一步：用 excalidraw_insert_personal_item 按 id 插入。`,
	);
}

export const personalLibraryPlacementSchema = z.object({
	itemId: z
		.string()
		.describe("search_personal_library 返回的素材 id"),
	width: z.number().positive().describe("放置后的包围框宽度（px）"),
	height: z.number().positive().describe("放置后的包围框高度（px）"),
	anchor: excalidrawLibraryAnchorSchema,
});

export const insertPersonalLibraryItemInputSchema = z.object({
	targetPath: z
		.string()
		.optional()
		.describe(
			"目标画板相对路径（.excalidraw）。省略时作用于当前已打开的画板；仅在需要修改其他已有画板时指定",
		),
	placements: z
		.array(personalLibraryPlacementSchema)
		.min(1)
		.max(20)
		.describe("要放置的个人素材列表，按数组顺序依次落位"),
});

export type InsertPersonalLibraryItemInput = z.input<
	typeof insertPersonalLibraryItemInputSchema
>;

export const insertPersonalLibraryItemToolDef = toolDefinition({
	metadata: {
		executionClass: "context-dependent",
		requiresView: "excalidraw",
		clientAction: "canvas",
	},
	name: "excalidraw_insert_personal_item",
	description:
		"向当前已打开的 Excalidraw 画板插入用户个人素材库中的素材。前置步骤：必须先调用 search_personal_library 获取素材 id。个人素材是用户精选过的图形，命中时优先于公共图库；含图片的素材也可正常插入。",
	inputSchema: insertPersonalLibraryItemInputSchema,
});

export {
	executeInsertPersonalLibraryItems,
	headlessInsertPersonalLibraryItems,
};
