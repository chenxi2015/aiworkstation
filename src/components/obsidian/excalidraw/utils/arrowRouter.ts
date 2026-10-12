import type { NodePosition } from "./types";

export interface ArrowRouteResult {
	start: [number, number];
	points: [number, number][];
}

/**
 * Test if an orthogonal segment intersects with any node obstacle
 */
export function isSegmentBlocked(
	p1: [number, number],
	p2: [number, number],
	obstacles: NodePosition[],
	padding = 8,
): boolean {
	const minX = Math.min(p1[0], p2[0]);
	const maxX = Math.max(p1[0], p2[0]);
	const minY = Math.min(p1[1], p2[1]);
	const maxY = Math.max(p1[1], p2[1]);

	for (const obs of obstacles) {
		const bMinX = obs.x - padding;
		const bMaxX = obs.x + obs.width + padding;
		const bMinY = obs.y - padding;
		const bMaxY = obs.y + obs.height + padding;

		if (maxX >= bMinX && minX <= bMaxX && maxY >= bMinY && minY <= bMaxY) {
			// Vertical segment
			if (Math.abs(p1[0] - p2[0]) < 2) {
				const x = p1[0];
				if (x >= bMinX && x <= bMaxX && minY < bMaxY && maxY > bMinY) {
					return true;
				}
			}
			// Horizontal segment
			else if (Math.abs(p1[1] - p2[1]) < 2) {
				const y = p1[1];
				if (y >= bMinY && y <= bMaxY && minX < bMaxX && maxX > bMinX) {
					return true;
				}
			} else {
				return true;
			}
		}
	}
	return false;
}

/**
 * Route direct horizontal connection between nodes in the same row
 */
function routeSameRow(
	from: NodePosition,
	to: NodePosition,
	fromCenter: { x: number; y: number },
	toCenter: { x: number; y: number },
	obstacles: NodePosition[],
): ArrowRouteResult | null {
	const dx = toCenter.x - fromCenter.x;
	const isToRight = dx > 0;
	const startX = isToRight ? from.x + from.width : from.x;
	const startY = fromCenter.y;
	const endX = isToRight ? to.x : to.x + to.width;
	const endY = toCenter.y;

	if (!isSegmentBlocked([startX, startY], [endX, endY], obstacles)) {
		return {
			start: [startX, startY],
			points: [
				[0, 0],
				[endX - startX, endY - startY],
			],
		};
	}
	return null;
}

/**
 * Route forward horizontal flow (left to right)
 */
function routeHorizontalFlow(
	from: NodePosition,
	to: NodePosition,
	fromCenter: { x: number; y: number },
	toCenter: { x: number; y: number },
	obstacles: NodePosition[],
): ArrowRouteResult | null {
	const dy = toCenter.y - fromCenter.y;
	const startX = from.x + from.width;
	const startY = fromCenter.y;
	const endX = to.x;
	const endY = toCenter.y;

	if (Math.abs(dy) <= 25) {
		if (!isSegmentBlocked([startX, startY], [endX, startY], obstacles)) {
			return {
				start: [startX, startY],
				points: [
					[0, 0],
					[endX - startX, 0],
				],
			};
		}
	}

	const gutterX = startX + Math.min(35, Math.max(25, (endX - startX) / 3));
	const dropBlocked = isSegmentBlocked(
		[gutterX, endY],
		[endX, endY],
		obstacles,
	);
	if (!dropBlocked) {
		return {
			start: [startX, startY],
			points: [
				[0, 0],
				[gutterX - startX, 0],
				[gutterX - startX, endY - startY],
				[endX - startX, endY - startY],
			],
		};
	}

	return null;
}

/**
 * Dedicated port routing for diamond decision elements
 */
function routeDiamondBranch(
	from: NodePosition,
	to: NodePosition,
	fromCenter: { x: number; y: number },
	toCenter: { x: number; y: number },
	dx: number,
): ArrowRouteResult {
	const isLeft = dx < 0;
	const startX = isLeft ? from.x : from.x + from.width;
	const startY = fromCenter.y;
	const endX = toCenter.x;
	const endY = to.y;
	const turnX = isLeft ? startX - 25 : startX + 25;
	const gutterY = Math.min(from.y + from.height + 25, endY - 25);

	return {
		start: [startX, startY],
		points: [
			[0, 0],
			[turnX - startX, 0],
			[turnX - startX, gutterY - startY],
			[endX - startX, gutterY - startY],
			[endX - startX, endY - startY],
		],
	};
}

/**
 * Route downward flow with obstacle bypass
 */
function routeDownwardFlow(
	from: NodePosition,
	to: NodePosition,
	fromCenter: { x: number; y: number },
	toCenter: { x: number; y: number },
	obstacles: NodePosition[],
): ArrowRouteResult {
	const dx = toCenter.x - fromCenter.x;

	if (from.type === "diamond" && Math.abs(dx) > 30) {
		return routeDiamondBranch(from, to, fromCenter, toCenter, dx);
	}

	// Distribute ports across the bottom edge to avoid overlapping knots
	const startX =
		dx < -40
			? from.x + from.width * 0.25
			: dx > 40
				? from.x + from.width * 0.75
				: fromCenter.x;
	const startY = from.y + from.height;

	const endX =
		dx < -40
			? to.x + to.width * 0.75
			: dx > 40
				? to.x + to.width * 0.25
				: toCenter.x;
	const endY = to.y;

	// Subcase A: Straight vertical down (same column)
	if (Math.abs(startX - endX) <= 25) {
		if (!isSegmentBlocked([startX, startY], [startX, endY], obstacles)) {
			return {
				start: [startX, startY],
				points: [
					[0, 0],
					[0, endY - startY],
				],
			};
		}
	}

	// Subcase B: Downward orthogonal routing via inter-layer gutter corridor
	const gutterY = startY + Math.min(35, Math.max(25, (endY - startY) / 3));
	const verticalDropBlocked = isSegmentBlocked(
		[endX, gutterY],
		[endX, endY],
		obstacles,
	);

	if (!verticalDropBlocked) {
		return {
			start: [startX, startY],
			points: [
				[0, 0],
				[0, gutterY - startY],
				[endX - startX, gutterY - startY],
				[endX - startX, endY - startY],
			],
		};
	}

	// Subcase C: Lateral bypass around intermediate node
	const blockedNode = obstacles.find((obs) =>
		isSegmentBlocked([endX, gutterY], [endX, endY], [obs]),
	);
	const bypassX = blockedNode
		? dx >= 0
			? blockedNode.x + blockedNode.width + 35
			: blockedNode.x - 35
		: endX > startX
			? from.x + from.width + 35
			: from.x - 35;

	const targetArrivalY = endY - 20;

	return {
		start: [startX, startY],
		points: [
			[0, 0],
			[0, gutterY - startY],
			[bypassX - startX, gutterY - startY],
			[bypassX - startX, targetArrivalY - startY],
			[endX - startX, targetArrivalY - startY],
			[endX - startX, endY - startY],
		],
	};
}

/**
 * Route upward / feedback loop (to.y < from.y)
 */
function routeUpwardFeedback(
	from: NodePosition,
	to: NodePosition,
	fromCenter: { x: number; y: number },
	toCenter: { x: number; y: number },
): ArrowRouteResult {
	const dx = toCenter.x - fromCenter.x;
	const isRight = dx >= 0;
	const startX = isRight ? from.x + from.width : from.x;
	const startY = fromCenter.y;
	const endX = isRight ? to.x + to.width : to.x;
	const endY = toCenter.y;
	const lateralOffset = isRight ? 45 : -45;

	return {
		start: [startX, startY],
		points: [
			[0, 0],
			[lateralOffset, 0],
			[lateralOffset, endY - startY],
			[endX - startX, endY - startY],
		],
	};
}

/**
 * Compute smart connection anchor points and clean orthogonal routes with obstacle avoidance
 */
export function calculateArrowRoute(
	from: NodePosition,
	to: NodePosition,
	allNodes: NodePosition[],
	isVerticalFlow: boolean,
): ArrowRouteResult {
	const fromCenter = {
		x: from.x + from.width / 2,
		y: from.y + from.height / 2,
	};
	const toCenter = { x: to.x + to.width / 2, y: to.y + to.height / 2 };
	const obstacles = allNodes.filter((n) => n !== from && n !== to);

	// Case 1: Same horizontal row / side-by-side
	if (Math.abs(fromCenter.y - toCenter.y) < 45) {
		const sameRowRoute = routeSameRow(
			from,
			to,
			fromCenter,
			toCenter,
			obstacles,
		);
		if (sameRowRoute) return sameRowRoute;
	}

	// Case 2: Horizontal flow (left-to-right business flowchart)
	if (!isVerticalFlow && to.x >= from.x + from.width - 10) {
		const horizRoute = routeHorizontalFlow(
			from,
			to,
			fromCenter,
			toCenter,
			obstacles,
		);
		if (horizRoute) return horizRoute;
	}

	// Case 3: Downward flow
	if (to.y >= from.y + from.height - 10) {
		return routeDownwardFlow(from, to, fromCenter, toCenter, obstacles);
	}

	// Case 4: Upward / Feedback loop
	return routeUpwardFeedback(from, to, fromCenter, toCenter);
}
