import type { convertToExcalidrawElements } from "@excalidraw/excalidraw";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type {
	ExcalidrawConnectionInput,
	ExcalidrawDrawInput,
	ExcalidrawElementInput,
} from "../../types";

const COLOR_PALETTE: Record<string, { stroke: string; bg: string }> = {
	blue: { stroke: "#1971c2", bg: "#e7f5ff" },
	green: { stroke: "#2f9e44", bg: "#ebfbee" },
	yellow: { stroke: "#f59f00", bg: "#fff9db" },
	red: { stroke: "#e03131", bg: "#ffe3e3" },
	purple: { stroke: "#7048e8", bg: "#f3f0ff" },
	gray: { stroke: "#495057", bg: "#f1f3f5" },
	default: { stroke: "#1e1e1e", bg: "#ffffff" },
};

interface NodePosition {
	x: number;
	y: number;
	width: number;
	height: number;
	type?: string;
}

/**
 * Determine suitable dimensions for node based on its type and text length
 */
function getNodeDimensions(el: ExcalidrawElementInput): {
	width: number;
	height: number;
} {
	const textLen = el.label?.length || 0;
	if (el.type === "diamond") {
		const size = textLen > 8 ? 120 : 100;
		return { width: size, height: size };
	}
	if (el.type === "ellipse") {
		const w = Math.max(160, Math.min(240, textLen * 14 + 40));
		return { width: w, height: 60 };
	}
	if (el.type === "text") {
		return { width: Math.max(120, textLen * 14), height: 40 };
	}

	// Rectangle / Card: adapt width and height for readability
	const w = textLen > 14 ? 230 : textLen > 8 ? 200 : 180;
	const h = textLen > 16 ? 80 : 70;
	return { width: w, height: h };
}

/**
 * Check if a node represents an abnormal/abort/failure branch
 */
function isAbnormalBranchNode(
	el: ExcalidrawElementInput,
	incomingLabels: string[],
): boolean {
	if (el.color === "red") return true;
	const text = (el.label || "").toLowerCase();
	const keywords = [
		"失败",
		"不足",
		"错误",
		"取消",
		"拒绝",
		"超时",
		"异常",
		"关闭",
		"终止",
		"驳回",
		"fail",
		"error",
		"cancel",
		"reject",
		"timeout",
		"abort",
	];
	if (keywords.some((kw) => text.includes(kw))) {
		return true;
	}
	const incomingEdgeKeywords = ["否", "不足", "失败", "超时", "异常", "no"];
	if (
		incomingLabels.some((lbl) =>
			incomingEdgeKeywords.some((kw) => lbl.toLowerCase().includes(kw)),
		)
	) {
		return true;
	}
	return false;
}

/**
 * Compute layered DAG topological layout for business flowcharts
 */
function calculateDagFlowLayout(
	elements: ExcalidrawElementInput[],
	connections: ExcalidrawConnectionInput[],
	startX: number,
	startY: number,
	isVertical: boolean,
): Map<string, NodePosition> {
	const positions = new Map<string, NodePosition>();
	const elementMap = new Map<string, ExcalidrawElementInput>();
	elements.forEach((el) => {
		elementMap.set(el.id, el);
	});

	// 1. Build adjacency list, incoming labels, and in-degrees
	const outgoing = new Map<string, string[]>();
	const inDegree = new Map<string, number>();
	const incomingLabels = new Map<string, string[]>();

	elements.forEach((el) => {
		outgoing.set(el.id, []);
		inDegree.set(el.id, 0);
		incomingLabels.set(el.id, []);
	});

	connections.forEach((conn) => {
		if (outgoing.has(conn.from) && outgoing.has(conn.to)) {
			outgoing.get(conn.from)?.push(conn.to);
			inDegree.set(conn.to, (inDegree.get(conn.to) || 0) + 1);
			if (conn.label) {
				incomingLabels.get(conn.to)?.push(conn.label);
			}
		}
	});

	// 2. Identify root nodes
	let roots = elements
		.filter((el) => (inDegree.get(el.id) || 0) === 0)
		.map((el) => el.id);
	if (roots.length === 0 && elements.length > 0) {
		roots = [elements[0].id];
	}

	// 3. Assign topological rank using longest path in DAG to guarantee proper execution order
	const ranks = new Map<string, number>();
	roots.forEach((id) => {
		ranks.set(id, 0);
	});
	const queue = [...roots];

	while (queue.length > 0) {
		const curr = queue.shift();
		if (!curr) break;
		const curRank = ranks.get(curr) || 0;
		const children = outgoing.get(curr) || [];

		children.forEach((child) => {
			const nextRank = curRank + 1;
			const existingRank = ranks.get(child) ?? -1;
			if (nextRank > existingRank) {
				ranks.set(child, nextRank);
				queue.push(child);
			}
		});
	}

	// Fallback rank for disconnected nodes
	let maxRank = 0;
	ranks.forEach((r) => {
		if (r > maxRank) maxRank = r;
	});
	elements.forEach((el) => {
		if (!ranks.has(el.id)) {
			maxRank += 1;
			ranks.set(el.id, maxRank);
		}
	});

	// 4. Group nodes into ranks and prioritize Happy-Path on central axis (col = 0)
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

	// 5. Dynamic dimension and coordinate computation
	const colWidth = 260;
	const minGap = 75; // Ample spacing to prevent box overlapping

	if (isVertical) {
		// Vertical Flow: Dynamic layer height accumulation
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

				// Center-align each node within its column axis so dx === 0 between same-column nodes
				const colCenterX = startX + colIdx * colWidth + colWidth / 2;
				const x = Math.round(colCenterX - width / 2);
				const y = layerY[rankIdx];
				positions.set(id, { x, y, width, height, type: el.type });
			});
		});
	} else {
		// Horizontal Flow: Dynamic layer width accumulation
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

	return positions;
}

/**
 * Grid matrix layout for comparisons or dashboard cards
 */
function calculateGridLayout(
	elements: ExcalidrawElementInput[],
	startX: number,
	startY: number,
): Map<string, NodePosition> {
	const positions = new Map<string, NodePosition>();
	const cols = Math.max(2, Math.ceil(Math.sqrt(elements.length)));

	elements.forEach((el, index) => {
		const { width, height } = getNodeDimensions(el);
		const col = index % cols;
		const row = Math.floor(index / cols);
		positions.set(el.id, {
			x: startX + col * (240 + 40),
			y: startY + row * (100 + 40),
			width,
			height,
			type: el.type,
		});
	});

	return positions;
}

/**
 * Tiered architecture layer layout (Gateway -> App Services -> Storage)
 */
/**
 * Tiered architecture layer layout with topology awareness and centered balance
 */
function calculateArchLayersLayout(
	elements: ExcalidrawElementInput[],
	connections: ExcalidrawConnectionInput[],
	startX: number,
	startY: number,
): Map<string, NodePosition> {
	const positions = new Map<string, NodePosition>();
	if (elements.length === 0) return positions;

	const outgoing = new Map<string, string[]>();
	const inDegree = new Map<string, number>();
	elements.forEach((el) => {
		outgoing.set(el.id, []);
		inDegree.set(el.id, 0);
	});

	connections.forEach((conn) => {
		if (outgoing.has(conn.from) && outgoing.has(conn.to)) {
			outgoing.get(conn.from)?.push(conn.to);
			inDegree.set(conn.to, (inDegree.get(conn.to) || 0) + 1);
		}
	});

	// Compute topological ranks if DAG connections exist
	const ranks = new Map<string, number>();
	const roots = elements
		.filter((el) => (inDegree.get(el.id) || 0) === 0)
		.map((el) => el.id);
	const queue = roots.length > 0 ? [...roots] : [elements[0].id];
	queue.forEach((id) => {
		ranks.set(id, 0);
	});

	while (queue.length > 0) {
		const curr = queue.shift();
		if (!curr) break;
		const curRank = ranks.get(curr) || 0;
		(outgoing.get(curr) || []).forEach((child) => {
			const nextRank = curRank + 1;
			if (nextRank > (ranks.get(child) ?? -1)) {
				ranks.set(child, nextRank);
				queue.push(child);
			}
		});
	}

	// Group elements by rank
	let rankGroups: string[][] = [];
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
		elements.forEach((el) => {
			const r = ranks.get(el.id) || 0;
			while (rankGroups.length <= r) rankGroups.push([]);
			rankGroups[r].push(el.id);
		});
	} else {
		// Fallback: chunk by 3 elements per layer
		const perLayer = 3;
		rankGroups = [];
		elements.forEach((el, index) => {
			const l = Math.floor(index / perLayer);
			while (rankGroups.length <= l) rankGroups.push([]);
			rankGroups[l].push(el.id);
		});
	}

	const colWidth = 260;
	const rowGap = 90;
	const maxCols = Math.max(...rankGroups.map((g) => g.length), 1);
	let currentY = startY;

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
		const layerStartX = startX + ((maxCols - groupCount) * colWidth) / 2;

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

/**
 * Compute node layout positions according to the requested topology
 */
function calculateLayoutPositions(
	elements: ExcalidrawElementInput[],
	connections: ExcalidrawConnectionInput[] = [],
	layout: ExcalidrawDrawInput["layout"] = "vertical_flow",
	startX = 100,
	startY = 100,
): Map<string, NodePosition> {
	if (elements.length === 0) return new Map();

	if (layout === "grid") {
		return calculateGridLayout(elements, startX, startY);
	}
	if (layout === "architecture_layers") {
		return calculateArchLayersLayout(elements, connections, startX, startY);
	}
	if (layout === "horizontal_flow") {
		return calculateDagFlowLayout(elements, connections, startX, startY, false);
	}

	// Default to structured vertical DAG flow for standard business flowcharts
	return calculateDagFlowLayout(elements, connections, startX, startY, true);
}

/**
 * Test if an orthogonal segment intersects with any node obstacle
 */
function isSegmentBlocked(
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
 * Compute smart connection anchor points and clean orthogonal routes with obstacle avoidance
 */
function calculateArrowRoute(
	from: NodePosition,
	to: NodePosition,
	allNodes: NodePosition[],
	isVerticalFlow: boolean,
): { start: [number, number]; points: [number, number][] } {
	const fromCenter = {
		x: from.x + from.width / 2,
		y: from.y + from.height / 2,
	};
	const toCenter = { x: to.x + to.width / 2, y: to.y + to.height / 2 };

	const dx = toCenter.x - fromCenter.x;
	const dy = toCenter.y - fromCenter.y;

	// Obstacles are all nodes except the source and destination
	const obstacles = allNodes.filter((n) => n !== from && n !== to);

	// Case 1: Same horizontal row / side-by-side
	if (Math.abs(fromCenter.y - toCenter.y) < 45) {
		if (dx > 0) {
			const startX = from.x + from.width;
			const startY = fromCenter.y;
			const endX = to.x;
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
		} else if (dx < 0) {
			const startX = from.x;
			const startY = fromCenter.y;
			const endX = to.x + to.width;
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
		}
	}

	// Case 2: Horizontal flow (left-to-right business flowchart)
	if (!isVerticalFlow && to.x >= from.x + from.width - 10) {
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
	}

	// Case 3: Downward flow (to.y >= from.y + from.height - 10)
	if (to.y >= from.y + from.height - 10) {
		// Dedicated port routing for diamond decision elements
		if (from.type === "diamond") {
			// Branch to the left (e.g. failure / rejection)
			if (dx < -30) {
				const startX = from.x;
				const startY = fromCenter.y;
				const endX = toCenter.x;
				const endY = to.y;
				const turnX = startX - 25;
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
			// Branch to the right (e.g. success / affirmative)
			if (dx > 30) {
				const startX = from.x + from.width;
				const startY = fromCenter.y;
				const endX = toCenter.x;
				const endY = to.y;
				const turnX = startX + 25;
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
		}

		// Standard rectangular node multi-port departure point
		// Distribute ports across the bottom edge to avoid overlapping knots
		const startX =
			dx < -40
				? from.x + from.width * 0.25
				: dx > 40
					? from.x + from.width * 0.75
					: fromCenter.x;
		const startY = from.y + from.height;

		// Adapt target arrival port based on approach direction
		const endX =
			dx < -40
				? to.x + to.width * 0.75
				: dx > 40
					? to.x + to.width * 0.25
					: toCenter.x;
		const endY = to.y;

		// Subcase 3A: Straight vertical down (same column)
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

		// Subcase 3B: Downward orthogonal routing via inter-layer gutter corridor
		const gutterY = startY + Math.min(35, Math.max(25, (endY - startY) / 3));

		// Check if the final vertical drop [endX, gutterY] -> [endX, endY] is clear
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

		// If direct vertical drop is blocked by an intermediate node, route through lateral bypass
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

	// Case 4: Upward / Feedback loop (to.y < from.y)
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

export type ConvertToExcalidrawElementsFn =
	typeof convertToExcalidrawElements;

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

	// Deduplicate connections to avoid double lines
	const seenConns = new Set<string>();
	const validConnections: ExcalidrawConnectionInput[] = [];
	for (const conn of connections) {
		if (!conn.from || !conn.to || conn.from === conn.to) continue;
		const key = `${conn.from}->${conn.to}`;
		if (seenConns.has(key)) continue;
		seenConns.add(key);
		validConnections.push(conn);
	}

	// Determine starting coordinate offset to avoid overlapping existing elements
	let startX = 100;
	const startY = 100;

	if (mode === "append" && existingElements.length > 0) {
		let maxX = 0;
		for (const el of existingElements) {
			if (!el.isDeleted) {
				maxX = Math.max(maxX, el.x + (el.width || 0));
			}
		}
		startX = maxX > 0 ? maxX + 160 : 100;
	}

	const positions = calculateLayoutPositions(
		elements,
		validConnections,
		layout,
		startX,
		startY,
	);
	const allPositions = Array.from(positions.values());
	const rawElementConfigs: Record<string, unknown>[] = [];
	const isVerticalFlow =
		layout === "vertical_flow" || layout === "architecture_layers";

	// 1. Build shapes and text
	elements.forEach((el) => {
		const pos = positions.get(el.id) || {
			x: startX,
			y: startY,
			width: 200,
			height: 70,
		};
		const palette =
			COLOR_PALETTE[el.color || "default"] || COLOR_PALETTE.default;
		const type = el.type || "rectangle";

		if (type === "text") {
			rawElementConfigs.push({
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
			});
		} else {
			rawElementConfigs.push({
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
			});
		}
	});

	// 2. Build arrows with smart anchoring and orthogonal routing
	validConnections.forEach((conn, index) => {
		const fromPos = positions.get(conn.from);
		const toPos = positions.get(conn.to);
		if (fromPos && toPos) {
			const route = calculateArrowRoute(
				fromPos,
				toPos,
				allPositions,
				isVerticalFlow,
			);

			// Excalidraw's convertToExcalidrawElements has an internal bug where multi-segment arrows (points.length > 2)
			// with bindings mutate points[0] to [0.5, 0.5], violating LinearElement normalization invariants.
			// Only bind simple 2-point direct arrows.
			const isMultiSegment = route.points.length > 2;

			rawElementConfigs.push({
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
			});
		}
	});

	const generated =
		(converter
			? converter(
					rawElementConfigs as unknown as Parameters<ConvertToExcalidrawElementsFn>[0],
				)
			: (rawElementConfigs as unknown as ExcalidrawElement[])) || [];

	// Post-processing: Normalize all linear elements (arrows and lines)
	// Guarantee points[0] is exactly [0, 0] to satisfy Excalidraw LinearElementEditor invariants
	for (const el of generated) {
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

	if (mode === "replace") {
		return generated;
	}

	return [...existingElements, ...generated];
}
