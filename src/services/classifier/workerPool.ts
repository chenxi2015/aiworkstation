/**
 * Sleep helper with AbortSignal cancellation support
 */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
	return new Promise((resolve, reject) => {
		if (signal?.aborted) {
			return reject(new Error("Operation cancelled"));
		}
		const timer = setTimeout(resolve, ms);
		signal?.addEventListener(
			"abort",
			() => {
				clearTimeout(timer);
				reject(new Error("Operation cancelled"));
			},
			{ once: true },
		);
	});
}

export interface WorkerPoolOptions<TInput, TOutput> {
	items: TInput[];
	batchSize?: number;
	concurrency?: number;
	maxRetries?: number;
	signal?: AbortSignal;
	processBatch: (
		batch: TInput[],
		workerId: number,
		chunkIndex: number,
		totalChunks: number,
	) => Promise<TOutput[]>;
	fallbackBatch: (
		batch: TInput[],
		error: Error,
		workerId: number,
		chunkIndex: number,
		totalChunks: number,
	) => TOutput[];
	onBatchComplete?: (results: TOutput[], chunkIndex: number) => void;
	onProgress?: (
		completedItems: number,
		totalItems: number,
		completedChunks: number,
		totalChunks: number,
	) => void;
	onLog?: (message: string) => void;
}

/**
 * Concurrency worker pool executing batched tasks with exponential backoff retries and abort support
 */
export async function runBatchWorkerPool<TInput, TOutput>(
	options: WorkerPoolOptions<TInput, TOutput>,
): Promise<TOutput[]> {
	const {
		items,
		batchSize = 15,
		concurrency = 3,
		maxRetries = 2,
		signal,
		processBatch,
		fallbackBatch,
		onBatchComplete,
		onProgress,
		onLog,
	} = options;

	if (!items || items.length === 0) {
		return [];
	}

	// 1. Chunk input items into batches
	const chunks: TInput[][] = [];
	for (let i = 0; i < items.length; i += batchSize) {
		chunks.push(items.slice(i, i + batchSize));
	}
	const totalChunks = chunks.length;
	const totalItems = items.length;
	const activeWorkers = Math.min(Math.max(1, concurrency), totalChunks);

	const allResults: TOutput[] = [];
	let nextChunkIndex = 0;
	let completedItems = 0;
	let completedChunks = 0;

	// 2. Individual worker loop pulling chunks until exhausted or aborted
	const runWorker = async (workerId: number) => {
		while (nextChunkIndex < totalChunks) {
			if (signal?.aborted) break;

			const chunkIndex = nextChunkIndex++;
			const chunk = chunks[chunkIndex];

			let batchResults: TOutput[] | null = null;
			let lastError: Error | null = null;

			// Execute batch with retries
			for (let attempt = 1; attempt <= maxRetries; attempt++) {
				if (signal?.aborted) break;

				try {
					batchResults = await processBatch(
						chunk,
						workerId,
						chunkIndex,
						totalChunks,
					);
					break;
				} catch (err: unknown) {
					const errorObj = err instanceof Error ? err : new Error(String(err));

					// AbortError means user cancelled or timeout — skip retries and fallback
					if (signal?.aborted || errorObj.name === "AbortError") break;

					lastError = errorObj;
					onLog?.(
						`[Worker #${workerId}] ⚠️ 第 ${chunkIndex + 1} 批遇到波动: ${errorObj.message}，正在重试 (${attempt}/${maxRetries})...`,
					);

					if (attempt < maxRetries) {
						await sleep(1000 * attempt, signal);
					}
				}
			}

			if (signal?.aborted) break;

			// Handle successful or fallback result
			if (batchResults) {
				allResults.push(...batchResults);
				onBatchComplete?.(batchResults, chunkIndex);
			} else {
				const fallback = fallbackBatch(
					chunk,
					lastError || new Error("Unknown batch failure"),
					workerId,
					chunkIndex,
					totalChunks,
				);
				allResults.push(...fallback);
				onBatchComplete?.(fallback, chunkIndex);
			}

			completedItems += chunk.length;
			completedChunks += 1;
			onProgress?.(completedItems, totalItems, completedChunks, totalChunks);
		}
	};

	// 3. Launch concurrent workers
	const workers = Array.from({ length: activeWorkers }, (_, idx) =>
		runWorker(idx + 1),
	);
	await Promise.all(workers);

	return allResults;
}
