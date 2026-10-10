import { statBatchPaths } from "../../../../server/functions/batchOutputs";
import type { BatchItem } from "./types";

const MAX_BATCH_FILES = 500;

export interface CollectResult {
	items: BatchItem[];
	/** True when the folder contained more than MAX_BATCH_FILES accepted files */
	truncated: boolean;
	/** Files dropped but rejected by the accept filter */
	rejectedCount: number;
}

let batchIdSeq = 0;
function nextItemId(): string {
	batchIdSeq += 1;
	return `batch_${Date.now()}_${batchIdSeq}`;
}

/** Build an accept matcher from an acceptTypes string like "image/*,.png" */
function createAcceptFilter(acceptTypes?: string): (file: File) => boolean {
	if (!acceptTypes || acceptTypes.trim() === "" || acceptTypes === "*/*") {
		return () => true;
	}
	const rules = acceptTypes
		.split(",")
		.map((rule) => rule.trim().toLowerCase())
		.filter(Boolean);
	return (file) => {
		const name = file.name.toLowerCase();
		const mime = file.type.toLowerCase();
		return rules.some((rule) => {
			if (rule.endsWith("/*")) return mime.startsWith(rule.slice(0, -1));
			if (rule.startsWith(".")) return name.endsWith(rule);
			return mime === rule;
		});
	};
}

interface FileSystemEntryLike {
	isFile: boolean;
	isDirectory: boolean;
	name: string;
	fullPath: string;
	file?: (cb: (file: File) => void, err?: (e: unknown) => void) => void;
	createReader?: () => {
		readEntries: (
			cb: (entries: FileSystemEntryLike[]) => void,
			err?: (e: unknown) => void,
		) => void;
	};
}

function entryFile(entry: FileSystemEntryLike): Promise<File> {
	return new Promise((resolve, reject) => {
		entry.file?.(resolve, reject);
	});
}

function readAllEntries(
	entry: FileSystemEntryLike,
): Promise<FileSystemEntryLike[]> {
	const reader = entry.createReader?.();
	if (!reader) return Promise.resolve([]);
	const all: FileSystemEntryLike[] = [];
	const readChunk = (): Promise<void> =>
		new Promise((resolve, reject) => {
			reader.readEntries((entries) => {
				if (entries.length === 0) {
					resolve();
					return;
				}
				all.push(...entries);
				resolve(readChunk());
			}, reject);
		});
	return readChunk().then(() => all);
}

async function walkEntry(
	entry: FileSystemEntryLike,
	accept: (file: File) => boolean,
	out: { files: { file: File; relativePath: string }[]; rejected: number },
	limit: { hit: boolean },
): Promise<void> {
	if (limit.hit) return;
	if (entry.isFile && entry.file) {
		try {
			const file = await entryFile(entry);
			if (accept(file)) {
				out.files.push({
					file,
					// Strip the leading "/" from entry.fullPath
					relativePath: entry.fullPath.replace(/^\/+/, "") || file.name,
				});
				if (out.files.length >= MAX_BATCH_FILES) limit.hit = true;
			} else {
				out.rejected += 1;
			}
		} catch {
			out.rejected += 1;
		}
		return;
	}
	if (entry.isDirectory && entry.createReader) {
		const children = await readAllEntries(entry);
		for (const child of children) {
			await walkEntry(child, accept, out, limit);
			if (limit.hit) return;
		}
	}
}

async function resolveAbsPath(file: File): Promise<string | undefined> {
	try {
		const api = window.electronAPI;
		if (api?.getPathForFile) {
			const p = await api.getPathForFile(file);
			return p || undefined;
		}
	} catch {
		// ignore — path stays undefined in plain browsers
	}
	return undefined;
}

async function buildItems(
	collected: { file: File; relativePath: string }[],
): Promise<BatchItem[]> {
	return Promise.all(
		collected.map(async ({ file, relativePath }) => ({
			id: nextItemId(),
			file,
			absPath: await resolveAbsPath(file),
			relativePath,
			name: file.name,
			size: file.size,
			status: "pending" as const,
			progress: 0,
		})),
	);
}

/** Collect files from a drag & drop DataTransfer, expanding folders recursively. */
export async function collectFromDataTransfer(
	dt: DataTransfer,
	acceptTypes?: string,
): Promise<CollectResult> {
	const accept = createAcceptFilter(acceptTypes);
	const out: {
		files: { file: File; relativePath: string }[];
		rejected: number;
	} = { files: [], rejected: 0 };
	const limit = { hit: false };

	const entries: FileSystemEntryLike[] = [];
	for (const item of Array.from(dt.items)) {
		if (item.kind !== "file") continue;
		const getEntry = (
			item as DataTransferItem & {
				webkitGetAsEntry?: () => FileSystemEntryLike | null;
			}
		).webkitGetAsEntry;
		const entry = getEntry?.call(item);
		if (entry) {
			entries.push(entry);
		} else {
			const file = item.getAsFile();
			if (file) {
				if (accept(file)) out.files.push({ file, relativePath: file.name });
				else out.rejected += 1;
			}
		}
	}

	for (const entry of entries) {
		await walkEntry(entry, accept, out, limit);
		if (limit.hit) break;
	}

	return {
		items: await buildItems(out.files),
		truncated: limit.hit,
		rejectedCount: out.rejected,
	};
}

/** Collect files from an <input> (multiple or webkitdirectory). */
export async function collectFromFileList(
	files: FileList | File[],
	acceptTypes?: string,
): Promise<CollectResult> {
	const accept = createAcceptFilter(acceptTypes);
	const collected: { file: File; relativePath: string }[] = [];
	let rejected = 0;
	let truncated = false;
	for (const file of Array.from(files)) {
		if (!accept(file)) {
			rejected += 1;
			continue;
		}
		const rel =
			(file as File & { webkitRelativePath?: string }).webkitRelativePath ||
			file.name;
		collected.push({ file, relativePath: rel });
		if (collected.length >= MAX_BATCH_FILES) {
			truncated = true;
			break;
		}
	}
	return {
		items: await buildItems(collected),
		truncated,
		rejectedCount: rejected,
	};
}

interface DirectoryHandleLike {
	name: string;
	values: () => AsyncIterable<{
		kind: "file" | "directory";
		name: string;
		getFile?: () => Promise<File>;
		values?: DirectoryHandleLike["values"];
	}>;
}

async function walkDirectoryHandle(
	dir: DirectoryHandleLike,
	prefix: string,
	accept: (file: File) => boolean,
	out: { files: { file: File; relativePath: string }[]; rejected: number },
	limit: { hit: boolean },
): Promise<void> {
	for await (const entry of dir.values()) {
		if (limit.hit) return;
		const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
		if (entry.kind === "file" && entry.getFile) {
			try {
				const file = await entry.getFile();
				if (accept(file)) {
					out.files.push({ file, relativePath: rel });
					if (out.files.length >= MAX_BATCH_FILES) limit.hit = true;
				} else {
					out.rejected += 1;
				}
			} catch {
				out.rejected += 1;
			}
		} else if (entry.kind === "directory" && entry.values) {
			await walkDirectoryHandle(
				entry as unknown as DirectoryHandleLike,
				rel,
				accept,
				out,
				limit,
			);
		}
	}
}

/**
 * Pick a whole folder via the File System Access API (no browser "upload"
 * consent prompt, works in Chromium and the Electron shell).
 */
export async function collectFromDirectoryPicker(
	acceptTypes?: string,
): Promise<CollectResult | null> {
	const picker = (
		window as unknown as {
			showDirectoryPicker?: (opts?: {
				mode?: string;
			}) => Promise<DirectoryHandleLike>;
		}
	).showDirectoryPicker;
	if (!picker) return null;
	const dir = await picker({ mode: "read" });
	const accept = createAcceptFilter(acceptTypes);
	const out: {
		files: { file: File; relativePath: string }[];
		rejected: number;
	} = { files: [], rejected: 0 };
	const limit = { hit: false };
	await walkDirectoryHandle(dir, dir.name, accept, out, limit);
	return {
		items: await buildItems(out.files),
		truncated: limit.hit,
		rejectedCount: out.rejected,
	};
}

/**
 * Lazily resolve a BatchItem's File content.
 * Drag & drop items already carry a File; server-picked items are read
 * through the local server by absolute path on first use.
 */
export async function ensureItemFile(item: BatchItem): Promise<File> {
	if (item.file) return item.file;
	if (!item.absPath) throw new Error("文件内容不可用");
	const res = await fetch(
		`/api/local-file?path=${encodeURIComponent(item.absPath)}`,
	);
	if (!res.ok) throw new Error(`读取文件失败 (${res.status})`);
	const blob = await res.blob();
	const file = new File([blob], item.name, {
		type: blob.type || "application/octet-stream",
	});
	item.file = file;
	return file;
}

/**
 * Build batch items from server-picked absolute paths (native picker via
 * the local server, same mechanism as the materials library import).
 */
export async function collectFromServerPaths(
	paths: string[],
	extensions: string[],
): Promise<CollectResult> {
	const { entries } = await statBatchPaths({
		data: { paths, extensions },
	});
	return {
		items: entries.map((e) => ({
			id: nextItemId(),
			absPath: e.absPath,
			relativePath: e.relativePath,
			name: e.name,
			size: e.size,
			status: "pending" as const,
			progress: 0,
		})),
		truncated: entries.length >= 500,
		rejectedCount: 0,
	};
}
