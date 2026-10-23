import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";
import { placeLibraryItem } from "../../../shared/excalidraw/libraryItem.ts";
import {
	generateReplicaElements,
	type ReplicaElement,
} from "../../../shared/excalidraw/replicaFactory.ts";
import {
	type LibraryItem,
	describeItem,
	loadLibraryItems,
	searchCatalog,
} from "../../services/excalidrawLibrary.ts";
import { saveExcalidrawDraft } from "./headlessExcalidraw.ts";
import type { ToolExecutionResult } from "./types.ts";

const colorSchema = z
	.string()
	.regex(/^(#[0-9a-fA-F]{3,8}|transparent)$/, "必须是 #hex 或 transparent");

const pointSchema = z.tuple([z.number(), z.number()]);

export const replicaElementSchema = z.object({
	id: z.string().describe("唯一 id，箭头的 startId/endId 引用它"),
	type: z.enum([
		"rectangle",
		"ellipse",
		"diamond",
		"text",
		"line",
		"arrow",
		"library",
	]),
	librarySource: z
		.string()
		.optional()
		.describe(
			"type=library 时必填：search_excalidraw_library 返回的图库 source；x/y/width/height 为图标在原图中的包围框，图标会等比缩放居中放入",
		),
	itemIndex: z
		.number()
		.int()
		.min(0)
		.optional()
		.describe("type=library 时必填：图库内条目序号（#N）"),
	x: z.number().optional().describe("左上角 x（原图像素坐标），形状/文字必填"),
	y: z.number().optional().describe("左上角 y（原图像素坐标），形状/文字必填"),
	width: z.number().optional().describe("宽度（像素），形状必填"),
	height: z.number().optional().describe("高度（像素），形状必填"),
	points: z
		.array(pointSchema)
		.min(2)
		.optional()
		.describe("line/arrow 的绝对顶点 [[x,y],...]；折线逐个拐点列出"),
	text: z
		.string()
		.optional()
		.describe("文字内容：text 元素的正文 / 形状内标签 / 箭头标签；保留原图换行"),
	stroke: colorSchema.optional().describe("描边色（文字元素即文字颜色），取原图实际色值"),
	textColor: colorSchema.optional().describe("形状内标签颜色，缺省同 stroke"),
	fill: colorSchema.optional().describe("填充色，无填充用 transparent"),
	strokeWidth: z.number().min(1).max(8).optional(),
	strokeStyle: z.enum(["solid", "dashed", "dotted"]).optional(),
	rounded: z.boolean().optional().describe("矩形是否圆角，默认 true"),
	opacity: z.number().min(0).max(100).optional(),
	fontSize: z.number().min(8).max(96).optional().describe("按原图文字高度估算"),
	fontFamily: z
		.enum(["hand", "normal", "code"])
		.optional()
		.describe("hand 手写 / normal 无衬线 / code 等宽，匹配原图字体风格"),
	textAlign: z.enum(["left", "center", "right"]).optional(),
	startId: z.string().optional().describe("箭头起点绑定的形状 id"),
	endId: z.string().optional().describe("箭头终点绑定的形状 id"),
	startArrowhead: z
		.enum(["arrow", "triangle", "bar", "dot"])
		.nullable()
		.optional(),
	endArrowhead: z
		.enum(["arrow", "triangle", "bar", "dot"])
		.nullable()
		.optional()
		.describe("箭头默认 arrow；无箭头头部传 null"),
});

export const draftExcalidrawReplicaInputSchema = z.object({
	title: z.string().describe("画板名称（如：'登录流程图（还原）'）"),
	canvas: z
		.object({
			width: z.number().positive(),
			height: z.number().positive(),
			background: colorSchema.optional(),
		})
		.optional()
		.describe("原图像素尺寸与背景色；所有坐标都以此坐标系为准"),
	sketch: z
		.boolean()
		.optional()
		.describe("原图是手绘抖动风格传 true（默认），干净直线风格传 false"),
	elements: z
		.array(replicaElementSchema)
		.min(1)
		.describe(
			"按 z 轴从下到上排列：大背景/分区框 → 形状 → 连线 → 文字。严格按原图坐标，不要自动排版",
		),
});

export type DraftExcalidrawReplicaInput = z.input<
	typeof draftExcalidrawReplicaInputSchema
>;

export const draftExcalidrawReplicaToolDef = toolDefinition({
	metadata: { executionClass: "content-generating", clientAction: "draft" },
	name: "draft_excalidraw_replica",
	description:
		"【图片还原为 Excalidraw 画板】当用户提供了一张流程图/架构图/截图/手绘草图并要求「还原/复刻/转成 Excalidraw」时，一步调用本工具。你必须先读图，完整清点所有形状、文字、箭头、颜色，再以原图像素坐标逐个输出（坐标即真相，不做自动排版）。输出草稿交付卡片，用户确认后落盘。若返回 warnings，对照原图修正后再调用一次。复杂图标/插画（服务器、数据库、人物、云、品牌图标等）不要用基础图形硬拼：先调用 search_excalidraw_library 选图库条目，再用 type=library 元素放入。非图片来源的新建画板请用 draft_excalidraw。",
	inputSchema: draftExcalidrawReplicaInputSchema,
});

export async function executeDraftExcalidrawReplica(
	args: DraftExcalidrawReplicaInput,
	sessionId?: string,
): Promise<ToolExecutionResult> {
	const title = (args.title || "未命名画板").trim();
	const resolveLibrary = await prepareLibraryResolver(
		args.elements as ReplicaElement[],
	);
	const { elements, warnings, background } = generateReplicaElements(args, {
		resolveLibrary,
	});
	if (elements.length === 0) {
		throw new Error(`没有可绘制的有效元素：${warnings.join("；")}`);
	}

	const navigation = saveExcalidrawDraft(title, elements, sessionId, background);
	const warnText = warnings.length
		? `\n⚠️ 发现 ${warnings.length} 个问题，请对照原图修正后重新调用：\n- ${warnings.slice(0, 10).join("\n- ")}`
		: "";
	return {
		toolName: "draft_excalidraw_replica",
		summary: `已为「${title}」还原 Excalidraw 画板草稿（${elements.length} 个元素），等待用户在交付卡片中确认保存。${warnText}`,
		items: [],
		references: [],
		isMutation: true,
		navigation,
	};
}


/** Prefetch every referenced library once, then resolve items synchronously. */
async function prepareLibraryResolver(elements: ReplicaElement[]) {
	const sources = [
		...new Set(
			elements
				.filter((e) => e.type === "library" && e.librarySource)
				.map((e) => e.librarySource as string),
		),
	];
	const loaded = new Map<string, LibraryItem[]>();
	await Promise.all(
		sources.map(async (src) => {
			try {
				loaded.set(src, await loadLibraryItems(src));
			} catch {
				// surfaced per element as a warning by the resolver below
			}
		}),
	);
	return (el: ReplicaElement) => {
		const items = loaded.get(el.librarySource as string);
		const item = items?.find((i) => i.index === el.itemIndex);
		if (!item) throw new Error(`图库 ${el.librarySource} #${el.itemIndex} 不可用`);
		const { x, y, width, height } = el;
		if (![x, y, width, height].every((v) => typeof v === "number")) {
			throw new Error("缺少 x/y/width/height 包围框");
		}
		return placeLibraryItem(
			item.elements,
			{ x: x as number, y: y as number, width: width as number, height: height as number },
			`lib_${el.id}`,
		);
	};
}

export const searchExcalidrawLibraryInputSchema = z.object({
	query: z
		.string()
		.optional()
		.describe("在公共图库目录中搜索的英文关键词，如 'server database aws'、'stick figure'、'cloud'"),
	source: z
		.string()
		.optional()
		.describe("上一步返回的图库 source；传入后列出该图库的条目（#序号、尺寸、文字）供选择"),
});

export type SearchExcalidrawLibraryInput = z.input<
	typeof searchExcalidrawLibraryInputSchema
>;

export const searchExcalidrawLibraryToolDef = toolDefinition({
	metadata: { executionClass: "global-headless" },
	name: "search_excalidraw_library",
	description:
		"检索 Excalidraw 公共图库（libraries.excalidraw.com）。两步用法：先传 query 得到候选图库及 source；再传 source 列出条目。拿到 source + #序号后，在 draft_excalidraw_replica 中用 type=library 元素放入。仅用于复杂图标/插画，矩形、箭头等基础图形直接画。查询词只用通用英文词，不要带用户私有内容。",
	inputSchema: searchExcalidrawLibraryInputSchema,
});

export async function executeSearchExcalidrawLibrary(
	args: SearchExcalidrawLibraryInput,
): Promise<ToolExecutionResult> {
	const done = (summary: string): ToolExecutionResult => ({
		toolName: "search_excalidraw_library",
		summary,
		items: [],
		references: [],
		isMutation: false,
	});

	if (args.source) {
		const items = await loadLibraryItems(args.source);
		const lines = items.slice(0, 60).map(describeItem);
		const more = items.length > 60 ? `\n…共 ${items.length} 项，仅显示前 60` : "";
		return done(`图库 ${args.source} 条目：\n${lines.join("\n")}${more}`);
	}
	if (!args.query?.trim()) return done("请提供 query 或 source");

	const hits = await searchCatalog(args.query);
	if (hits.length === 0) return done(`未找到与「${args.query}」相关的图库，换个英文关键词再试`);
	const lines = hits.map(
		(h) =>
			`- ${h.name}｜source: ${h.source}｜${h.description}｜作者: ${(h.authors ?? []).map((a) => a.name).join(", ")}`,
	);
	return done(`候选图库：\n${lines.join("\n")}\n下一步：用 source 再次调用本工具列出条目。`);
}
