import type { BatchItem } from "./types";

export interface BatchRunnerOptions {
	concurrency?: number;
	signal?: AbortSignal;
	/** Called whenever an item mutates; return the new item for state updates */
	onItemUpdate?: (item: BatchItem) => void;
}

export type BatchHandler = (
	item: BatchItem,
	reportProgress: (progress: number) => void,
) => Promise<void>;

/**
 * Concurrency-limited batch executor. Mutates a copy of each item and reports
 * updates through onItemUpdate. Resolves when every reachable item finished
 * (status done/error) or the signal aborts.
 */
export async function runBatch(
	items: BatchItem[],
	handler: BatchHandler,
	options: BatchRunnerOptions = {},
): Promise<void> {
	const concurrency = Math.max(1, options.concurrency ?? 3);
	const signal = options.signal;
	const queue = items.filter(
		(item) => item.status === "pending" || item.status === "error",
	);

	const update = (item: BatchItem) => options.onItemUpdate?.({ ...item });

	let cursor = 0;
	const worker = async (): Promise<void> => {
		while (cursor < queue.length) {
			if (signal?.aborted) return;
			const item = queue[cursor];
			cursor += 1;
			item.status = "processing";
			item.error = undefined;
			item.progress = 0;
			update(item);
			try {
				await handler(item, (progress) => {
					item.progress = Math.max(0, Math.min(100, progress));
					update(item);
				});
				item.status = "done";
				item.progress = 100;
			} catch (err) {
				item.status = "error";
				item.error = err instanceof Error ? err.message : String(err);
			}
			update(item);
		}
	};

	await Promise.all(
		Array.from({ length: Math.min(concurrency, queue.length) }, () => worker()),
	);
}
