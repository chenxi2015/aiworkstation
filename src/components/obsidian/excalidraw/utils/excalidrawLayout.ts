import type { convertToExcalidrawElements } from "@excalidraw/excalidraw";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type {
	ExcalidrawConnectionInput,
	ExcalidrawDrawInput,
	ExcalidrawElementInput,
} from "../../types";
import { calculateArrowRoute } from "./arrowRouter";
import { COLOR_PALETTE } from "./constants";
import { calculateLayoutPositions } from "./layouts";
import type { NodePosition } from "./types";

export type ConvertToExcalidrawElementsFn = typeof convertToExcalidrawElements;

// Re-export core utilities for consumers and tests
export * from "./types";
export * from "./constants";
export * from "./dimensions";
export * from "./dag";
export * from "./layouts";
export * from "./arrowRouter";

/**
 * Filter and deduplicate connection definitions
 */
function getValidConnections(
	connections: ExcalidrawConnectionInput[],
): ExcalidrawConnectionInput[] {
	const seenConns = new Set<string>();
	const valid: ExcalidrawConnectionInput[] = [];

	for (const conn of connections) {
		if (!conn.from || !conn.to || conn.from === conn.to) continue;
		const key = `${conn.from}->${conn.to}`;
		if (seenConns.has(key)) continue;
		seenConns.add(key);
		valid.push(conn);
	}

	return valid;
}

/**
 * Calculate horizontal start offset in append mode to avoid overlapping existing elements
 */
function getStartXOffset(
	mode: ExcalidrawDrawInput["mode"],
	existingElements: readonly ExcalidrawElement[],
): number {
	if (mode !== "append" || existingElements.length === 0) {
		return 100;
	}

	let maxX = 0;
	for (const el of existingElements) {
		if (!el.isDeleted) {
			maxX = Math.max(maxX, el.x + (el.width || 0));
		}
	}

	return maxX > 0 ? maxX + 160 : 100;
}

/**
 * Build shape or text element configuration
 */
function buildNodeElementConfig(
	el: ExcalidrawElementInput,
	pos: NodePosition,
): Record<string, unknown> {
	const palette =
		COLOR_PALETTE[el.color || "default"] || COLOR_PALETTE.default;
	const type = el.type || "rectangle";

	if (type === "text") {
		return {
			id: el.id,
			type: "text",
			x: pos.x,
			y: pos.y,
			text: el.label,
			strokeColor: palette.stroke,
			fontSize: 16,
			fontFamily: 1,
			textAlign: "center",
			verticalAlign: "middle",
		};
	}

	return {
		id: el.id,
		type,
		x: pos.x,
		y: pos.y,
		width: pos.width,
		height: pos.height,
		strokeColor: palette.stroke,
		backgroundColor: palette.bg,
		fillStyle: "solid",
		strokeWidth: el.strokeWidth || 2,
		roughness: 1,
		roundness: { type: 3 },
		label: {
			text: el.label,
			strokeColor: palette.stroke,
			fontSize: 15,
			textAlign: "center",
			verticalAlign: "middle",
		},
	};
}

/**
 * Build arrow connection configuration
 */
function buildArrowElementConfig(
	conn: ExcalidrawConnectionInput,
	index: number,
	fromPos: NodePosition,
	toPos: NodePosition,
	allPositions: NodePosition[],
	isVerticalFlow: boolean,
): Record<string, unknown> {
	const route = calculateArrowRoute(
		fromPos,
		toPos,
		allPositions,
		isVerticalFlow,
	);

	// Excalidraw's convertToExcalidrawElements has an internal issue where multi-segment arrows
	// (points.length > 2) with bindings mutate points[0] to [0.5, 0.5], violating LinearElement normalization invariants.
	// Only bind simple 2-point direct arrows.
	const isMultiSegment = route.points.length > 2;

	return {
		id: `arrow_${conn.from}_${conn.to}_${index}`,
		type: "arrow",
		x: route.start[0],
		y: route.start[1],
		points: route.points,
		strokeColor: "#2b2b2b",
		strokeWidth: 2,
		strokeStyle: conn.style === "dashed" ? "dashed" : "solid",
		roundness: isMultiSegment ? null : { type: 2 },
		...(isMultiSegment
			? {}
			: {
					start: { id: conn.from },
					end: { id: conn.to },
				}),
		...(conn.label
			? {
					label: {
						text: conn.label,
						fontSize: 13,
						textAlign: "center",
						verticalAlign: "middle",
					},
				}
			: {}),
	};
}

/**
 * Normalize linear element points (arrows and lines) to guarantee points[0] is [0, 0]
 */
function normalizeLinearElements(elements: readonly ExcalidrawElement[]): void {
	for (const el of elements) {
		if ((el.type === "arrow" || el.type === "line") && "points" in el) {
			const linear = el as unknown as {
				points: [number, number][];
				x: number;
				y: number;
			};
			if (Array.isArray(linear.points) && linear.points.length > 0) {
				const [p0x, p0y] = linear.points[0];
				if (p0x !== 0 || p0y !== 0) {
					linear.points = linear.points.map(([px, py]) => [px - p0x, py - p0y]);
					linear.x += p0x;
					linear.y += p0y;
				}
			}
		}
	}
}

/**
 * Generate standard Excalidraw elements from abstract AI draw inputs
 */
export function buildExcalidrawElements(
	input: ExcalidrawDrawInput,
	existingElements: readonly ExcalidrawElement[] = [],
	converter?: ConvertToExcalidrawElementsFn,
): readonly ExcalidrawElement[] {
	const {
		elements = [],
		connections = [],
		layout = "vertical_flow",
		mode = "append",
	} = input;

	const validConnections = getValidConnections(connections);
	const startX = getStartXOffset(mode, existingElements);
	const startY = 100;

	const positions = calculateLayoutPositions(
		elements,
		validConnections,
		layout,
		startX,
		startY,
	);
	const allPositions = Array.from(positions.values());
	const isVerticalFlow =
		layout === "vertical_flow" || layout === "architecture_layers";

	// 1. Build shapes and text configurations
	const rawElementConfigs: Record<string, unknown>[] = [];
	elements.forEach((el) => {
		const pos = positions.get(el.id) || {
			x: startX,
			y: startY,
			width: 200,
			height: 70,
		};
		rawElementConfigs.push(buildNodeElementConfig(el, pos));
	});

	// 2. Build arrow configurations with routing
	validConnections.forEach((conn, index) => {
		const fromPos = positions.get(conn.from);
		const toPos = positions.get(conn.to);
		if (fromPos && toPos) {
			rawElementConfigs.push(
				buildArrowElementConfig(
					conn,
					index,
					fromPos,
					toPos,
					allPositions,
					isVerticalFlow,
				),
			);
		}
	});

	// 3. Convert or fallback to raw elements
	const generated =
		(converter
			? converter(
					rawElementConfigs as unknown as Parameters<ConvertToExcalidrawElementsFn>[0],
				)
			: (rawElementConfigs as unknown as ExcalidrawElement[])) || [];

	// 4. Post-processing normalization
	normalizeLinearElements(generated);

	if (mode === "replace") {
		return generated;
	}

	return [...existingElements, ...generated];
}
