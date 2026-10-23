import type { SharedExcalidrawConnectionInput } from "../types.ts";

/**
 * Reduce edge crossings between adjacent ranks (barycenter heuristic).
 * Reorders every rank group in place: one downward sweep, then one upward sweep.
 */
export function orderByBarycenter(
	rankGroups: string[][],
	connections: SharedExcalidrawConnectionInput[],
): void {
	const neighbors = new Map<string, string[]>();
	const link = (a: string, b: string) => {
		neighbors.set(a, [...(neighbors.get(a) ?? []), b]);
	};
	for (const { from, to } of connections) {
		link(from, to);
		link(to, from);
	}

	const rankOf = new Map<string, number>();
	const indexOf = new Map<string, number>();
	const refreshIndex = (rank: number) => {
		rankGroups[rank].forEach((id, i) => {
			rankOf.set(id, rank);
			indexOf.set(id, i);
		});
	};
	rankGroups.forEach((_, r) => refreshIndex(r));

	const sweep = (rank: number, refRank: number) => {
		const score = (id: string): number => {
			const refs = (neighbors.get(id) ?? []).filter(
				(n) => rankOf.get(n) === refRank,
			);
			if (refs.length === 0) return indexOf.get(id) ?? 0;
			return refs.reduce((s, n) => s + (indexOf.get(n) ?? 0), 0) / refs.length;
		};
		const scores = new Map(rankGroups[rank].map((id) => [id, score(id)]));
		rankGroups[rank].sort((a, b) => (scores.get(a) ?? 0) - (scores.get(b) ?? 0));
		refreshIndex(rank);
	};

	for (let r = 1; r < rankGroups.length; r++) sweep(r, r - 1);
	for (let r = rankGroups.length - 2; r >= 0; r--) sweep(r, r + 1);
}

