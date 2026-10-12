import { getNodeDimensions } from "../dimensions.ts";
import type {
	SharedExcalidrawElementInput,
	SharedLayoutOptions,
	SharedNodePosition,
} from "../types.ts";

/**
 * Grid matrix layout for comparisons or dashboard cards
 */
export function calculateGridLayout(
	elements: SharedExcalidrawElementInput[],
	options: SharedLayoutOptions,
): Map<string, SharedNodePosition> {
	const positions = new Map<string, SharedNodePosition>();
	const cols = Math.max(2, Math.ceil(Math.sqrt(elements.length)));

	elements.forEach((el, index) => {
		const { width, height } = getNodeDimensions(el);
		const col = index % cols;
		const row = Math.floor(index / cols);
		positions.set(el.id, {
			x: options.startX + col * (240 + 40),
			y: options.startY + row * (100 + 40),
			width,
			height,
			type: el.type,
		});
	});

	return positions;
}
