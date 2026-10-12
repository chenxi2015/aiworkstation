import type { SharedExcalidrawConnectionInput } from "./types.ts";

/**
 * Filter valid non-self connections whose endpoints exist in the provided ID set
 */
function filterValidConnections(
	elementIds: string[],
	connections: SharedExcalidrawConnectionInput[],
): { validIds: Set<string>; validConns: SharedExcalidrawConnectionInput[] } {
	const validIds = new Set(elementIds);
	const validConns = connections.filter(
		(conn) =>
			conn.from &&
			conn.to &&
			conn.from !== conn.to &&
			validIds.has(conn.from) &&
			validIds.has(conn.to),
	);
	return { validIds, validConns };
}

/**
 * Detect back-edges (cycles) using three-color DFS marking
 */
function findBackEdges(
	elementIds: string[],
	outgoing: Map<string, string[]>,
): Set<string> {
	// state: 0 = unvisited, 1 = visiting (on current stack), 2 = visited
	const state = new Map<string, number>();
	const backEdges = new Set<string>();

	const dfs = (nodeId: string) => {
		state.set(nodeId, 1);
		for (const next of outgoing.get(nodeId) || []) {
			const nextState = state.get(next) || 0;
			if (nextState === 1) {
				backEdges.add(`${nodeId}->${next}`);
			} else if (nextState === 0) {
				dfs(next);
			}
		}
		state.set(nodeId, 2);
	};

	elementIds.forEach((id) => {
		if ((state.get(id) || 0) === 0) {
			dfs(id);
		}
	});

	return backEdges;
}

/**
 * Detect back-edges (cycles) using DFS and compute DAG topological ranks via Kahn's algorithm
 */
export function computeDagTopologicalRanks(
	elementIds: string[],
	connections: SharedExcalidrawConnectionInput[],
): Map<string, number> {
	const { validConns } = filterValidConnections(elementIds, connections);

	const rawOutgoing = new Map<string, string[]>();
	elementIds.forEach((id) => rawOutgoing.set(id, []));
	validConns.forEach((conn) => rawOutgoing.get(conn.from)?.push(conn.to));

	// 1. Detect cycle back-edges using DFS three-color marking
	const backEdges = findBackEdges(elementIds, rawOutgoing);

	// 2. Build sanitized DAG without back-edges
	const dagOutgoing = new Map<string, string[]>();
	const inDegree = new Map<string, number>();

	elementIds.forEach((id) => {
		dagOutgoing.set(id, []);
		inDegree.set(id, 0);
	});

	validConns.forEach((conn) => {
		if (!backEdges.has(`${conn.from}->${conn.to}`)) {
			dagOutgoing.get(conn.from)?.push(conn.to);
			inDegree.set(conn.to, (inDegree.get(conn.to) || 0) + 1);
		}
	});

	// 3. Compute topological ranks using Kahn's algorithm
	const ranks = new Map<string, number>();
	const inDegrees = new Map(inDegree);
	const queue: string[] = [];

	elementIds.forEach((id) => {
		if ((inDegrees.get(id) || 0) === 0) {
			ranks.set(id, 0);
			queue.push(id);
		}
	});

	if (queue.length === 0 && elementIds.length > 0) {
		ranks.set(elementIds[0], 0);
		queue.push(elementIds[0]);
	}

	while (queue.length > 0) {
		const curr = queue.shift();
		if (!curr) break;
		const curRank = ranks.get(curr) || 0;
		const children = dagOutgoing.get(curr) || [];

		for (const child of children) {
			const nextRank = curRank + 1;
			ranks.set(child, Math.max(ranks.get(child) ?? 0, nextRank));

			const remaining = (inDegrees.get(child) || 1) - 1;
			inDegrees.set(child, remaining);
			if (remaining <= 0) {
				queue.push(child);
			}
		}
	}

	// 4. Assign fallback rank for any disconnected or unranked nodes
	let maxRank = 0;
	ranks.forEach((r) => {
		if (r > maxRank) maxRank = r;
	});
	elementIds.forEach((id) => {
		if (!ranks.has(id)) {
			maxRank += 1;
			ranks.set(id, maxRank);
		}
	});

	return ranks;
}
