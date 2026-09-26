import {
	type CanvasEdge,
	type CanvasNode,
	guessSides,
} from "./canvasUtils";

export interface AiNodeInput {
	id: string;
	type: "text" | "file" | "group" | "link";
	text?: string;
	file?: string;
	label?: string;
	color?: string;
}

export interface AiEdgeInput {
	fromNode: string;
	toNode: string;
	label?: string;
	color?: string;
	toEnd?: "arrow" | "none";
}

export interface AiGroupInput {
	id?: string;
	label: string;
	nodeIds: string[];
	color?: string;
}

export interface LayoutOptions {
	layout?: "horizontal_tree" | "vertical_tree" | "grid" | "free";
	referenceNodeId?: string;
	existingNodes: CanvasNode[];
}

const DEFAULT_NODE_WIDTH = 260;
const DEFAULT_NODE_HEIGHT = 140;
const HORIZONTAL_GAP_X = 100;
const HORIZONTAL_GAP_Y = 30;
const GRID_GAP = 40;

/**
 * Calculate canvas bounding box of existing nodes
 */
export function getCanvasBounds(nodes: CanvasNode[]) {
	if (nodes.length === 0) {
		return { minX: 0, maxX: 0, minY: 0, maxY: 0, width: 0, height: 0 };
	}
	let minX = Infinity;
	let maxX = -Infinity;
	let minY = Infinity;
	let maxY = -Infinity;

	for (const n of nodes) {
		minX = Math.min(minX, n.x);
		maxX = Math.max(maxX, n.x + n.width);
		minY = Math.min(minY, n.y);
		maxY = Math.max(maxY, n.y + n.height);
	}
	return { minX, maxX, minY, maxY, width: maxX - minX, height: maxY - minY };
}

/**
 * Compute enclosing group bounding box for target nodes with comfortable padding
 */
export function computeGroupBounds(
	targetNodes: CanvasNode[],
	label: string,
	id = `ai_group_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
	color?: string,
	padding = 32,
): CanvasNode | null {
	if (targetNodes.length === 0) return null;
	const bounds = getCanvasBounds(targetNodes);
	const topHeaderOffset = 18;
	return {
		id,
		type: "group",
		label,
		x: Math.round(bounds.minX - padding),
		y: Math.round(bounds.minY - padding - topHeaderOffset),
		width: Math.round(bounds.width + padding * 2),
		height: Math.round(bounds.height + padding * 2 + topHeaderOffset),
		color,
	};
}

/**
 * Compute auto-layout positions for AI generated nodes, edges and group containers
 */
export function layoutAiElements(
	rawNodes: AiNodeInput[],
	rawEdges: AiEdgeInput[] = [],
	options: LayoutOptions,
	rawGroups: AiGroupInput[] = [],
): { nodes: CanvasNode[]; edges: CanvasEdge[] } {
	if (rawNodes.length === 0) {
		return { nodes: [], edges: [] };
	}

	const { existingNodes, layout = "horizontal_tree", referenceNodeId } = options;
	const bounds = getCanvasBounds(existingNodes);

	// Determine starting anchor point (x, y)
	let startX = 0;
	let startY = 0;

	if (referenceNodeId) {
		const refNode = existingNodes.find((n) => n.id === referenceNodeId);
		if (refNode) {
			startX = refNode.x + refNode.width + HORIZONTAL_GAP_X;
			startY = refNode.y;
		} else {
			startX = existingNodes.length > 0 ? bounds.maxX + 120 : 0;
			startY = existingNodes.length > 0 ? bounds.minY : 0;
		}
	} else if (existingNodes.length > 0) {
		startX = bounds.maxX + 120;
		startY = bounds.minY;
	}

	const nodePositions = new Map<string, { x: number; y: number; width: number; height: number }>();

	if (layout === "grid") {
		const cols = rawNodes.length <= 4 ? 2 : 3;
		rawNodes.forEach((node, index) => {
			const col = index % cols;
			const row = Math.floor(index / cols);
			nodePositions.set(node.id, {
				x: startX + col * (DEFAULT_NODE_WIDTH + GRID_GAP),
				y: startY + row * (DEFAULT_NODE_HEIGHT + GRID_GAP),
				width: DEFAULT_NODE_WIDTH,
				height: DEFAULT_NODE_HEIGHT,
			});
		});
	} else if (layout === "vertical_tree") {
		// Top-down hierarchy
		const childrenMap = new Map<string, string[]>();
		const inDegree = new Map<string, number>();
		rawNodes.forEach((n) => inDegree.set(n.id, 0));

		rawEdges.forEach((e) => {
			const arr = childrenMap.get(e.fromNode) ?? [];
			arr.push(e.toNode);
			childrenMap.set(e.fromNode, arr);
			inDegree.set(e.toNode, (inDegree.get(e.toNode) ?? 0) + 1);
		});

		// Find roots
		const roots = rawNodes.filter((n) => (inDegree.get(n.id) ?? 0) === 0);
		const effectiveRoots = roots.length > 0 ? roots : [rawNodes[0]];

		let curY = startY;
		const visited = new Set<string>();

		const placeLevel = (nodeIds: string[], levelY: number) => {
			if (nodeIds.length === 0) return;
			const totalWidth = nodeIds.length * DEFAULT_NODE_WIDTH + (nodeIds.length - 1) * 40;
			let curX = startX - totalWidth / 2 + DEFAULT_NODE_WIDTH / 2;

			const nextLevelIds: string[] = [];
			for (const id of nodeIds) {
				if (visited.has(id)) continue;
				visited.add(id);
				nodePositions.set(id, {
					x: curX,
					y: levelY,
					width: DEFAULT_NODE_WIDTH,
					height: DEFAULT_NODE_HEIGHT,
				});
				curX += DEFAULT_NODE_WIDTH + 40;
				const kids = childrenMap.get(id) ?? [];
				kids.forEach((k) => nextLevelIds.push(k));
			}

			if (nextLevelIds.length > 0) {
				placeLevel(nextLevelIds, levelY + DEFAULT_NODE_HEIGHT + 80);
			}
		};

		placeLevel(effectiveRoots.map((r) => r.id), curY);

		// Fallback for disconnected nodes
		rawNodes.forEach((n, idx) => {
			if (!nodePositions.has(n.id)) {
				nodePositions.set(n.id, {
					x: startX + idx * (DEFAULT_NODE_WIDTH + 20),
					y: curY + DEFAULT_NODE_HEIGHT + 180,
					width: DEFAULT_NODE_WIDTH,
					height: DEFAULT_NODE_HEIGHT,
				});
			}
		});
	} else {
		// Default: horizontal_tree (Mindmap extending to the right)
		const childrenMap = new Map<string, string[]>();
		const inDegree = new Map<string, number>();
		rawNodes.forEach((n) => inDegree.set(n.id, 0));

		rawEdges.forEach((e) => {
			const arr = childrenMap.get(e.fromNode) ?? [];
			arr.push(e.toNode);
			childrenMap.set(e.fromNode, arr);
			inDegree.set(e.toNode, (inDegree.get(e.toNode) ?? 0) + 1);
		});

		const roots = rawNodes.filter((n) => (inDegree.get(n.id) ?? 0) === 0);
		const effectiveRoots = roots.length > 0 ? roots : [rawNodes[0]];

		let curGlobalY = startY;
		const visited = new Set<string>();

		const layoutNodeAndDescendants = (nodeId: string, depth: number): number => {
			if (visited.has(nodeId)) return 0;
			visited.add(nodeId);

			const children = (childrenMap.get(nodeId) ?? []).filter((id) => !visited.has(id));
			const x = startX + depth * (DEFAULT_NODE_WIDTH + HORIZONTAL_GAP_X);

			if (children.length === 0) {
				const y = curGlobalY;
				curGlobalY += DEFAULT_NODE_HEIGHT + HORIZONTAL_GAP_Y;
				nodePositions.set(nodeId, {
					x,
					y,
					width: DEFAULT_NODE_WIDTH,
					height: DEFAULT_NODE_HEIGHT,
				});
				return y;
			}

			const childYPositions: number[] = [];
			for (const childId of children) {
				const cy = layoutNodeAndDescendants(childId, depth + 1);
				childYPositions.push(cy);
			}

			// Center parent vertically between its first and last child
			const firstChildY = childYPositions[0];
			const lastChildY = childYPositions[childYPositions.length - 1];
			const parentY = (firstChildY + lastChildY) / 2;

			nodePositions.set(nodeId, {
				x,
				y: parentY,
				width: DEFAULT_NODE_WIDTH,
				height: DEFAULT_NODE_HEIGHT,
			});
			return parentY;
		};

		for (const root of effectiveRoots) {
			layoutNodeAndDescendants(root.id, 0);
		}

		// Handle any remaining unvisited nodes
		for (const n of rawNodes) {
			if (!nodePositions.has(n.id)) {
				nodePositions.set(n.id, {
					x: startX,
					y: curGlobalY,
					width: DEFAULT_NODE_WIDTH,
					height: DEFAULT_NODE_HEIGHT,
				});
				curGlobalY += DEFAULT_NODE_HEIGHT + HORIZONTAL_GAP_Y;
			}
		}
	}

	// Build standard CanvasNode objects
	const finalNodes: CanvasNode[] = rawNodes.map((n) => {
		const pos = nodePositions.get(n.id) ?? {
			x: startX,
			y: startY,
			width: DEFAULT_NODE_WIDTH,
			height: DEFAULT_NODE_HEIGHT,
		};
		return {
			id: n.id,
			type: n.type,
			x: Math.round(pos.x),
			y: Math.round(pos.y),
			width: pos.width,
			height: pos.height,
			text: n.text,
			file: n.file,
			label: n.label,
			color: n.color,
		};
	});

	const nodeMap = new Map<string, CanvasNode>(finalNodes.map((n) => [n.id, n]));
	existingNodes.forEach((n) => {
		if (!nodeMap.has(n.id)) nodeMap.set(n.id, n);
	});

	// Build standard CanvasEdge objects with optimal side connection
	const finalEdges: CanvasEdge[] = rawEdges
		.map((e, idx) => {
			const from = nodeMap.get(e.fromNode);
			const to = nodeMap.get(e.toNode);
			if (!from || !to) return null;
			const sides = guessSides(from, to);
			return {
				id: `ai_edge_${Date.now()}_${idx}`,
				fromNode: e.fromNode,
				toNode: e.toNode,
				fromSide: sides.fromSide,
				toSide: sides.toSide,
				label: e.label,
				color: e.color,
				toEnd: e.toEnd ?? "arrow",
			} as CanvasEdge;
		})
		.filter((e): e is CanvasEdge => e !== null);

	// Compute enclosing group container nodes
	const groupNodes: CanvasNode[] = [];
	if (rawGroups && rawGroups.length > 0) {
		for (const grp of rawGroups) {
			const memberNodes = finalNodes.filter((n) => grp.nodeIds.includes(n.id));
			const groupNode = computeGroupBounds(
				memberNodes,
				grp.label,
				grp.id,
				grp.color,
			);
			if (groupNode) {
				groupNodes.push(groupNode);
			}
		}
	}

	// Prepend groups so ReactFlow paints them below regular cards
	return { nodes: [...groupNodes, ...finalNodes], edges: finalEdges };
}

export interface TidyLayoutOptions {
	layout?: "horizontal_tree" | "vertical_tree" | "grid" | "compact";
	standardizeWidth?: boolean;
	alignHandles?: boolean;
	targetNodeIds?: string[];
}

/**
 * Tidy up and normalize existing canvas nodes and edges:
 * Standardizes dimensions, snaps positions to 20px grid, eliminates overlaps,
 * and re-routes edge handles for optimal visual direction.
 */
export function tidyUpCanvasElements(
	existingNodes: CanvasNode[],
	existingEdges: CanvasEdge[],
	options: TidyLayoutOptions = {},
): { nodes: CanvasNode[]; edges: CanvasEdge[] } {
	if (existingNodes.length === 0) {
		return { nodes: [], edges: [] };
	}

	const {
		layout = "horizontal_tree",
		standardizeWidth = true,
		alignHandles = true,
		targetNodeIds,
	} = options;

	const targetIdSet =
		targetNodeIds && targetNodeIds.length > 0 ? new Set(targetNodeIds) : null;
	const isTarget = (id: string) => !targetIdSet || targetIdSet.has(id);

	// Separate group containers vs regular content cards
	const regularNodes = existingNodes.filter(
		(n) => n.type !== "group" && isTarget(n.id),
	);
	if (regularNodes.length === 0) {
		return { nodes: existingNodes, edges: existingEdges };
	}

	// Normalize dimensions
	const normalizedNodes = regularNodes.map((n) => {
		const width = standardizeWidth
			? DEFAULT_NODE_WIDTH
			: Math.round(n.width / 20) * 20;
		const height = Math.max(100, Math.round(n.height / 20) * 20);
		return {
			...n,
			width,
			height,
		};
	});

	// Anchor from the top-left of target nodes
	const initialBounds = getCanvasBounds(normalizedNodes);
	const startX = Math.round(initialBounds.minX / 20) * 20;
	const startY = Math.round(initialBounds.minY / 20) * 20;

	const rawNodes: AiNodeInput[] = normalizedNodes.map((n) => ({
		id: n.id,
		type: n.type,
		text: n.text,
		file: n.file,
		label: n.label,
		color: n.color,
	}));

	const relevantEdges: AiEdgeInput[] = existingEdges
		.filter((e) => isTarget(e.fromNode) && isTarget(e.toNode))
		.map((e) => ({
			fromNode: e.fromNode,
			toNode: e.toNode,
			label: e.label,
			color: e.color,
			toEnd: e.toEnd,
		}));

	const layoutResult = layoutAiElements(rawNodes, relevantEdges, {
		layout: layout === "compact" ? "grid" : layout,
		existingNodes: [],
	});

	const tidyNodeMap = new Map<string, CanvasNode>();
	layoutResult.nodes.forEach((n) => {
		const snappedNode: CanvasNode = {
			...n,
			x: Math.round((n.x + startX) / 20) * 20,
			y: Math.round((n.y + startY) / 20) * 20,
		};
		tidyNodeMap.set(n.id, snappedNode);
	});

	const finalNodes = existingNodes.map((n) => tidyNodeMap.get(n.id) ?? n);

	// Re-route edge handles
	const allNodesMap = new Map<string, CanvasNode>(
		finalNodes.map((n) => [n.id, n]),
	);
	const finalEdges = existingEdges.map((e) => {
		if (!alignHandles) return e;
		const from = allNodesMap.get(e.fromNode);
		const to = allNodesMap.get(e.toNode);
		if (!from || !to) return e;
		const sides = guessSides(from, to);
		return {
			...e,
			fromSide: sides.fromSide,
			toSide: sides.toSide,
		};
	});

	return { nodes: finalNodes, edges: finalEdges };
}

