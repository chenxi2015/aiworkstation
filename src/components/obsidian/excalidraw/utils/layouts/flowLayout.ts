import type {
	ExcalidrawConnectionInput,
	ExcalidrawElementInput,
} from "../../../types";
import { computeDagTopologicalRanks } from "../dag";
import { getNodeDimensions, isAbnormalBranchNode } from "../dimensions";
import type { LayoutOptions, NodePosition } from "../types";

/**
 * Group nodes by their topological rank and sort abnormal branches to outer slots
 */
function buildSortedRankGroups(
	elements: ExcalidrawElementInput[],
	ranks: Map<string, number>,
	elementMap: Map<string, ExcalidrawElementInput>,
	incomingLabels: Map<string, string[]>,
): string[][] {
	const rankGroups: string[][] = [];

	elements.forEach((el) => {
		const r = ranks.get(el.id) || 0;
		while (rankGroups.length <= r) {
			rankGroups.push([]);
		}
		rankGroups[r].push(el.id);
	});

	rankGroups.forEach((group) => {
		group.sort((a, b) => {
			const elA = elementMap.get(a);
			const elB = elementMap.get(b);
			if (!elA || !elB) return 0;
			const isAbnormalA = isAbnormalBranchNode(
				elA,
				incomingLabels.get(a) || [],
			);
			const isAbnormalB = isAbnormalBranchNode(
				elB,
				incomingLabels.get(b) || [],
			);
			if (isAbnormalA !== isAbnormalB) {
				return isAbnormalA ? 1 : -1;
			}
			return 0;
		});
	});

	return rankGroups;
}

/**
 * Compute coordinates for vertical DAG flow
 */
function layoutVerticalFlow(
	rankGroups: string[][],
	elementMap: Map<string, ExcalidrawElementInput>,
	startX: number,
	startY: number,
	positions: Map<string, NodePosition>,
): void {
	const colWidth = 260;
	const minGap = 75;
	const layerY: number[] = [];
	let currentY = startY;

	rankGroups.forEach((group, rankIdx) => {
		layerY[rankIdx] = currentY;
		let maxH = 60;
		group.forEach((id) => {
			const el = elementMap.get(id);
			if (el) {
				const { height } = getNodeDimensions(el);
				if (height > maxH) maxH = height;
			}
		});
		currentY += maxH + minGap;
	});

	rankGroups.forEach((group, rankIdx) => {
		group.forEach((id, colIdx) => {
			const el = elementMap.get(id);
			if (!el) return;
			const { width, height } = getNodeDimensions(el);

			// Center-align each node within its column axis
			const colCenterX = startX + colIdx * colWidth + colWidth / 2;
			const x = Math.round(colCenterX - width / 2);
			const y = layerY[rankIdx];
			positions.set(id, { x, y, width, height, type: el.type });
		});
	});
}

/**
 * Compute coordinates for horizontal DAG flow
 */
function layoutHorizontalFlow(
	rankGroups: string[][],
	elementMap: Map<string, ExcalidrawElementInput>,
	startX: number,
	startY: number,
	positions: Map<string, NodePosition>,
): void {
	const minGap = 75;
	const layerX: number[] = [];
	let currentX = startX;

	rankGroups.forEach((group, rankIdx) => {
		layerX[rankIdx] = currentX;
		let maxW = 160;
		group.forEach((id) => {
			const el = elementMap.get(id);
			if (el) {
				const { width } = getNodeDimensions(el);
				if (width > maxW) maxW = width;
			}
		});
		currentX += maxW + minGap;
	});

	rankGroups.forEach((group, rankIdx) => {
		group.forEach((id, rowIdx) => {
			const el = elementMap.get(id);
			if (!el) return;
			const { width, height } = getNodeDimensions(el);

			const rowCenterY = startY + rowIdx * 130 + 65;
			const x = layerX[rankIdx];
			const y = Math.round(rowCenterY - height / 2);
			positions.set(id, { x, y, width, height, type: el.type });
		});
	});
}

/**
 * Compute layered DAG topological layout for business flowcharts
 */
export function calculateDagFlowLayout(
	elements: ExcalidrawElementInput[],
	connections: ExcalidrawConnectionInput[],
	options: LayoutOptions,
	isVertical: boolean,
): Map<string, NodePosition> {
	const positions = new Map<string, NodePosition>();
	const elementMap = new Map<string, ExcalidrawElementInput>();
	elements.forEach((el) => elementMap.set(el.id, el));

	// 1. Collect incoming labels for decision branch sorting
	const incomingLabels = new Map<string, string[]>();
	elements.forEach((el) => incomingLabels.set(el.id, []));
	connections.forEach((conn) => {
		if (conn.label && incomingLabels.has(conn.to)) {
			incomingLabels.get(conn.to)?.push(conn.label);
		}
	});

	// 2. Compute topological ranks with robust cycle-breaking DAG algorithm
	const elementIds = elements.map((el) => el.id);
	const ranks = computeDagTopologicalRanks(elementIds, connections);

	// 3. Group and sort nodes into ranks
	const rankGroups = buildSortedRankGroups(
		elements,
		ranks,
		elementMap,
		incomingLabels,
	);

	// 4. Compute node positions based on orientation
	if (isVertical) {
		layoutVerticalFlow(
			rankGroups,
			elementMap,
			options.startX,
			options.startY,
			positions,
		);
	} else {
		layoutHorizontalFlow(
			rankGroups,
			elementMap,
			options.startX,
			options.startY,
			positions,
		);
	}

	return positions;
}
