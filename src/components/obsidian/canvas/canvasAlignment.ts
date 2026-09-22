import type { Node } from "@xyflow/react";
import type { CanvasNode } from "./canvasUtils";

export type AlignmentType =
	| "align-left"
	| "align-center-h"
	| "align-right"
	| "align-top"
	| "align-center-v"
	| "align-bottom"
	| "arrange-row"
	| "arrange-column"
	| "arrange-grid"
	| "distribute-h"
	| "distribute-v"
	| "stretch-width"
	| "stretch-height";

export interface BoundingBox {
	minX: number;
	minY: number;
	maxX: number;
	maxY: number;
	width: number;
	height: number;
}

/**
 * Get the effective width and height of a node
 */
export function getNodeDimensions(node: Node): {
	width: number;
	height: number;
} {
	const rawNode = (node.data as { canvasNode?: CanvasNode })?.canvasNode;
	const width = node.width ?? node.measured?.width ?? rawNode?.width ?? 250;
	const height = node.height ?? node.measured?.height ?? rawNode?.height ?? 100;
	return { width, height };
}

/**
 * Compute the bounding box enclosing a list of nodes
 */
export function getNodesBoundingBox(nodes: Node[]): BoundingBox | null {
	if (nodes.length === 0) return null;

	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;

	for (const node of nodes) {
		const { width, height } = getNodeDimensions(node);
		const x = node.position.x;
		const y = node.position.y;

		if (x < minX) minX = x;
		if (y < minY) minY = y;
		if (x + width > maxX) maxX = x + width;
		if (y + height > maxY) maxY = y + height;
	}

	return {
		minX,
		minY,
		maxX,
		maxY,
		width: maxX - minX,
		height: maxY - minY,
	};
}

/** Fixed spacing between arranged nodes */
const DEFAULT_GAP = 24;

/**
 * Align strategies mapping (Strategy Pattern)
 */
const alignmentStrategies: Record<
	AlignmentType,
	(selectedNodes: Node[], box: BoundingBox) => Map<string, Partial<Node>>
> = {
	"align-left": (nodes, box) => {
		const map = new Map<string, Partial<Node>>();
		for (const node of nodes) {
			map.set(node.id, { position: { x: box.minX, y: node.position.y } });
		}
		return map;
	},

	"align-center-h": (nodes, box) => {
		const centerX = box.minX + box.width / 2;
		const map = new Map<string, Partial<Node>>();
		for (const node of nodes) {
			const { width } = getNodeDimensions(node);
			map.set(node.id, {
				position: { x: Math.round(centerX - width / 2), y: node.position.y },
			});
		}
		return map;
	},

	"align-right": (nodes, box) => {
		const map = new Map<string, Partial<Node>>();
		for (const node of nodes) {
			const { width } = getNodeDimensions(node);
			map.set(node.id, {
				position: { x: box.maxX - width, y: node.position.y },
			});
		}
		return map;
	},

	"align-top": (nodes, box) => {
		const map = new Map<string, Partial<Node>>();
		for (const node of nodes) {
			map.set(node.id, { position: { x: node.position.x, y: box.minY } });
		}
		return map;
	},

	"align-center-v": (nodes, box) => {
		const centerY = box.minY + box.height / 2;
		const map = new Map<string, Partial<Node>>();
		for (const node of nodes) {
			const { height } = getNodeDimensions(node);
			map.set(node.id, {
				position: { x: node.position.x, y: Math.round(centerY - height / 2) },
			});
		}
		return map;
	},

	"align-bottom": (nodes, box) => {
		const map = new Map<string, Partial<Node>>();
		for (const node of nodes) {
			const { height } = getNodeDimensions(node);
			map.set(node.id, {
				position: { x: node.position.x, y: box.maxY - height },
			});
		}
		return map;
	},

	"arrange-row": (nodes, box) => {
		const map = new Map<string, Partial<Node>>();
		const sorted = [...nodes].sort((a, b) => a.position.x - b.position.x);
		let currentX = box.minX;

		for (const node of sorted) {
			const { width } = getNodeDimensions(node);
			map.set(node.id, {
				position: { x: currentX, y: box.minY },
			});
			currentX += width + DEFAULT_GAP;
		}
		return map;
	},

	"arrange-column": (nodes, box) => {
		const map = new Map<string, Partial<Node>>();
		const sorted = [...nodes].sort((a, b) => a.position.y - b.position.y);
		let currentY = box.minY;

		for (const node of sorted) {
			const { height } = getNodeDimensions(node);
			map.set(node.id, {
				position: { x: box.minX, y: currentY },
			});
			currentY += height + DEFAULT_GAP;
		}
		return map;
	},

	"arrange-grid": (nodes, box) => {
		const map = new Map<string, Partial<Node>>();
		const count = nodes.length;
		if (count === 0) return map;

		// Calculate reasonable columns count
		const cols = Math.ceil(Math.sqrt(count));
		const sorted = [...nodes].sort((a, b) => {
			if (Math.abs(a.position.y - b.position.y) > 30) {
				return a.position.y - b.position.y;
			}
			return a.position.x - b.position.x;
		});

		// Find column max widths and row max heights for neat grid
		const colWidths: number[] = [];
		const rowHeights: number[] = [];

		sorted.forEach((node, idx) => {
			const col = idx % cols;
			const row = Math.floor(idx / cols);
			const { width, height } = getNodeDimensions(node);
			colWidths[col] = Math.max(colWidths[col] ?? 0, width);
			rowHeights[row] = Math.max(rowHeights[row] ?? 0, height);
		});

		sorted.forEach((node, idx) => {
			const col = idx % cols;
			const row = Math.floor(idx / cols);

			let x = box.minX;
			for (let c = 0; c < col; c++) {
				x += (colWidths[c] ?? 0) + DEFAULT_GAP;
			}

			let y = box.minY;
			for (let r = 0; r < row; r++) {
				y += (rowHeights[r] ?? 0) + DEFAULT_GAP;
			}

			map.set(node.id, {
				position: { x, y },
			});
		});

		return map;
	},

	"distribute-h": (nodes, box) => {
		const map = new Map<string, Partial<Node>>();
		if (nodes.length <= 2) return map;

		const sorted = [...nodes].sort((a, b) => a.position.x - b.position.x);
		const totalNodesWidth = sorted.reduce(
			(acc, n) => acc + getNodeDimensions(n).width,
			0,
		);
		const availableSpace = box.width - totalNodesWidth;
		const gap = availableSpace / (sorted.length - 1);

		let currentX = box.minX;
		for (let i = 0; i < sorted.length; i++) {
			const node = sorted[i];
			const { width } = getNodeDimensions(node);
			map.set(node.id, {
				position: { x: Math.round(currentX), y: node.position.y },
			});
			currentX += width + gap;
		}
		return map;
	},

	"distribute-v": (nodes, box) => {
		const map = new Map<string, Partial<Node>>();
		if (nodes.length <= 2) return map;

		const sorted = [...nodes].sort((a, b) => a.position.y - b.position.y);
		const totalNodesHeight = sorted.reduce(
			(acc, n) => acc + getNodeDimensions(n).height,
			0,
		);
		const availableSpace = box.height - totalNodesHeight;
		const gap = availableSpace / (sorted.length - 1);

		let currentY = box.minY;
		for (let i = 0; i < sorted.length; i++) {
			const node = sorted[i];
			const { height } = getNodeDimensions(node);
			map.set(node.id, {
				position: { x: node.position.x, y: Math.round(currentY) },
			});
			currentY += height + gap;
		}
		return map;
	},

	"stretch-width": (nodes) => {
		const map = new Map<string, Partial<Node>>();
		const maxWidth = Math.max(...nodes.map((n) => getNodeDimensions(n).width));

		for (const node of nodes) {
			const rawNode = (node.data as { canvasNode?: CanvasNode })?.canvasNode;
			const nextData = rawNode
				? {
						...node.data,
						canvasNode: { ...rawNode, width: maxWidth },
					}
				: node.data;

			map.set(node.id, {
				width: maxWidth,
				data: nextData,
			});
		}
		return map;
	},

	"stretch-height": (nodes) => {
		const map = new Map<string, Partial<Node>>();
		const maxHeight = Math.max(
			...nodes.map((n) => getNodeDimensions(n).height),
		);

		for (const node of nodes) {
			const rawNode = (node.data as { canvasNode?: CanvasNode })?.canvasNode;
			const nextData = rawNode
				? {
						...node.data,
						canvasNode: { ...rawNode, height: maxHeight },
					}
				: node.data;

			map.set(node.id, {
				height: maxHeight,
				data: nextData,
			});
		}
		return map;
	},
};

/**
 * Apply selected alignment to candidate nodes
 */
export function applyAlignment(
	allNodes: Node[],
	selectedIds: Set<string>,
	type: AlignmentType,
): Node[] {
	const selectedNodes = allNodes.filter((n) => selectedIds.has(n.id));
	if (selectedNodes.length < 2) return allNodes;

	const box = getNodesBoundingBox(selectedNodes);
	if (!box) return allNodes;

	const strategy = alignmentStrategies[type];
	if (!strategy) return allNodes;

	const updates = strategy(selectedNodes, box);

	return allNodes.map((node) => {
		const update = updates.get(node.id);
		if (!update) return node;

		const nextNode = { ...node, ...update };
		if (update.position) {
			nextNode.position = { ...node.position, ...update.position };
			const raw = (nextNode.data as { canvasNode?: CanvasNode })?.canvasNode;
			if (raw) {
				nextNode.data = {
					...nextNode.data,
					canvasNode: {
						...raw,
						x: Math.round(nextNode.position.x),
						y: Math.round(nextNode.position.y),
					},
				};
			}
		}
		return nextNode;
	});
}
