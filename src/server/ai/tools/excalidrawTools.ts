import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";
import {
	executeDraftExcalidraw,
	headlessDrawExcalidrawElements,
} from "./headlessExcalidraw.ts";
import { wrapExecution } from "./index.ts";
import type {
	BookmarkToolHooks,
	ToolExecutionClass,
	ToolExecutionResult,
} from "./types.ts";

/** Execution dependency metadata, keyed by tool name */
export const EXCALIDRAW_TOOL_CLASSES: Record<string, ToolExecutionClass> = {
	draft_excalidraw: "content-generating",
	excalidraw_draw_elements: "content-generating",
	excalidraw_update_element: "context-dependent",
	excalidraw_clear_canvas: "context-dependent",
	excalidraw_center_view: "context-dependent",
};

/** Runtime context for dual-path execution decisions */
export interface ExcalidrawToolRuntime {
	/** Currently open note path in the obsidian module, if any */
	activeNotePath?: string;
	/** Current AI conversation session ID for decoupled draft containment */
	sessionId?: string;
}

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
			"目标画板相对路径（.excalidraw）。省略时写入本会话最近一次创建/当前打开的画板；仅在需要写入其他已有画板时指定",
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
			"Connecting arrows between elements. Rules: connect strictly adjacent steps in chronological order (do NOT skip intermediate steps with cross-layer lines to the end node). For diamond decisions, connect the affirmative/main path to the next normal step, and connect the negative/failure path to an independent error/abort step with concise labels (e.g. '充足' vs '不足', '成功' vs '失败').",
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
	name: "excalidraw_draw_elements",
	description:
		"在当前 Excalidraw 画板中批量绘制高质量手绘流程图、系统架构图或思维导图。前端将自动进行 DAG 有向图拓扑分层排版与避障连线。规范：起始/结束用 ellipse，流程用 rectangle，判断用 diamond；分支动作必须拆分为独立节点，不可合并。",
	inputSchema: excalidrawDrawInputSchema,
});

export const draftExcalidrawInputSchema = z.object({
	title: z.string().describe("画板名称或主题（如：'黄金指数2026年底行情推演'、'微服务架构图'）"),
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
			"节点之间的连线箭头。规则：按时序严格连接相邻步骤。判断节点 diamond 的肯定分支连接下一步，否定分支连接独立异常步骤，并带有清晰简短标签（如'是'/'否'，'满足'/'不足'）。",
		),
});

export type DraftExcalidrawInput = z.input<
	typeof draftExcalidrawInputSchema
>;

export const draftExcalidrawToolDef = toolDefinition({
	name: "draft_excalidraw",
	description:
		"在一步内规划并生成完整的 Excalidraw 手绘流程图、系统架构图或推演图草稿。草稿将暂存本地草稿区，以交互卡片形式交付给用户确认是否存入 Vault。严禁分步创建空画板，请在分析完成后一次性调用本工具产出完整图形草稿。",
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
	name: "excalidraw_update_element",
	description: "更新 Excalidraw 画板中指定图形元素的文字内容或配色样式。",
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
	name: "excalidraw_clear_canvas",
	description: "清空当前 Excalidraw 画板的所有图形元素。",
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
	name: "excalidraw_center_view",
	description:
		"将当前 Excalidraw 画板视野平移并缩放到所有图形中央；可传入 elementIds 仅聚焦指定元素。",
	inputSchema: excalidrawCenterViewInputSchema,
});

export function createExcalidrawServerTools(
	hooks?: BookmarkToolHooks,
	runtime?: ExcalidrawToolRuntime,
) {
	const activeNotePath = runtime?.activeNotePath;
	const sessionId = runtime?.sessionId;
	const boardOpen = Boolean(activeNotePath?.endsWith(".excalidraw"));

	return [
		draftExcalidrawToolDef.server((args) =>
			wrapExecution(
				"draft_excalidraw",
				args,
				() => executeDraftExcalidraw(args, sessionId),
				hooks,
			),
		),
		excalidrawDrawElementsToolDef.server((args) =>
			wrapExecution(
				"excalidraw_draw_elements",
				args,
				async () => {
					const targetPath = args.targetPath;
					if (boardOpen && (!targetPath || targetPath === activeNotePath)) {
						// Live path: frontend bridge renders with animation on currently open board
						return executeExcalidrawDrawElements(args);
					}
					return headlessDrawExcalidrawElements(
						args,
						targetPath ?? activeNotePath,
					);
				},
				hooks,
			),
		),
		excalidrawUpdateElementToolDef.server((args) =>
			wrapExecution(
				"excalidraw_update_element",
				args,
				() => {
					if (!boardOpen) {
						throw new Error(
							"该操作需要目标画板正处于打开状态。请先跳转到笔记模块打开对应画板，再执行此操作。",
						);
					}
					return executeExcalidrawUpdateElement(args);
				},
				hooks,
			),
		),
		excalidrawClearCanvasToolDef.server((args) =>
			wrapExecution(
				"excalidraw_clear_canvas",
				args,
				() => {
					if (!boardOpen) {
						throw new Error(
							"该操作需要目标画板正处于打开状态。请先跳转到笔记模块打开对应画板，再执行此操作。",
						);
					}
					return executeExcalidrawClearCanvas();
				},
				hooks,
			),
		),
		excalidrawCenterViewToolDef.server((args) =>
			wrapExecution(
				"excalidraw_center_view",
				args,
				() => {
					if (!boardOpen) {
						throw new Error(
							"该操作需要目标画板正处于打开状态。请先跳转到笔记模块打开对应画板，再执行此操作。",
						);
					}
					return executeExcalidrawCenterView(args);
				},
				hooks,
			),
		),
	];
}
