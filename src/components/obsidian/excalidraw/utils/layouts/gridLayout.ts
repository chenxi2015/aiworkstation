import type { ExcalidrawElementInput } from "../../../types";
import { getNodeDimensions } from "../dimensions";
import type { LayoutOptions, NodePosition } from "../types";

/**
 * Grid matrix layout for comparisons or dashboard cards
 */
export function calculateGridLayout(
	elements: ExcalidrawElementInput[],
	options: LayoutOptions,
): Map<string, NodePosition> {
	const positions = new Map<string, NodePosition>();
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
