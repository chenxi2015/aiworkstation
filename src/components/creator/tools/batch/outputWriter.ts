import { zipSync } from "fflate";
import { saveBatchOutputs } from "../../../../server/functions/batchOutputs";
import type { BatchItem, OutputMode } from "./types";

export interface DeliverResult {
	success: boolean;
	/** e.g. output directory or zip filename */
	destination?: string;
	/** itemId → absolute written path (server-side delivery only) */
	paths?: Record<string, string>;
	failed: { id: string; name: string; error: string }[];
}

interface DirectoryHandleLike {
	getDirectoryHandle: (
		name: string,
		opts?: { create?: boolean },
	) => Promise<DirectoryHandleLike>;
	getFileHandle: (
		name: string,
		opts?: { create?: boolean },
	) => Promise<{
		createWritable: () => Promise<{
			write: (data: Blob) => Promise<void>;
			close: () => Promise<void>;
		}>;
	}>;
}

function doneItems(items: BatchItem[]): BatchItem[] {
	return items.filter((i) => i.status === "done" && i.output?.blob);
}

/** Zip all outputs (preserving relative folder structure) and trigger a browser download. */
async function deliverAsZip(items: BatchItem[]): Promise<DeliverResult> {
	const ready = doneItems(items);
	if (ready.length === 0) throw new Error("没有可下载的产物");

	const entries: Record<string, Uint8Array> = {};
	for (const item of ready) {
		const rel = item.relativePath.replace(
			/[^/]*$/,
			item.output?.filename ?? item.name,
		);
		entries[rel] = new Uint8Array(
			(await item.output?.blob?.arrayBuffer()) ?? new ArrayBuffer(0),
		);
	}
	const zipped = zipSync(entries, { level: 0 });
	const blob = new Blob([zipped.buffer as ArrayBuffer], {
		type: "application/zip",
	});
	const filename = `aiworkstation-batch-${new Date()
		.toISOString()
		.slice(0, 19)
		.replace(/[:T]/g, "-")}.zip`;
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = filename;
	a.click();
	setTimeout(() => URL.revokeObjectURL(url), 10_000);
	return { success: true, destination: filename, failed: [] };
}

async function writeIntoDirectoryHandle(
	dir: DirectoryHandleLike,
	relativePath: string,
	blob: Blob,
): Promise<void> {
	const segments = relativePath.split("/").filter(Boolean);
	let current = dir;
	for (const segment of segments.slice(0, -1)) {
		current = await current.getDirectoryHandle(segment, { create: true });
	}
	const fileHandle = await current.getFileHandle(
		segments[segments.length - 1],
		{
			create: true,
		},
	);
	const writable = await fileHandle.createWritable();
	await writable.write(blob);
	await writable.close();
}

/** Browser File System Access API path: pick a directory and write outputs inside it. */
async function deliverToPickedDirectory(
	items: BatchItem[],
): Promise<DeliverResult> {
	const picker = (
		window as unknown as {
			showDirectoryPicker?: (opts?: {
				mode?: string;
			}) => Promise<DirectoryHandleLike>;
		}
	).showDirectoryPicker;
	if (!picker) {
		throw new Error("当前浏览器不支持目录写入，请改用打包下载");
	}
	const dir = await picker({ mode: "readwrite" });
	const failed: DeliverResult["failed"] = [];
	for (const item of doneItems(items)) {
		try {
			const rel = item.relativePath.replace(
				/[^/]*$/,
				item.output?.filename ?? item.name,
			);
			await writeIntoDirectoryHandle(dir, rel, item.output?.blob as Blob);
		} catch (err) {
			failed.push({
				id: item.id,
				name: item.name,
				error: err instanceof Error ? err.message : "写入失败",
			});
		}
	}
	return { success: failed.length === 0, destination: "所选目录", failed };
}

/** Electron path: hand blobs + target paths to the local server for disk writes. */
async function deliverViaServer(
	items: BatchItem[],
	mode: "new-directory" | "overwrite",
	outputDir?: string,
): Promise<DeliverResult> {
	const ready = doneItems(items);
	const formData = new FormData();
	formData.append("mode", mode);
	if (outputDir) formData.append("outputDir", outputDir);
	const manifest = ready.map((item, index) => {
		formData.append(
			"files",
			item.output?.blob as Blob,
			item.output?.filename ?? item.name,
		);
		if (mode === "new-directory") {
			return {
				index,
				relativePath: item.relativePath.replace(
					/[^/]*$/,
					item.output?.filename ?? item.name,
				),
			};
		}
		return {
			index,
			originalPath: item.absPath,
			outputPath: item.output?.absPath ?? item.absPath,
		};
	});
	formData.append("manifest", JSON.stringify(manifest));

	const res = await saveBatchOutputs({ data: formData });
	const failed = res.items
		.filter((r) => !r.success)
		.map((r) => ({
			id: ready[r.index]?.id ?? String(r.index),
			name: ready[r.index]?.name ?? `#${r.index}`,
			error: r.error ?? "写入失败",
		}));
	const paths: Record<string, string> = {};
	for (const r of res.items) {
		if (r.success && r.path && ready[r.index]) {
			paths[ready[r.index].id] = r.path;
		}
	}
	return {
		success: res.success,
		destination: res.outputDir ?? "原路径",
		paths,
		failed,
	};
}

export function canOverwriteInPlace(items: BatchItem[]): boolean {
	return items.length > 0 && items.every((i) => Boolean(i.absPath));
}

export function isElectronShell(): boolean {
	return Boolean(window.electronAPI?.getPathForFile);
}

/**
 * Deliver all done items via the chosen output mode.
 * new-directory: Electron → server write into outputDir; browser → directory picker.
 * overwrite: Electron only (requires absPath on every item).
 * zip-download: universal fallback.
 */
export async function deliverBatchOutputs(
	items: BatchItem[],
	mode: OutputMode,
	options: { outputDir?: string } = {},
): Promise<DeliverResult> {
	if (mode === "zip-download") return deliverAsZip(items);
	if (mode === "new-directory") {
		if (options.outputDir)
			return deliverViaServer(items, mode, options.outputDir);
		return deliverToPickedDirectory(items);
	}
	// overwrite
	if (!canOverwriteInPlace(doneItems(items))) {
		throw new Error("原路径替换需要在桌面端中拖入本地文件");
	}
	return deliverViaServer(items, mode);
}
