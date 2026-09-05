/**
 * Mathematical operations for embeddings and vectors
 */

/**
 * Calculate cosine similarity between two float vectors (returns clamped value 0~1)
 */
export function cosineSimilarity(vecA: number[], vecB: number[]): number {
	if (!vecA || !vecB || vecA.length !== vecB.length || vecA.length === 0) {
		return 0;
	}

	let dotProduct = 0;
	let normA = 0;
	let normB = 0;

	for (let i = 0; i < vecA.length; i++) {
		const a = vecA[i];
		const b = vecB[i];
		dotProduct += a * b;
		normA += a * a;
		normB += b * b;
	}

	if (normA === 0 || normB === 0) return 0;
	const sim = dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
	// Clamp between 0 and 1
	return Math.max(0, Math.min(1, sim));
}
