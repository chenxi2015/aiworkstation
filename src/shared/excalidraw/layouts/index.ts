import type {
	SharedExcalidrawConnectionInput,
	SharedExcalidrawDrawInput,
	SharedExcalidrawElementInput,
	SharedLayoutOptions,
	SharedLayoutStrategy,
	SharedNodePosition,
} from "../types.ts";
import { calculateArchLayersLayout } from "./archLayersLayout.ts";
import { calculateDagFlowLayout } from "./flowLayout.ts";
import { calculateGridLayout } from "./gridLayout.ts";

/**
 * Registry of available layout strategies
 */
const layoutStrategies: Record<string, SharedLayoutStrategy> = {
	grid: (elements, _conns, options) => calculateGridLayout(elements, options),
	architecture_layers: (elements, conns, options) =>
		calculateArchLayersLayout(elements, conns, options),
	horizontal_flow: (elements, conns, options) =>
		calculateDagFlowLayout(elements, conns, options, false),
	vertical_flow: (elements, conns, options) =>
		calculateDagFlowLayout(elements, conns, options, true),
};

/**
 * Compute node layout positions according to the requested topology strategy
 */
export function calculateLayoutPositions(
	elements: SharedExcalidrawElementInput[],
	connections: SharedExcalidrawConnectionInput[] = [],
	layout: SharedExcalidrawDrawInput["layout"] = "vertical_flow",
	startX = 100,
	startY = 100,
): Map<string, SharedNodePosition> {
	if (elements.length === 0) return new Map();

	const options: SharedLayoutOptions = { startX, startY };
	const strategy =
		layoutStrategies[layout || "vertical_flow"] ||
		layoutStrategies.vertical_flow;

	return strategy(elements, connections, options);
}

export {
	calculateArchLayersLayout,
	calculateDagFlowLayout,
	calculateGridLayout,
};
