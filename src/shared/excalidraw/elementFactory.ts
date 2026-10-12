import { calculateArrowRoute } from "./arrowRouter.ts";
import { SHARED_COLOR_PALETTE } from "./constants.ts";
import { calculateLayoutPositions } from "./layouts/index.ts";
import type {
	SharedExcalidrawConnectionInput,
	SharedExcalidrawDrawInput,
	SharedExcalidrawElementInput,
	SharedNodePosition,
	SharedRawElement,
} from "./types.ts";

/**
 * Dependency-free Excalidraw element factory.
 *
 * Produces plain JSON conforming to the .excalidraw file format. The client's
 * ExcalidrawView `restore()` call backfills runtime fields (seed defaults to 1,
 * versionNonce to 0, updated to now) and generates bound text children for
 * shapes carrying a `label` — so this factory emits schema-shaped raw elements
 * without importing the @excalidraw package, enabling server-side headless
 * drawing into Vault files.
 *
 * The client path may still pass an official `convertToExcalidrawElements`
 * converter for enhanced fidelity; both paths produce the same file format.
 */

export interface BuildExcalidrawOptions {
	existingElements?: readonly SharedRawElement[];
}

/** Filter and deduplicate connection definitions */
function getValidConnections(
	connections: SharedExcalidrawConnectionInput[],
): SharedExcalidrawConnectionInput[] {
	const seenConns = new Set<string>();
	const valid: SharedExcalidrawConnectionInput[] = [];

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
	mode: SharedExcalidrawDrawInput["mode"],
	existingElements: readonly SharedRawElement[],
): number {
	if (mode !== "append" || existingElements.length === 0) {
		return 100;
	}

	let maxX = 0;
	for (const el of existingElements) {
		if (!el.isDeleted && typeof el.width === "number") {
			maxX = Math.max(maxX, el.x + el.width);
		}
	}

	return maxX > 0 ? maxX + 160 : 100;
}

/**
 * Build shape or text element configuration
 */
function buildNodeElementConfig(
	el: SharedExcalidrawElementInput,
	pos: SharedNodePosition,
): Record<string, unknown> {
	const palette =
		SHARED_COLOR_PALETTE[el.color || "default"] || SHARED_COLOR_PALETTE.default;
	const type = el.type || "rectangle";

	if (type === "text") {
		return {
			id: el.id,
			type: "text",
			x: pos.x,
			y: pos.y,
			width: pos.width,
			height: pos.height,
			text: el.label,
			strokeColor: palette.stroke,
			backgroundColor: "transparent",
			fillStyle: "solid",
			strokeWidth: el.strokeWidth || 2,
			strokeStyle: "solid",
			roughness: 1,
			opacity: 100,
			angle: 0,
			roundness: null,
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
		strokeStyle: "solid",
		roughness: 1,
		opacity: 100,
		angle: 0,
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
	conn: SharedExcalidrawConnectionInput,
	index: number,
	fromPos: SharedNodePosition,
	toPos: SharedNodePosition,
	allPositions: SharedNodePosition[],
	isVerticalFlow: boolean,
): Record<string, unknown> {
	const route = calculateArrowRoute(
		fromPos,
		toPos,
		allPositions,
		isVerticalFlow,
	);

	// Multi-segment arrows skip start/end binding to avoid converter invariants;
	// the same conservative rule applies to the raw JSON path.
	const isMultiSegment = route.points.length > 2;

	return {
		id: `arrow_${conn.from}_${conn.to}_${index}`,
		type: "arrow",
		x: route.start[0],
		y: route.start[1],
		points: route.points,
		strokeColor: "#2b2b2b",
		backgroundColor: "transparent",
		fillStyle: "solid",
		strokeWidth: 2,
		strokeStyle: conn.style === "dashed" ? "dashed" : "solid",
		roughness: 1,
		opacity: 100,
		angle: 0,
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
function normalizeLinearElements(elements: readonly SharedRawElement[]): void {
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
 * Generate raw Excalidraw-conformant element JSON from abstract AI draw inputs.
 * Pure function, zero browser or @excalidraw dependency — safe for server use.
 */
export function generateExcalidrawElements(
	input: SharedExcalidrawDrawInput,
	options?: BuildExcalidrawOptions,
): SharedRawElement[] {
	const {
		elements = [],
		connections = [],
		layout = "vertical_flow",
		mode = "append",
	} = input;
	const existingElements = options?.existingElements ?? [];

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

	const generated = rawElementConfigs as unknown as SharedRawElement[];
	normalizeLinearElements(generated);
	return generated;
}

export { calculateArrowRoute } from "./arrowRouter.ts";
export { SHARED_COLOR_PALETTE } from "./constants.ts";
export { computeDagTopologicalRanks } from "./dag.ts";
export { getNodeDimensions, isAbnormalBranchNode } from "./dimensions.ts";
export { calculateLayoutPositions } from "./layouts/index.ts";
export * from "./types.ts";
