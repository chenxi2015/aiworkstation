import { type Edge, MarkerType, type Node } from "@xyflow/react";
import type {
	CanvasCardFlowNode,
	CanvasGroupFlowNode,
	CanvasNodeActions,
} from "./CanvasFlowNodes";
import {
	type CanvasData,
	type CanvasEdge,
	type CanvasNode,
	guessSides,
	resolveColor,
} from "./canvasUtils";

export const DEFAULT_EDGE_COLOR = "var(--muted, #8b8b8b)";

/**
 * Safely parse a JSON Canvas text into structured CanvasData
 */
export function parseCanvas(content: string): {
	data: CanvasData | null;
	error: string | null;
} {
	try {
		const raw = JSON.parse(content || "{}") as Partial<CanvasData>;
		return {
			data: {
				nodes: Array.isArray(raw.nodes) ? raw.nodes : [],
				edges: Array.isArray(raw.edges) ? raw.edges : [],
			},
			error: null,
		};
	} catch (err) {
		return {
			data: null,
			error: err instanceof Error ? err.message : "JSON parse failed",
		};
	}
}

/**
 * Generate a unique ID for new nodes or edges
 */
export function genId(): string {
	return Math.random().toString(16).slice(2, 10) + Date.now().toString(16);
}

/**
 * Extract side string from handle ID (e.g., "s-top" -> "top")
 */
export function sideOf(
	handle: string | null | undefined,
): CanvasEdge["fromSide"] {
	const side = handle?.replace(/^[st]-/, "");
	return side === "top" ||
		side === "right" ||
		side === "bottom" ||
		side === "left"
		? side
		: undefined;
}

/**
 * Create default style and marker configuration for an edge
 */
export function defaultEdgeProps(): Pick<
	Edge,
	"type" | "style" | "labelStyle" | "markerEnd" | "interactionWidth"
> {
	return {
		type: "canvasEdge",
		style: { stroke: DEFAULT_EDGE_COLOR, strokeWidth: 1.5 },
		labelStyle: { fill: DEFAULT_EDGE_COLOR },
		markerEnd: {
			type: MarkerType.ArrowClosed,
			width: 16,
			height: 16,
			color: DEFAULT_EDGE_COLOR,
		},
		interactionWidth: 20,
	};
}

/**
 * Convert CanvasEdge model to ReactFlow Edge
 */
export function toFlowEdge(
	edge: CanvasEdge,
	byId: Map<string, CanvasNode>,
): Edge | null {
	const from = byId.get(edge.fromNode);
	const to = byId.get(edge.toNode);
	if (!from || !to) return null;
	const guessed = guessSides(from, to);
	const color = resolveColor(edge.color) ?? DEFAULT_EDGE_COLOR;
	const fromEnd = edge.fromEnd;
	const toEnd = edge.toEnd;
	const showMarkerStart = fromEnd === "arrow";
	const showMarkerEnd = toEnd !== "none";

	return {
		id: edge.id,
		type: "canvasEdge",
		source: edge.fromNode,
		target: edge.toNode,
		sourceHandle: `s-${edge.fromSide ?? guessed.fromSide}`,
		targetHandle: `t-${edge.toSide ?? guessed.toSide}`,
		style: { stroke: color, strokeWidth: 1.5 },
		markerStart: showMarkerStart
			? { type: MarkerType.ArrowClosed, width: 16, height: 16, color }
			: undefined,
		markerEnd: showMarkerEnd
			? { type: MarkerType.ArrowClosed, width: 16, height: 16, color }
			: undefined,
		interactionWidth: 24,
		data: {
			rawColor: edge.color,
			label: edge.label,
			fromEnd,
			toEnd,
		},
	};
}

export interface FlowBuildOptions extends CanvasNodeActions {
	readOnly: boolean;
	editingId: string | null;
	onNavigateNote?: (relPath: string) => void;
	onCommitText: (id: string, text: string) => void;
	onCommitLabel: (id: string, label: string) => void;
}

/**
 * Convert CanvasNode array into ReactFlow Node array
 */
export function toFlowNodes(
	canvasNodes: CanvasNode[],
	opts: FlowBuildOptions,
): Node[] {
	const groups: Node[] = [];
	const cards: Node[] = [];

	for (const node of canvasNodes) {
		if (node.type === "group") {
			const groupNode: CanvasGroupFlowNode = {
				id: node.id,
				type: "canvasGroup",
				position: { x: node.x, y: node.y },
				data: {
					label: node.label,
					color: node.color,
					readOnly: opts.readOnly,
					editing: opts.editingId === node.id,
					onCommitLabel: opts.onCommitLabel,
					onDeleteNode: opts.onDeleteNode,
					onSetColor: opts.onSetColor,
					onStartEdit: opts.onStartEdit,
				},
				width: node.width,
				height: node.height,
				draggable: !opts.readOnly,
				selectable: !opts.readOnly,
			};
			groups.push(groupNode);
		} else {
			const cardNode: CanvasCardFlowNode = {
				id: node.id,
				type: "canvasCard",
				position: { x: node.x, y: node.y },
				data: {
					canvasNode: node,
					onNavigateNote: opts.onNavigateNote,
					readOnly: opts.readOnly,
					editing: opts.editingId === node.id,
					onCommitText: opts.onCommitText,
					onDeleteNode: opts.onDeleteNode,
					onSetColor: opts.onSetColor,
					onStartEdit: opts.onStartEdit,
				},
				width: node.width,
				height: node.height,
				draggable: !opts.readOnly,
				selectable: !opts.readOnly,
			};
			cards.push(cardNode);
		}
	}

	// Groups render first so cards paint above them
	return [...groups, ...cards];
}

/**
 * Serialize ReactFlow graph back to JSON Canvas text
 */
export function serializeCanvas(nodes: Node[], edges: Edge[]): string {
	const canvasNodes: CanvasNode[] = [];
	for (const node of nodes) {
		const x = Math.round(node.position.x);
		const y = Math.round(node.position.y);
		const width = Math.round(node.measured?.width ?? node.width ?? 0);
		const height = Math.round(node.measured?.height ?? node.height ?? 0);

		if (node.type === "canvasGroup") {
			const data = node.data as { label?: string; color?: string };
			canvasNodes.push({
				id: node.id,
				type: "group",
				x,
				y,
				width,
				height,
				...(data.color ? { color: data.color } : {}),
				...(data.label ? { label: data.label } : {}),
			});
		} else {
			const { canvasNode } = node.data as { canvasNode: CanvasNode };
			canvasNodes.push({ ...canvasNode, x, y, width, height });
		}
	}

	const canvasEdges: CanvasEdge[] = edges.map((edge) => {
		const data = edge.data as
			| {
					rawColor?: string;
					label?: string;
					fromEnd?: "none" | "arrow";
					toEnd?: "none" | "arrow";
			  }
			| undefined;

		return {
			id: edge.id,
			fromNode: edge.source,
			...(sideOf(edge.sourceHandle)
				? { fromSide: sideOf(edge.sourceHandle) }
				: {}),
			toNode: edge.target,
			...(sideOf(edge.targetHandle)
				? { toSide: sideOf(edge.targetHandle) }
				: {}),
			...(data?.rawColor ? { color: data.rawColor } : {}),
			...(data?.label ? { label: data.label } : {}),
			...(data?.fromEnd ? { fromEnd: data.fromEnd } : {}),
			...(data?.toEnd ? { toEnd: data.toEnd } : {}),
		};
	});

	return JSON.stringify({ nodes: canvasNodes, edges: canvasEdges }, null, "\t");
}
