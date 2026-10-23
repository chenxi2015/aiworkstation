import type { SharedNodePosition as NodePosition } from "./types.ts";

export interface ArrowRouteResult {
	start: [number, number];
	points: [number, number][];
}

export interface ArrowLink {
	fromId: string;
	toId: string;
}

type Side = "top" | "bottom" | "left" | "right";
type Point = { x: number; y: number };
type Anchor = Point & { side: Side };

const SIDE_TOLERANCE = 15;
const STRAIGHT_TOLERANCE = 6;
const OBSTACLE_MARGIN = 10;
const BYPASS_GAP = 40;

const isVerticalSide = (side: Side) => side === "top" || side === "bottom";

/** Pick facing sides so an arrow always leaves and enters through opposite edges. */
function pickSides(
	from: NodePosition,
	to: NodePosition,
	isVerticalFlow: boolean,
): [Side, Side] {
	const below = to.y >= from.y + from.height - SIDE_TOLERANCE;
	const above = to.y + to.height <= from.y + SIDE_TOLERANCE;
	const right = to.x >= from.x + from.width - SIDE_TOLERANCE;
	const left = to.x + to.width <= from.x + SIDE_TOLERANCE;

	const vertical: [Side, Side] | null = below
		? ["bottom", "top"]
		: above
			? ["top", "bottom"]
			: null;
	const horizontal: [Side, Side] | null = right
		? ["right", "left"]
		: left
			? ["left", "right"]
			: null;

	const preferred = isVerticalFlow
		? (vertical ?? horizontal)
		: (horizontal ?? vertical);
	return preferred ?? ["right", "left"];
}

/** Point on the node outline at `t` (0..1) along the given side. */
function edgePoint(pos: NodePosition, side: Side, t: number): Anchor {
	const cx = pos.x + pos.width / 2;
	const cy = pos.y + pos.height / 2;
	const vertical = isVerticalSide(side);
	// Diamonds are narrow at their tips, so keep ports near the middle
	const ratio = pos.type === "diamond" ? 0.5 + (t - 0.5) * 0.5 : t;
	const half = vertical ? pos.width / 2 : pos.height / 2;
	const off = (ratio - 0.5) * 2; // -1..1 across the side
	const other = vertical ? pos.height / 2 : pos.width / 2;
	const shape =
		pos.type === "diamond"
			? 1 - Math.abs(off)
			: pos.type === "ellipse"
				? Math.sqrt(1 - off * off)
				: 1;
	const depth = other * shape;
	const sign = side === "bottom" || side === "right" ? 1 : -1;

	return vertical
		? { x: cx + off * half, y: cy + sign * depth, side }
		: { x: cx + sign * depth, y: cy + off * half, side };
}

/** Distribute arrows that share a node side evenly, ordered to avoid crossings. */
function assignPorts(
	links: ArrowLink[],
	sides: [Side, Side][],
	positions: Map<string, NodePosition>,
): number[][] {
	const groups = new Map<
		string,
		{ link: number; role: 0 | 1; order: number }[]
	>();
	links.forEach((link, i) => {
		([link.fromId, link.toId] as const).forEach((id, role) => {
			const side = sides[i][role];
			const otherPos = positions.get(role === 0 ? link.toId : link.fromId);
			if (!otherPos) return;
			const order = isVerticalSide(side)
				? otherPos.x + otherPos.width / 2
				: otherPos.y + otherPos.height / 2;
			const key = `${id}:${side}`;
			groups.set(key, [
				...(groups.get(key) ?? []),
				{ link: i, role: role as 0 | 1, order },
			]);
		});
	});

	const ports = links.map(() => [0.5, 0.5]);
	for (const members of groups.values()) {
		members.sort((a, b) => a.order - b.order || a.link - b.link);
		members.forEach((m, idx) => {
			ports[m.link][m.role] = (idx + 1) / (members.length + 1);
		});
	}
	return ports;
}

function segmentHitsRect(a: Point, b: Point, r: NodePosition): boolean {
	const steps = 24;
	for (let i = 0; i <= steps; i++) {
		const x = a.x + ((b.x - a.x) * i) / steps;
		const y = a.y + ((b.y - a.y) * i) / steps;
		if (
			x > r.x - OBSTACLE_MARGIN &&
			x < r.x + r.width + OBSTACLE_MARGIN &&
			y > r.y - OBSTACLE_MARGIN &&
			y < r.y + r.height + OBSTACLE_MARGIN
		) {
			return true;
		}
	}
	return false;
}

/**
 * Build a smooth curve (Excalidraw roundness type 2) between two anchors.
 * - Aligned anchors: straight line.
 * - Otherwise: monotonic S-curve with tangents perpendicular to the edges (never loops).
 * - Straight path blocked by another node: single arc bypassing it on the nearer side.
 */
function buildRoute(
	a: Anchor,
	b: Anchor,
	obstacles: NodePosition[],
): ArrowRouteResult {
	const dx = b.x - a.x;
	const dy = b.y - a.y;
	const vertical = isVerticalSide(a.side);
	const main = vertical ? dy : dx;
	const cross = vertical ? dx : dy;
	const at = (m: number, c: number): [number, number] =>
		vertical ? [c, m] : [m, c];
	const start: [number, number] = [a.x, a.y];
	const end: [number, number] = [dx, dy];

	const blockers = obstacles.filter((o) => segmentHitsRect(a, b, o));
	if (blockers.length > 0) {
		const lo = Math.min(
			...blockers.map((o) => (vertical ? o.x : o.y)),
		);
		const hi = Math.max(
			...blockers.map((o) => (vertical ? o.x + o.width : o.y + o.height)),
		);
		const origin = vertical ? a.x : a.y;
		const target = origin - lo <= hi - origin ? lo - BYPASS_GAP : hi + BYPASS_GAP;
		return { start, points: [[0, 0], at(main / 2, target - origin), end] };
	}

	if (Math.abs(cross) <= STRAIGHT_TOLERANCE) {
		return { start, points: [[0, 0], end] };
	}
	return {
		start,
		points: [[0, 0], at(main * 0.35, 0), at(main * 0.65, cross), end],
	};
}

/**
 * Route all arrows together so shared node sides get distinct ports and
 * arrows never leave through the wrong edge. Returns one route per link
 * (null when an endpoint has no position).
 */
export function calculateArrowRoutes(
	links: ArrowLink[],
	positions: Map<string, NodePosition>,
	isVerticalFlow = true,
): (ArrowRouteResult | null)[] {
	const sides = links.map(({ fromId, toId }): [Side, Side] => {
		const from = positions.get(fromId);
		const to = positions.get(toId);
		return from && to ? pickSides(from, to, isVerticalFlow) : ["right", "left"];
	});
	const ports = assignPorts(links, sides, positions);

	return links.map((link, i) => {
		const from = positions.get(link.fromId);
		const to = positions.get(link.toId);
		if (!from || !to) return null;

		const obstacles = Array.from(positions.entries())
			.filter(([id]) => id !== link.fromId && id !== link.toId)
			.map(([, pos]) => pos);
		return buildRoute(
			edgePoint(from, sides[i][0], ports[i][0]),
			edgePoint(to, sides[i][1], ports[i][1]),
			obstacles,
		);
	});
}
