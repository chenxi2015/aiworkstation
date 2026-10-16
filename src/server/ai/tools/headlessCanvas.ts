import {
	type AiGroupInput,
	layoutAiElements,
} from "../../../components/obsidian/canvas/canvasLayoutEngine.ts";
import type { CanvasData } from "../../../components/obsidian/canvas/canvasUtils.ts";
import { readVaultNote, saveVaultNote } from "../../services/obsidian/note.ts";
import { createDraft } from "../drafts/draftStore.ts";
import type {
	CanvasCreateElementsInput,
	DraftCanvasInput,
} from "./canvasTools.ts";
import type { ToolExecutionResult, ToolNavigation } from "./types.ts";

/**
 * Headless execution for Obsidian Canvas (.canvas) content generation.
 * Canvas files are plain JSON ({nodes, edges}); the layout engine is a pure
 * function with no browser dependency, so server-side generation is safe.
 */

function obsidianNavigation(relPath: string, label: string): ToolNavigation {
	return {
		route: "/obsidian",
		searchParams: { note: relPath },
		label,
	};
}

/** Headlessly create canvas elements into a .canvas file that is not open */
export async function headlessCreateCanvasElements(
	args: CanvasCreateElementsInput,
	activeNotePath?: string,
): Promise<ToolExecutionResult> {
	if (!activeNotePath || !activeNotePath.endsWith(".canvas")) {
		throw new Error(
			"未指定目标白板。请在笔记模块打开一个 .canvas 白板文件后再执行修改。",
		);
	}

	const note = await readVaultNote(activeNotePath);
	const parsed: CanvasData = { nodes: [], edges: [] };
	try {
		const raw = JSON.parse(note.content);
		if (Array.isArray(raw.nodes)) parsed.nodes = raw.nodes;
		if (Array.isArray(raw.edges)) parsed.edges = raw.edges;
	} catch {
		throw new Error(`白板文件「${activeNotePath}」内容不是合法 JSON，无法写入`);
	}

	const { nodes: newNodes, edges: newEdges } = layoutAiElements(
		args.nodes.map((n) => ({ ...n, type: n.type ?? ("text" as const) })),
		args.edges ?? [],
		{
			existingNodes: parsed.nodes,
			layout: args.layout ?? "horizontal_tree",
			referenceNodeId: args.referenceNodeId,
		},
		(args.groups ?? []) as AiGroupInput[],
	);

	const next: CanvasData = {
		nodes: [...parsed.nodes, ...newNodes],
		edges: [...parsed.edges, ...newEdges],
	};

	const save = await saveVaultNote(
		activeNotePath,
		JSON.stringify(next, null, 2),
		note.mtime,
	);
	if (!save.success) {
		throw new Error(
			save.conflict
				? "白板在别处被修改，为避免覆盖已放弃写入，请重试"
				: save.error || "写入白板失败",
		);
	}

	const name = activeNotePath.split("/").pop() ?? activeNotePath;
	const groupCount = args.groups?.length ?? 0;
	const groupText = groupCount > 0 ? `与 ${groupCount} 个分组框` : "";
	return {
		toolName: "canvas_create_elements",
		summary: `已静默向白板「${name}」写入 ${newNodes.length} 个节点、${newEdges.length} 条连线${groupText}。点击下方卡片跳转查看。`,
		items: [],
		references: [],
		isMutation: true,
		navigation: obsidianNavigation(activeNotePath, "打开白板"),
	};
}

/**
 * Generates an Obsidian Canvas draft in one atomic step and returns a delivery card navigation.
 * No Vault file is touched until the user confirms save on the delivery card.
 */
export async function executeDraftCanvas(
	args: DraftCanvasInput,
	sessionId?: string,
): Promise<ToolExecutionResult> {
	const title = (args.title || "未命名白板").trim();
	const { nodes: newNodes, edges: newEdges } = layoutAiElements(
		args.nodes.map((n) => ({ ...n, type: n.type ?? ("text" as const) })),
		args.edges ?? [],
		{
			existingNodes: [],
			layout: args.layout ?? "horizontal_tree",
		},
		(args.groups ?? []) as AiGroupInput[],
	);

	const content = JSON.stringify(
		{
			nodes: newNodes,
			edges: newEdges,
		},
		null,
		2,
	);

	const totalCount = newNodes.length + newEdges.length;
	const draft = createDraft({
		title,
		content,
		kind: "canvas",
		sessionId,
		wordCount: totalCount,
	});

	const groupCount = args.groups?.length ?? 0;
	const groupText = groupCount > 0 ? `与 ${groupCount} 个分组框` : "";
	return {
		toolName: "draft_canvas",
		summary: `已为「${title}」生成 Canvas 白板草稿（共 ${newNodes.length} 个节点、${newEdges.length} 条连线${groupText}）。正文已暂存本地草稿区，等待用户在交付卡片中确认保存。`,
		items: [],
		references: [],
		isMutation: true,
		navigation: {
			route: "",
			searchParams: { draftId: draft.id },
			label: "存为白板",
			draftId: draft.id,
			draftKind: "canvas",
			title,
			wordCount: totalCount,
		},
	};
}
