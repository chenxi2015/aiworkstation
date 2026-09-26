import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";
import { wrapExecution } from "./index.ts";
import type { BookmarkToolHooks, ToolExecutionResult } from "./types.ts";

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
	name: "canvas_create_elements",
	description:
		"在当前 Obsidian Canvas 白板中批量创建节点与连线（支持思维导图、架构流程图、知识对比卡片等）。前端将自动计算合理坐标并实时渲染呈现，同时支持一键撤销。",
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
	name: "canvas_update_node",
	description: "更新 Obsidian Canvas 白板中指定卡片的文本内容或颜色样式。",
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
	name: "canvas_tidy_layout",
	description:
		"对当前 Obsidian Canvas 白板进行一键排版规整（标准化卡片尺寸、消除节点重叠碰撞、吸附网格对齐、并优化连线锚点与方向）。",
	inputSchema: canvasTidyLayoutInputSchema,
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
	name: "canvas_create_group",
	description:
		"在当前 Obsidian Canvas 白板中为指定的一组已有节点创建矩形分组框（容器），前端自动计算外接包围盒并自适应内边距，实现模块化区域划分。",
	inputSchema: canvasCreateGroupInputSchema,
});

export const canvasCreateBoardInputSchema = z.object({
	name: z
		.string()
		.describe(
			"新白板的名称或主题（例如：'微服务架构图'、'用户生命周期'、'2026产品规划'，无需输入 .canvas 后缀）",
		),
	dir: z
		.string()
		.optional()
		.describe(
			"存放白板的相对目录路径（例如：'架构设计'，留空或省略则保存在当前目录或 Vault 根目录）",
		),
});

export type CanvasCreateBoardInput = z.input<
	typeof canvasCreateBoardInputSchema
>;

export function executeCanvasCreateBoard(
	args: CanvasCreateBoardInput,
): ToolExecutionResult {
	const dirText = args.dir ? `在「${args.dir}」目录下` : "";
	return {
		toolName: "canvas_create_board",
		summary: `已成功${dirText}创建空白白板「${args.name}」并自动在编辑器中打开画布视图。`,
		items: [],
		references: [],
		isMutation: true,
	};
}

export const canvasCreateBoardToolDef = toolDefinition({
	name: "canvas_create_board",
	description:
		"在 Obsidian Vault 中创建新的 Canvas 空白白板文件（.canvas）并自动在编辑器中打开白板画布视图。注意：此工具仅负责创建并打开空白白板；若需要向白板中写入节点、连线与脑图，必须在调用此工具后紧接着调用 canvas_create_elements 写入内容。",
	inputSchema: canvasCreateBoardInputSchema,
});

export function createCanvasServerTools(hooks?: BookmarkToolHooks) {
	return [
		canvasCreateBoardToolDef.server((args) =>
			wrapExecution(
				"canvas_create_board",
				args,
				() => executeCanvasCreateBoard(args),
				hooks,
			),
		),
		canvasCreateElementsToolDef.server((args) =>
			wrapExecution(
				"canvas_create_elements",
				args,
				() => executeCanvasCreateElements(args),
				hooks,
			),
		),
		canvasCreateGroupToolDef.server((args) =>
			wrapExecution(
				"canvas_create_group",
				args,
				() => executeCanvasCreateGroup(args),
				hooks,
			),
		),
		canvasUpdateNodeToolDef.server((args) =>
			wrapExecution(
				"canvas_update_node",
				args,
				() => executeCanvasUpdateNode(args),
				hooks,
			),
		),
		canvasTidyLayoutToolDef.server((args) =>
			wrapExecution(
				"canvas_tidy_layout",
				args,
				() => executeCanvasTidyLayout(args),
				hooks,
			),
		),
	];
}
