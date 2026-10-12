import { computeDagTopologicalRanks } from "../dag.ts";
import { getNodeDimensions } from "../dimensions.ts";
import type {
	SharedExcalidrawConnectionInput,
	SharedExcalidrawElementInput,
	SharedLayoutOptions,
	SharedNodePosition,
} from "../types.ts";

/**
 * Group elements by rank with topology awareness, or fallback to fixed chunking
 */
function groupElementsForArch(
	elements: SharedExcalidrawElementInput[],
	connections: SharedExcalidrawConnectionInput[],
): string[][] {
	const elementIds = elements.map((el) => el.id);
	const ranks = computeDagTopologicalRanks(elementIds, connections);
	const hasValidRanks = Array.from(ranks.values()).some((r) => r > 0);

	if (hasValidRanks) {
		let maxR = 0;
		ranks.forEach((r) => {
			if (r > maxR) maxR = r;
		});

		elements.forEach((el) => {
			if (!ranks.has(el.id)) {
				maxR += 1;
				ranks.set(el.id, maxR);
			}
		});

		const rankGroups: string[][] = [];
		elements.forEach((el) => {
			const r = ranks.get(el.id) || 0;
			while (rankGroups.length <= r) {
				rankGroups.push([]);
			}
			rankGroups[r].push(el.id);
		});
		return rankGroups;
	}

	// Fallback: chunk by 3 elements per layer
	const perLayer = 3;
	const rankGroups: string[][] = [];
	elements.forEach((el, index) => {
		const l = Math.floor(index / perLayer);
		while (rankGroups.length <= l) {
			rankGroups.push([]);
		}
		rankGroups[l].push(el.id);
	});
	return rankGroups;
}

/**
 * Tiered architecture layer layout with topology awareness and centered balance
 */
export function calculateArchLayersLayout(
	elements: SharedExcalidrawElementInput[],
	connections: SharedExcalidrawConnectionInput[],
	options: SharedLayoutOptions,
): Map<string, SharedNodePosition> {
	const positions = new Map<string, SharedNodePosition>();
	if (elements.length === 0) return positions;

	const rankGroups = groupElementsForArch(elements, connections);

	const colWidth = 260;
	const rowGap = 90;
	const maxCols = Math.max(...rankGroups.map((g) => g.length), 1);
	let currentY = options.startY;

	rankGroups.forEach((group) => {
		let maxH = 70;
		group.forEach((id) => {
			const el = elements.find((e) => e.id === id);
			if (el) {
				const { height } = getNodeDimensions(el);
				if (height > maxH) maxH = height;
			}
		});

		// Center the row symmetrically relative to the widest layer
		const groupCount = group.length;
		const layerStartX =
			options.startX + ((maxCols - groupCount) * colWidth) / 2;

		group.forEach((id, colIdx) => {
			const el = elements.find((e) => e.id === id);
			if (!el) return;
			const { width, height } = getNodeDimensions(el);
			const colCenterX = layerStartX + colIdx * colWidth + colWidth / 2;
			const x = Math.round(colCenterX - width / 2);
			const y = currentY;
			positions.set(id, { x, y, width, height, type: el.type });
		});

		currentY += maxH + rowGap;
	});

	return positions;
}
