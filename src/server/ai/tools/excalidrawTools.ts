import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";
import type { ToolExecutionResult } from "./types.ts";

export const excalidrawElementSchema = z.object({
	id: z.string().describe("Unique identifier for this element"),
	type: z
		.enum(["rectangle", "ellipse", "diamond", "text"])
		.default("rectangle")
		.describe("Element type: rectangle, ellipse, diamond (decision), text"),
	label: z.string().describe("Label or text content inside the shape"),
	color: z
		.enum(["blue", "green", "yellow", "red", "purple", "gray", "default"])
		.optional()
		.default("default")
		.describe("Hand-drawn preset color scheme"),
	strokeWidth: z.union([z.literal(1), z.literal(2), z.literal(4)]).optional(),
});

export const excalidrawConnectionSchema = z.object({
	from: z.string().describe("Source element id"),
	to: z.string().describe("Target element id"),
	label: z
		.string()
		.optional()
		.describe("Label on the arrow (e.g. 'yes', 'success')"),
	style: z.enum(["solid", "dashed"]).default("solid"),
});

export const excalidrawDrawInputSchema = z.object({
	targetPath: z
		.string()
		.optional()
		.describe(
			"目标画板相对路径（.excalidraw）。省略时作用于当前已打开的画板；仅在需要修改其他已有画板时指定",
		),
	layout: z
		.enum([
			"vertical_flow",
			"horizontal_flow",
			"architecture_layers",
			"grid",
			"free",
		])
		.default("vertical_flow")
		.describe(
			"Layout topology: vertical_flow (top-to-bottom business flowchart, recommended for processes), horizontal_flow (left-to-right), architecture_layers (system tier stack), grid (matrix), free (sequential)",
		),
	mode: z
		.enum(["append", "replace"])
		.default("append")
		.describe("append (add to existing drawing) or replace (clear and redraw)"),
	elements: z
		.array(excalidrawElementSchema)
		.min(1)
		.describe(
			"List of shape elements to draw. Semantic rules: start/end uses 'ellipse' (green/blue); process actions use 'rectangle' (blue/purple/green); decisions use 'diamond' (yellow); error/abort actions use 'rectangle' (red). Every branch action MUST be a dedicated separate node (do NOT combine success and failure in one node).",
		),
	connections: z
		.array(excalidrawConnectionSchema)
		.optional()
		.default([])
		.describe(
			"节点之间的连线箭头。做减法连线规则（杜绝线条杂乱）：仅连接直接因果相关的相邻前后步骤；严禁从顶部或任意节点拉出跨越多层的长实线/长虚线贯穿画布；判断节点 diamond 严格仅出 2 条线（主路径向下连下一步，分支路径向右连独立异常卡片，带简短 label 如'企稳'/'跌破'）；异常或终止卡片作为叶子节点，严禁再拉多余的跨层连线。",
		),
});

export type ExcalidrawDrawInput = z.input<typeof excalidrawDrawInputSchema>;

export function executeExcalidrawDrawElements(
	args: ExcalidrawDrawInput,
): ToolExecutionResult {
	const elementCount = args.elements.length;
	const connCount = args.connections?.length ?? 0;
	return {
		toolName: "excalidraw_draw_elements",
		summary: `已在 Excalidraw 画板中绘制 ${elementCount} 个图形元素、${connCount} 条手绘连线（布局方式：${args.layout}）。`,
		items: [],
		references: [],
		isMutation: true,
	};
}

export const excalidrawDrawElementsToolDef = toolDefinition({
	metadata: { executionClass: "content-generating", clientAction: "canvas" },
	name: "excalidraw_draw_elements",
	description:
		"【仅用于修改当前已打开的画板】在当前已打开的 Excalidraw 画板中批量追加手绘图形节点或连线。当用户说「绘制/画/创建/添加/补充/梳理图形、图表、流程、架构、关系、模型、时序、系统」到当前画板时使用本工具。严禁在新建画板流程中调用本工具！新建画板必须单步调用 draft_excalidraw 一次性生成完整草稿卡片。",
	inputSchema: excalidrawDrawInputSchema,
});

export const draftExcalidrawInputSchema = z.object({
	title: z
		.string()
		.describe(
			"画板名称或主题（如：'黄金指数2026年底行情推演'、'微服务架构图'）",
		),
	layout: z
		.enum([
			"vertical_flow",
			"horizontal_flow",
			"architecture_layers",
			"grid",
			"free",
		])
		.default("vertical_flow")
		.describe(
			"布局拓扑：vertical_flow (推荐垂直业务流程图，自顶向下), horizontal_flow (横向流程图), architecture_layers (分层架构), grid (网格矩阵), free (自由分布)",
		),
	elements: z
		.array(excalidrawElementSchema)
		.min(1)
		.describe(
			"要绘制的图形节点列表。语义规范：起始/结束用 ellipse (green/blue)；业务处理/行动用 rectangle (blue/purple/green)；决策判断用 diamond (yellow)；异常/终止用 rectangle (red)。分支动作必须拆为独立节点，不可合并。",
		),
	connections: z
		.array(excalidrawConnectionSchema)
		.optional()
		.default([])
		.describe(
			"节点之间的连线箭头。做减法连线规则（杜绝线条杂乱）：仅连接直接因果相关的相邻前后步骤；严禁从顶部或任意节点拉出跨越多层的长实线/长虚线贯穿画布；判断节点 diamond 严格仅出 2 条线（主路径向下连下一步，分支路径向右连独立异常卡片，带简短 label 如'企稳'/'跌破'）；异常或终止卡片作为叶子节点，严禁再拉多余的跨层连线。",
		),
});

export type DraftExcalidrawInput = z.input<typeof draftExcalidrawInputSchema>;

export const draftExcalidrawToolDef = toolDefinition({
	metadata: { executionClass: "content-generating", clientAction: "draft" },
	name: "draft_excalidraw",
	description:
		"【新建画板唯一入口】在一步内规划并生成完整的 Excalidraw 手绘流程图、系统架构图或推演图草稿。当用户说「新建/创建/建个/建一个/新开 Excalidraw 画板」时必须调用本工具。草稿暂存本地草稿区，以交互卡片形式交付用户确认后落盘保存并打开。严禁分步创建空画板，严禁后续再调用 excalidraw_draw_elements，必须在所有分析完成后一次性调用本工具产出完整图形草稿。",
	inputSchema: draftExcalidrawInputSchema,
});

export const excalidrawUpdateElementInputSchema = z.object({
	elementId: z.string().describe("ID of the target element to update"),
	label: z
		.string()
		.optional()
		.describe("New text content or label for the element"),
	color: z
		.enum(["blue", "green", "yellow", "red", "purple", "gray", "default"])
		.optional()
		.describe("Hand-drawn preset color scheme"),
});

export type ExcalidrawUpdateElementInput = z.input<
	typeof excalidrawUpdateElementInputSchema
>;

export function executeExcalidrawUpdateElement(
	args: ExcalidrawUpdateElementInput,
): ToolExecutionResult {
	return {
		toolName: "excalidraw_update_element",
		summary: `已更新 Excalidraw 元素 ${args.elementId} 的文本或颜色样式。`,
		items: [],
		references: [],
		isMutation: true,
	};
}

export const excalidrawUpdateElementToolDef = toolDefinition({
	metadata: {
		executionClass: "context-dependent",
		requiresView: "excalidraw",
		clientAction: "canvas",
	},
	name: "excalidraw_update_element",
	description:
		"更新 Excalidraw 画板中指定图形元素的文字内容或配色样式。当用户说「修改/更新/改一下画板中某个图形的文字或颜色」时使用本工具。",
	inputSchema: excalidrawUpdateElementInputSchema,
});

export const excalidrawClearCanvasInputSchema = z.object({});

export function executeExcalidrawClearCanvas(): ToolExecutionResult {
	return {
		toolName: "excalidraw_clear_canvas",
		summary: "已清空当前 Excalidraw 画板（可通过快捷键撤销恢复）。",
		items: [],
		references: [],
		isMutation: true,
	};
}

export const excalidrawClearCanvasToolDef = toolDefinition({
	metadata: {
		executionClass: "context-dependent",
		requiresView: "excalidraw",
		clientAction: "canvas",
	},
	name: "excalidraw_clear_canvas",
	description:
		"清空当前 Excalidraw 画板的所有图形元素。当用户说「清空/清掉/重置画板或画布内容」时使用本工具。",
	inputSchema: excalidrawClearCanvasInputSchema,
});

export const excalidrawCenterViewInputSchema = z.object({
	elementIds: z
		.array(z.string())
		.optional()
		.describe(
			"Optional element IDs to focus on; omitted to fit the entire drawing content",
		),
});

export type ExcalidrawCenterViewInput = z.input<
	typeof excalidrawCenterViewInputSchema
>;

export function executeExcalidrawCenterView(
	args: ExcalidrawCenterViewInput,
): ToolExecutionResult {
	const targetDesc = args.elementIds?.length
		? `指定的 ${args.elementIds.length} 个元素`
		: "整张画板内容";
	return {
		toolName: "excalidraw_center_view",
		summary: `已将${targetDesc}平滑居中聚焦到当前视口视野。`,
		items: [],
		references: [],
		isMutation: true,
	};
}

export const excalidrawCenterViewToolDef = toolDefinition({
	metadata: {
		executionClass: "context-dependent",
		requiresView: "excalidraw",
		clientAction: "canvas",
	},
	name: "excalidraw_center_view",
	description:
		"将当前 Excalidraw 画板视野平移并缩放到所有图形中央；可传入 elementIds 仅聚焦指定元素。当用户说「居中/视野移到中央/画板内容居中显示」时使用本工具。",
	inputSchema: excalidrawCenterViewInputSchema,
});
