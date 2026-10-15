import type { SharedNodePosition as NodePosition } from "./types.ts";

export interface ArrowRouteResult {
	start: [number, number];
	points: [number, number][];
}

/**
 * Minimalist, elegant arrow route calculation for Excalidraw flowcharts.
 *
 * Implements "Subtractive Design" (做减法):
 * 1. Downward flow in the same column: 2-point direct vertical line.
 * 2. Horizontal flow in the same row: 2-point direct horizontal line.
 * 3. Diamond decision branching to side card: 3-point clean L-route (1 right-angle turn).
 * 4. Downward cross-column branching: 4-point clean corridor route.
 * 5. Upward feedback loops: 4-point clean bypass corridor route.
 *
 * Never generate convoluted 5+ point zig-zag tracks.
 */
export function calculateArrowRoute(
	from: NodePosition,
	to: NodePosition,
	_allNodes?: NodePosition[],
	_isVerticalFlow = true,
): ArrowRouteResult {
	const fromCenter = {
		x: from.x + from.width / 2,
		y: from.y + from.height / 2,
	};
	const toCenter = {
		x: to.x + to.width / 2,
		y: to.y + to.height / 2,
	};

	const dx = toCenter.x - fromCenter.x;
	const dy = toCenter.y - fromCenter.y;

	// Case 1: Same horizontal row / side-by-side (dx > 0, dy approx 0)
	if (Math.abs(dy) <= 45 && dx > 0) {
		const startX = from.x + from.width;
		const startY = fromCenter.y;
		const endX = to.x;
		const endY = toCenter.y;
		return {
			start: [startX, startY],
			points: [
				[0, 0],
				[endX - startX, endY - startY],
			],
		};
	}

	// Case 2: Downward flow (to is below from)
	if (to.y >= from.y + from.height - 15) {
		// Subcase 2A: Main vertical spine (aligned within same column axis)
		if (Math.abs(dx) <= 45) {
			const startX = fromCenter.x;
			const startY = from.y + from.height;
			const endX = toCenter.x;
			const endY = to.y;
			return {
				start: [startX, startY],
				points: [
					[0, 0],
					[endX - startX, endY - startY],
				],
			};
		}

		// Subcase 2B: Diamond decision branch to side/error node -> Clean 3-point L-route
		if (from.type === "diamond") {
			const isRight = dx >= 0;
			const startX = isRight ? from.x + from.width : from.x;
			const startY = fromCenter.y;
			const endX = toCenter.x;
			const endY = to.y;

			return {
				start: [startX, startY],
				points: [
					[0, 0],
					[endX - startX, 0],
					[endX - startX, endY - startY],
				],
			};
		}

		// Subcase 2C: General downward cross-column branch -> Clean 4-point stepped corridor
		const startX = fromCenter.x;
		const startY = from.y + from.height;
		const endX = toCenter.x;
		const endY = to.y;
		const midY = startY + Math.max(25, (endY - startY) / 2);

		return {
			start: [startX, startY],
			points: [
				[0, 0],
				[0, midY - startY],
				[endX - startX, midY - startY],
				[endX - startX, endY - startY],
			],
		};
	}

	// Case 3: Upward / Feedback loop (to is above from)
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
