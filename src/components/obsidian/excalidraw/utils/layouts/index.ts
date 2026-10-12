import type {
	ExcalidrawConnectionInput,
	ExcalidrawDrawInput,
	ExcalidrawElementInput,
} from "../../../types";
import type { LayoutOptions, LayoutStrategy, NodePosition } from "../types";
import { calculateArchLayersLayout } from "./archLayersLayout";
import { calculateDagFlowLayout } from "./flowLayout";
import { calculateGridLayout } from "./gridLayout";

/**
 * Registry of available layout strategies
 */
const layoutStrategies: Record<string, LayoutStrategy> = {
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
	elements: ExcalidrawElementInput[],
	connections: ExcalidrawConnectionInput[] = [],
	layout: ExcalidrawDrawInput["layout"] = "vertical_flow",
	startX = 100,
	startY = 100,
): Map<string, NodePosition> {
	if (elements.length === 0) return new Map();

	const options: LayoutOptions = { startX, startY };
	const strategy = layoutStrategies[layout || "vertical_flow"] || layoutStrategies.vertical_flow;

	return strategy(elements, connections, options);
}

export { calculateArchLayersLayout, calculateDagFlowLayout, calculateGridLayout };
