/** Batch processing shared models for creator toolbox */

export type BatchItemStatus =
	| "pending"
	| "processing"
	| "done"
	| "error"
	| "skipped";

export interface BatchItemOutput {
	/** Processed payload in memory (browser engine) */
	blob?: Blob;
	/** Absolute path of written output (Electron/server engine) */
	absPath?: string;
	size: number;
	/** Suggested output filename (may differ from source when format converted) */
	filename: string;
}

export interface BatchItem {
	id: string;
	/** In-memory content; absent for server-picked paths until lazily loaded */
	file?: File;
	/** Absolute path — only available inside Electron shell */
	absPath?: string;
	/** Path relative to the dropped root, preserves folder structure */
	relativePath: string;
	name: string;
	size: number;
	status: BatchItemStatus;
	progress: number;
	output?: BatchItemOutput;
	error?: string;
}

export type OutputMode = "new-directory" | "overwrite" | "zip-download";

export interface BatchSummary {
	total: number;
	done: number;
	failed: number;
	skipped: number;
	inputBytes: number;
	outputBytes: number;
}

export function summarizeBatch(items: BatchItem[]): BatchSummary {
	const summary: BatchSummary = {
		total: items.length,
		done: 0,
		failed: 0,
		skipped: 0,
		inputBytes: 0,
		outputBytes: 0,
	};
	for (const item of items) {
		if (item.status === "done") {
			summary.done += 1;
			summary.inputBytes += item.size;
			summary.outputBytes += item.output?.size ?? 0;
		} else if (item.status === "error") {
			summary.failed += 1;
		} else if (item.status === "skipped") {
			summary.skipped += 1;
		}
	}
	return summary;
}
