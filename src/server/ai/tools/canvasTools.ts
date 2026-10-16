import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";
import type { ToolExecutionResult } from "./types.ts";

export const canvasNodeSchema = z.object({
	id: z
		.string()
		.describe("Unique identifier for this node (used for connecting edges)"),
	type: z
		.enum(["text", "file", "group"])
		.default("text")
		.describe(
			"Type of node: text (Markdown/Text card), file (link to vault note), group (container box)",
		),
	text: z
		.string()
		.optional()
		.describe("Content of text card (supports Markdown syntax)"),
	file: z
		.string()
		.optional()
		.describe(
			"Vault note relative path (required when type is file, e.g. 'work/project.md')",
		),
	label: z.string().optional().describe("Label of group or card"),
	color: z
		.enum(["1", "2", "3", "4", "5", "6"])
		.optional()
		.describe(
			"Obsidian preset color: 1(red), 2(orange), 3(yellow), 4(green), 5(cyan), 6(purple)",
		),
});

export const canvasEdgeSchema = z.object({
	fromNode: z.string().describe("Source node id"),
	toNode: z.string().describe("Target node id"),
	label: z
		.string()
		.optional()
		.describe(
			"Relationship or transition label on edge (e.g. 'calls', 'depends on')",
		),
	color: z.enum(["1", "2", "3", "4", "5", "6"]).optional(),
	toEnd: z
		.enum(["arrow", "none"])
		.default("arrow")
		.describe("Arrow marker at destination"),
});

export const canvasGroupSchema = z.object({
	id: z.string().optional().describe("Unique identifier for this group"),
	label: z
		.string()
		.describe("Label of the group (e.g. 'Core Services', 'Database Cluster')"),
	nodeIds: z
		.array(z.string())
		.min(1)
		.describe("List of node IDs enclosed inside this group"),
	color: z
		.enum(["1", "2", "3", "4", "5", "6"])
		.optional()
		.describe(
			"Obsidian preset color: 1(red), 2(orange), 3(yellow), 4(green), 5(cyan), 6(purple)",
		),
});

export const canvasCreateElementsInputSchema = z.object({
	targetPath: z
		.string()
		.optional()
		.describe(
			"目标白板相对路径（.canvas）。省略时作用于当前已打开的白板；仅在需要修改其他已有白板时指定",
		),
	layout: z
		.enum(["horizontal_tree", "vertical_tree", "grid", "free"])
		.default("horizontal_tree")
		.describe(
			"Layout pattern: horizontal_tree (mindmap extending right), vertical_tree (top-down hierarchy), grid (multi-card grid), free (custom positioning)",
		),
	referenceNodeId: z
		.string()
		.optional()
		.describe(
			"ID of an existing reference node to anchor near; omit to place in empty space",
		),
	nodes: z.array(canvasNodeSchema).min(1).describe("List of nodes to create"),
	edges: z
		.array(canvasEdgeSchema)
		.optional()
		.default([])
		.describe("Connecting edges between nodes"),
	groups: z
		.array(canvasGroupSchema)
		.optional()
		.default([])
		.describe("Visual grouping boxes enclosing designated nodes"),
});

export type CanvasCreateElementsInput = z.input<
	typeof canvasCreateElementsInputSchema
>;

export function executeCanvasCreateElements(
	args: CanvasCreateElementsInput,
): ToolExecutionResult {
	const nodeCount = args.nodes.length;
	const edgeCount = args.edges?.length ?? 0;
	const groupCount = args.groups?.length ?? 0;
	const groupText = groupCount > 0 ? `与 ${groupCount} 个分组框` : "";
	return {
		toolName: "canvas_create_elements",
		summary: `已在白板中生成 ${nodeCount} 个节点、${edgeCount} 条连线${groupText}（布局方式：${args.layout}）。`,
		items: [],
		references: [],
		isMutation: true,
	};
}

export const canvasCreateElementsToolDef = toolDefinition({
	metadata: { executionClass: "content-generating", clientAction: "canvas" },
	name: "canvas_create_elements",
	description:
		"【仅用于修改当前已打开的白板】在当前打开的 Obsidian Canvas 白板中批量追加节点与连线（支持思维导图、架构流程图、知识对比卡片等）。当用户说「创建/添加/补充/绘制/梳理节点、脑图、思维导图、架构、流程」到当前白板时使用本工具。严禁在新建白板流程中调用本工具！新建白板必须单步调用 draft_canvas 一次性生成完整草稿卡片。",
	inputSchema: canvasCreateElementsInputSchema,
});

export const canvasUpdateNodeInputSchema = z.object({
	nodeId: z.string().describe("ID of the target node to update"),
	text: z.string().optional().describe("New text content for the node"),
	color: z
		.enum(["1", "2", "3", "4", "5", "6"])
		.optional()
		.describe(
			"Obsidian preset color: 1(red), 2(orange), 3(yellow), 4(green), 5(cyan), 6(purple)",
		),
});

export type CanvasUpdateNodeInput = z.input<typeof canvasUpdateNodeInputSchema>;

export function executeCanvasUpdateNode(
	args: CanvasUpdateNodeInput,
): ToolExecutionResult {
	return {
		toolName: "canvas_update_node",
		summary: `已更新白板节点 ${args.nodeId} 的内容与样式。`,
		items: [],
		references: [],
		isMutation: true,
	};
}

export const canvasUpdateNodeToolDef = toolDefinition({
	metadata: {
		executionClass: "context-dependent",
		requiresView: "canvas",
		clientAction: "canvas",
	},
	name: "canvas_update_node",
	description:
		"更新 Obsidian Canvas 白板中指定卡片的文本内容或颜色样式。当用户说「修改/更新白板中某个卡片的文字或颜色」时使用本工具。",
	inputSchema: canvasUpdateNodeInputSchema,
});

export const canvasTidyLayoutInputSchema = z.object({
	layout: z
		.enum(["horizontal_tree", "vertical_tree", "grid", "compact"])
		.default("horizontal_tree")
		.describe(
			"规整排版拓扑形式：horizontal_tree(水平脑图分层向右)、vertical_tree(垂直流程自顶向下)、grid(整齐网格矩阵)、compact(紧凑排布消除空隙)",
		),
	standardizeWidth: z
		.boolean()
		.default(true)
		.describe("是否将卡片宽度规整为统一标准尺寸（260px），提升视觉整洁度"),
	alignHandles: z
		.boolean()
		.default(true)
		.describe(
			"是否自动重新优化所有连线的起始与终点连接面（top/bottom/left/right），消除连线绕路与交叉",
		),
	targetNodeIds: z
		.array(z.string())
		.optional()
		.describe("仅规整指定的局部节点；省略时默认规整整张白板"),
});

export type CanvasTidyLayoutInput = z.input<typeof canvasTidyLayoutInputSchema>;

export function executeCanvasTidyLayout(
	args: CanvasTidyLayoutInput,
): ToolExecutionResult {
	return {
		toolName: "canvas_tidy_layout",
		summary: `已按 ${args.layout} 模式对当前白板进行几何规整、对齐网格与优化连线。`,
		items: [],
		references: [],
		isMutation: true,
	};
}

export const canvasTidyLayoutToolDef = toolDefinition({
	metadata: {
		executionClass: "context-dependent",
		requiresView: "canvas",
		clientAction: "canvas",
	},
	name: "canvas_tidy_layout",
	description:
		"对当前 Obsidian Canvas 白板进行一键排版规整（标准化卡片尺寸、消除节点重叠碰撞、吸附网格对齐、并优化连线锚点与方向）。当用户说「规整/排版/对齐/重排/整理白板/优化布局或连线/切换布局模式」时使用本工具。",
	inputSchema: canvasTidyLayoutInputSchema,
});

export const canvasCenterViewInputSchema = z.object({
	targetNodeIds: z
		.array(z.string())
		.optional()
		.describe("仅将指定节点移动到视野中央；省略时聚焦整张白板内容"),
});

export type CanvasCenterViewInput = z.input<typeof canvasCenterViewInputSchema>;

export function executeCanvasCenterView(
	args: CanvasCenterViewInput,
): ToolExecutionResult {
	const targetText = args.targetNodeIds?.length
		? `指定的 ${args.targetNodeIds.length} 个节点`
		: "整张白板内容";
	return {
		toolName: "canvas_center_view",
		summary: `已将${targetText}平滑居中到白板视野。`,
		items: [],
		references: [],
		isMutation: true,
	};
}

export const canvasCenterViewToolDef = toolDefinition({
	metadata: {
		executionClass: "context-dependent",
		requiresView: "canvas",
		clientAction: "canvas",
	},
	name: "canvas_center_view",
	description:
		"将当前 Obsidian Canvas 白板视野平移并缩放到整张白板内容中央；可传 targetNodeIds 仅聚焦指定节点。不修改节点坐标或白板文件内容。当用户说「居中/视野移到中央/内容居中显示」时使用本工具。",
	inputSchema: canvasCenterViewInputSchema,
});

export const canvasCreateGroupInputSchema = z.object({
	label: z
		.string()
		.describe("分组框标题/描述（如：业务服务层、数据存储、关键链路）"),
	nodeIds: z
		.array(z.string())
		.min(1)
		.describe("要包含在分组框内的节点 ID 列表"),
	color: z
		.enum(["1", "2", "3", "4", "5", "6"])
		.optional()
		.describe("Obsidian 预设颜色：1(红), 2(橙), 3(黄), 4(绿), 5(青), 6(紫)"),
});

export type CanvasCreateGroupInput = z.input<
	typeof canvasCreateGroupInputSchema
>;

export function executeCanvasCreateGroup(
	args: CanvasCreateGroupInput,
): ToolExecutionResult {
	return {
		toolName: "canvas_create_group",
		summary: `已为节点 [${args.nodeIds.join(", ")}] 创建名为「${args.label}」的分组框。`,
		items: [],
		references: [],
		isMutation: true,
	};
}

export const canvasCreateGroupToolDef = toolDefinition({
	metadata: {
		executionClass: "context-dependent",
		requiresView: "canvas",
		clientAction: "canvas",
	},
	name: "canvas_create_group",
	description:
		"在当前 Obsidian Canvas 白板中为指定的一组已有节点创建矩形分组框（容器），前端自动计算外接包围盒并自适应内边距，实现模块化区域划分。",
	inputSchema: canvasCreateGroupInputSchema,
});

export const draftCanvasInputSchema = z.object({
	title: z
		.string()
		.describe("白板名称或主题（如：'微服务架构白板'、'知识对比卡片'）"),
	layout: z
		.enum(["horizontal_tree", "vertical_tree", "grid", "free"])
		.default("horizontal_tree")
		.describe(
			"排版拓扑：horizontal_tree (脑图分层向右展开，最推荐), vertical_tree (自顶向下分层), grid (整齐网格卡片矩阵), free (自由分布)",
		),
	nodes: z.array(canvasNodeSchema).min(1).describe("白板节点列表"),
	edges: z
		.array(canvasEdgeSchema)
		.optional()
		.default([])
		.describe("节点之间的连线关系"),
	groups: z
		.array(canvasGroupSchema)
		.optional()
		.default([])
		.describe("逻辑模块分组框"),
});

export type DraftCanvasInput = z.input<typeof draftCanvasInputSchema>;

export const draftCanvasToolDef = toolDefinition({
	metadata: { executionClass: "content-generating", clientAction: "draft" },
	name: "draft_canvas",
	description:
		"【新建白板唯一入口】在一步内规划并生成完整的 Obsidian Canvas 白板脑图、架构图或对比卡片草稿。当用户说「新建/创建/建个/建一个/新开白板或 Canvas」时必须调用本工具。草稿暂存本地草稿区，以交付卡片形式供用户确认后落盘保存并打开。严禁分步创建空白白板，严禁后续再调用 canvas_create_elements，必须在所有分析完成后一次性调用本工具产出完整白板草稿。",
	inputSchema: draftCanvasInputSchema,
});
