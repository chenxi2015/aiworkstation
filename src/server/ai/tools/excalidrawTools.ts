import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";
import {
	headlessCreateExcalidrawBoard,
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
	excalidraw_create_board: "global-headless",
	excalidraw_draw_elements: "content-generating",
	excalidraw_update_element: "context-dependent",
	excalidraw_clear_canvas: "context-dependent",
	excalidraw_center_view: "context-dependent",
};

/** Runtime context for dual-path execution decisions */
export interface ExcalidrawToolRuntime {
	/** Currently open note path in the obsidian module, if any */
	activeNotePath?: string;
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

export const excalidrawCreateBoardInputSchema = z.object({
	name: z
		.string()
		.describe(
			"Name of the Excalidraw drawing file (without .excalidraw extension)",
		),
	dir: z
		.string()
		.optional()
		.describe(
			"Relative folder path inside Vault, e.g. 'diagrams'; empty or omitted for Vault root",
		),
	overwrite: z
		.boolean()
		.optional()
		.default(false)
		.describe(
			"当同名画板已存在时是否重置为空白画板重新绘制。仅在用户明确要求重画/覆盖时传 true；否则同名时自动追加序号，且内容写入仍应指向原画板",
		),
});

export type ExcalidrawCreateBoardInput = z.input<
	typeof excalidrawCreateBoardInputSchema
>;

export function executeExcalidrawCreateBoard(
	args: ExcalidrawCreateBoardInput,
): ToolExecutionResult {
	const dirText = args.dir ? `在「${args.dir}」目录下` : "";
	const name = args.name.replace(/\.excalidraw$/i, "");
	return {
		toolName: "excalidraw_create_board",
		summary: `已新建${dirText} Excalidraw 画板文件「${name}」并在画板视图中自动打开。`,
		items: [],
		references: [],
		isMutation: true,
	};
}

export const excalidrawCreateBoardToolDef = toolDefinition({
	name: "excalidraw_create_board",
	description:
		"在 Obsidian Vault 中创建新的 Excalidraw 画板文件（.excalidraw）并自动在画板视图中打开。若需要在新画板中绘制架构或流程图，可在调用此工具后紧接着调用 excalidraw_draw_elements 写入内容。",
	inputSchema: excalidrawCreateBoardInputSchema,
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
	// Board is open in the view only when the obsidian module has it active;
	// in that case the frontend bridge handles rendering. Otherwise headless.
	const boardOpen = Boolean(activeNotePath?.endsWith(".excalidraw"));
	/** 会话内最近一次创建的画板：创建即成为后续 draw_elements 的写入目标 */
	let sessionBoardPath: string | undefined;

	return [
		excalidrawCreateBoardToolDef.server((args) =>
			wrapExecution(
				"excalidraw_create_board",
				args,
				// Creation is always headless (atomic Vault file write); when the
				// obsidian module is active the frontend additionally opens the file
				// via the bridge action triggered from the streamed step.
				async () => {
					const result = await headlessCreateExcalidrawBoard(args);
					sessionBoardPath = result.navigation?.searchParams?.note;
					return result;
				},
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
						// Live path: frontend bridge renders with animation via streamed step.
						return executeExcalidrawDrawElements(args);
					}
					return headlessDrawExcalidrawElements(
						args,
						targetPath ?? sessionBoardPath ?? activeNotePath,
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
