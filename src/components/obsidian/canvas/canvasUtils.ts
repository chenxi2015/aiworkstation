/** JSON Canvas open specification (jsoncanvas.org) node interface */
export interface CanvasNode {
	id: string;
	type: "text" | "file" | "link" | "group";
	x: number;
	y: number;
	width: number;
	height: number;
	color?: string;
	text?: string;
	file?: string;
	url?: string;
	label?: string;
}

export interface CanvasEdge {
	id: string;
	fromNode: string;
	fromSide?: "top" | "right" | "bottom" | "left";
	toNode: string;
	toSide?: "top" | "right" | "bottom" | "left";
	color?: string;
	label?: string;
}

export interface CanvasData {
	nodes: CanvasNode[];
	edges: CanvasEdge[];
}

export interface ViewTransform {
	x: number;
	y: number;
	k: number;
}

export interface Rect {
	minX: number;
	minY: number;
	maxX: number;
	maxY: number;
}

/** Obsidian canvas color presets (1-6) */
export const COLOR_PRESETS: Record<string, string> = {
	"1": "#e03131",
	"2": "#f08c00",
	"3": "#eab308",
	"4": "#37b24d",
	"5": "#0ca678",
	"6": "#7048e8",
};

/** Resolve preset color id or hex string */
export function resolveColor(color?: string): string | undefined {
	if (!color) return undefined;
	return COLOR_PRESETS[color] ?? (color.startsWith("#") ? color : undefined);
}

export type Side = NonNullable<CanvasEdge["fromSide"]>;

/** Calculate anchor point on a specific side of a node */
export function anchorOf(
	node: CanvasNode,
	side: Side,
): { x: number; y: number } {
	switch (side) {
		case "top":
			return { x: node.x + node.width / 2, y: node.y };
		case "bottom":
			return { x: node.x + node.width / 2, y: node.y + node.height };
		case "left":
			return { x: node.x, y: node.y + node.height / 2 };
		default:
			return { x: node.x + node.width, y: node.y + node.height / 2 };
	}
}

/** Guess optimal sides based on node center orientation */
export function guessSides(
	from: CanvasNode,
	to: CanvasNode,
): { fromSide: Side; toSide: Side } {
	const fx = from.x + from.width / 2;
	const fy = from.y + from.height / 2;
	const tx = to.x + to.width / 2;
	const ty = to.y + to.height / 2;
	const dx = tx - fx;
	const dy = ty - fy;
	if (Math.abs(dx) >= Math.abs(dy)) {
		return dx >= 0
			? { fromSide: "right", toSide: "left" }
			: { fromSide: "left", toSide: "right" };
	}
	return dy >= 0
		? { fromSide: "bottom", toSide: "top" }
		: { fromSide: "top", toSide: "bottom" };
}

/** Calculate cubic bezier path for an edge */
export function edgePath(
	edge: CanvasEdge,
	byId: Map<string, CanvasNode>,
): string | null {
	const from = byId.get(edge.fromNode);
	const to = byId.get(edge.toNode);
	if (!from || !to) return null;
	const guessed = guessSides(from, to);
	const fromSide = edge.fromSide ?? guessed.fromSide;
	const toSide = edge.toSide ?? guessed.toSide;
	const a = anchorOf(from, fromSide);
	const b = anchorOf(to, toSide);

	// Push bezier control points along side normals
	const dist = Math.max(Math.hypot(b.x - a.x, b.y - a.y) / 3, 40);
	const normals: Record<Side, { x: number; y: number }> = {
		top: { x: 0, y: -1 },
		bottom: { x: 0, y: 1 },
		left: { x: -1, y: 0 },
		right: { x: 1, y: 0 },
	};
	const c1x = a.x + normals[fromSide].x * dist;
	const c1y = a.y + normals[fromSide].y * dist;
	const c2x = b.x + normals[toSide].x * dist;
	const c2y = b.y + normals[toSide].y * dist;
	return `M ${a.x} ${a.y} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${b.x} ${b.y}`;
}

/** Calculate world coordinate bounds of visible viewport with optional buffer */
export function getViewportRect(
	containerWidth: number,
	containerHeight: number,
	transform: ViewTransform,
	buffer = 200,
): Rect {
	const safeScale = Math.max(transform.k, 0.01);
	const minX = -transform.x / safeScale - buffer;
	const minY = -transform.y / safeScale - buffer;
	const maxX = (-transform.x + containerWidth) / safeScale + buffer;
	const maxY = (-transform.y + containerHeight) / safeScale + buffer;
	return { minX, minY, maxX, maxY };
}

/** Check if a node intersects with the viewport bounding box (AABB) */
export function isNodeInViewport(node: CanvasNode, viewport: Rect): boolean {
	const nodeRight = node.x + node.width;
	const nodeBottom = node.y + node.height;
	return (
		nodeRight >= viewport.minX &&
		node.x <= viewport.maxX &&
		nodeBottom >= viewport.minY &&
		node.y <= viewport.maxY
	);
}

/** Check if an edge is visible in the viewport (either end node visible or intersects) */
export function isEdgeInViewport(
	edge: CanvasEdge,
	byId: Map<string, CanvasNode>,
	viewport: Rect,
): boolean {
	const from = byId.get(edge.fromNode);
	const to = byId.get(edge.toNode);
	if (!from || !to) return false;

	// Fast check: if either endpoint node is in viewport, the edge is considered visible
	if (isNodeInViewport(from, viewport) || isNodeInViewport(to, viewport)) {
		return true;
	}

	// Bounding box of the edge line segment
	const edgeMinX = Math.min(from.x, to.x);
	const edgeMaxX = Math.max(from.x + from.width, to.x + to.width);
	const edgeMinY = Math.min(from.y, to.y);
	const edgeMaxY = Math.max(from.y + from.height, to.y + to.height);

	return (
		edgeMaxX >= viewport.minX &&
		edgeMinX <= viewport.maxX &&
		edgeMaxY >= viewport.minY &&
		edgeMinY <= viewport.maxY
	);
}
