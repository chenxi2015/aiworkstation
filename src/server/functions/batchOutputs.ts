import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { createServerFn } from "@tanstack/react-start";
import { openInOs } from "../services/systemOpener.ts";
import { pickSystemPaths } from "../services/systemPicker.ts";

export type BatchSaveMode = "new-directory" | "overwrite";

export interface BatchSaveManifestEntry {
	/** Index into the uploaded `files` array */
	index: number;
	/** Relative path inside the chosen output directory (new-directory mode) */
	relativePath?: string;
	/** Absolute path of the original file (overwrite mode) */
	originalPath?: string;
	/** Absolute output path (overwrite mode; differs from originalPath on format change) */
	outputPath?: string;
}

export interface BatchSaveResultItem {
	index: number;
	success: boolean;
	path?: string;
	error?: string;
}

export interface BatchSaveResult {
	success: boolean;
	mode: BatchSaveMode;
	outputDir?: string;
	items: BatchSaveResultItem[];
	error?: string;
}

function errMessage(err: unknown, fallback: string): string {
	return err instanceof Error ? err.message : fallback;
}

/** Move a file to the macOS trash (~/.Trash), renaming on conflict. Throws on failure. */
async function moveToSystemTrash(abs: string): Promise<string> {
	const trashDir = path.join(homedir(), ".Trash");
	let target = path.join(trashDir, path.basename(abs));
	if (existsSync(target)) {
		target = path.join(trashDir, `${path.basename(abs)}.${Date.now()}`);
	}
	try {
		await fs.rename(abs, target);
	} catch {
		// Cross-device rename fallback (e.g. external volumes)
		await new Promise<void>((resolvePromise, rejectPromise) => {
			execFile("mv", [abs, target], (err) =>
				err ? rejectPromise(err) : resolvePromise(),
			);
		});
	}
	return target;
}

/** Ensure a relative path cannot escape its base directory. */
function safeJoin(base: string, rel: string): string {
	const resolved = path.resolve(base, rel);
	const baseResolved = path.resolve(base);
	if (
		resolved !== baseResolved &&
		!resolved.startsWith(baseResolved + path.sep)
	) {
		throw new Error(`非法的相对路径: ${rel}`);
	}
	return resolved;
}

async function writeToNewDirectory(
	outputDir: string,
	entry: BatchSaveManifestEntry,
	buffer: Buffer,
): Promise<string> {
	if (!entry.relativePath) throw new Error("缺少相对路径");
	const target = safeJoin(outputDir, entry.relativePath);
	await fs.mkdir(path.dirname(target), { recursive: true });
	const tmp = `${target}.aiws-tmp-${Date.now()}`;
	await fs.writeFile(tmp, buffer);
	await fs.rename(tmp, target);
	return target;
}

async function overwriteOriginal(
	entry: BatchSaveManifestEntry,
	buffer: Buffer,
): Promise<string> {
	const originalPath = entry.originalPath;
	const outputPath = entry.outputPath || entry.originalPath;
	if (!originalPath || !outputPath) throw new Error("缺少目标路径");
	if (!path.isAbsolute(outputPath)) throw new Error("目标路径必须是绝对路径");

	const tmp = `${outputPath}.aiws-tmp-${Date.now()}`;
	await fs.writeFile(tmp, buffer);

	if (outputPath !== originalPath) {
		// Format changed: place the new file, then trash the original
		await fs.rename(tmp, outputPath);
		if (existsSync(originalPath)) {
			await moveToSystemTrash(originalPath);
		}
		return outputPath;
	}

	// Same path: trash original first, then move tmp into place, rollback on failure
	let trashedTo: string | null = null;
	try {
		trashedTo = await moveToSystemTrash(originalPath);
		await fs.rename(tmp, outputPath);
		return outputPath;
	} catch (err) {
		await fs.rm(tmp, { force: true }).catch(() => {});
		if (trashedTo && !existsSync(outputPath)) {
			await fs.rename(trashedTo, outputPath).catch(() => {});
		}
		throw err;
	}
}

/**
 * Persist browser-side batch outputs to disk.
 * - new-directory: write under outputDir preserving relative paths
 * - overwrite: replace original files in place (original goes to system trash, with rollback)
 */
export const saveBatchOutputs = createServerFn({
	method: "POST",
})
	.validator((formData: FormData) => {
		const mode = String(formData.get("mode") || "") as BatchSaveMode;
		if (mode !== "new-directory" && mode !== "overwrite") {
			throw new Error("非法的输出模式");
		}
		const outputDir = String(formData.get("outputDir") || "");
		if (mode === "new-directory" && !path.isAbsolute(outputDir)) {
			throw new Error("输出目录必须是绝对路径");
		}
		const rawManifest = formData.get("manifest");
		if (typeof rawManifest !== "string" || !rawManifest.trim()) {
			throw new Error("缺少文件清单");
		}
		let manifest: BatchSaveManifestEntry[];
		try {
			manifest = JSON.parse(rawManifest) as BatchSaveManifestEntry[];
		} catch {
			throw new Error("文件清单格式错误");
		}
		const files = formData
			.getAll("files")
			.filter((f): f is File => f instanceof File);
		if (files.length === 0) throw new Error("没有需要写入的文件");
		return { mode, outputDir, manifest, files };
	})
	.handler(async ({ data }): Promise<BatchSaveResult> => {
		const items: BatchSaveResultItem[] = [];
		for (const entry of data.manifest) {
			const file = data.files[entry.index];
			if (!file) {
				items.push({
					index: entry.index,
					success: false,
					error: "缺少对应文件",
				});
				continue;
			}
			try {
				const buffer = Buffer.from(await file.arrayBuffer());
				const writtenPath =
					data.mode === "new-directory"
						? await writeToNewDirectory(data.outputDir, entry, buffer)
						: await overwriteOriginal(entry, buffer);
				items.push({ index: entry.index, success: true, path: writtenPath });
			} catch (err) {
				items.push({
					index: entry.index,
					success: false,
					error: errMessage(err, "写入失败"),
				});
			}
		}
		const failed = items.filter((i) => !i.success).length;
		return {
			success: failed === 0,
			mode: data.mode,
			outputDir: data.mode === "new-directory" ? data.outputDir : undefined,
			items,
			error: failed > 0 ? `${failed} 个文件写入失败` : undefined,
		};
	});

/** Reveal an arbitrary local path in the OS file manager (batch outputs / dropped sources). */
export const revealLocalPath = createServerFn({ method: "POST" })
	.validator((data: { path: string }) => {
		if (!data?.path || !path.isAbsolute(data.path)) {
			throw new Error("需要绝对路径");
		}
		return data;
	})
	.handler(async ({ data }): Promise<{ opened: boolean }> => {
		await openInOs(data.path, { reveal: true, skipRootCheck: true });
		return { opened: true };
	});

/** Open an arbitrary local path with the system default application. */
export const openLocalPath = createServerFn({ method: "POST" })
	.validator((data: { path: string }) => {
		if (!data?.path || !path.isAbsolute(data.path)) {
			throw new Error("需要绝对路径");
		}
		return data;
	})
	.handler(async ({ data }): Promise<{ opened: boolean }> => {
		await openInOs(data.path, { reveal: false, skipRootCheck: true });
		return { opened: true };
	});

/** 唤起系统原生文件/文件夹选择器（macOS osascript / Windows PowerShell），返回绝对路径 */
export const pickBatchInputPaths = createServerFn({ method: "POST" })
	.validator((data: { mode: "files" | "directory" }) => {
		if (data?.mode !== "files" && data?.mode !== "directory") {
			throw new Error("非法的选择模式");
		}
		return data;
	})
	.handler(async ({ data }): Promise<{ paths: string[] }> => {
		const paths = await pickSystemPaths(data.mode);
		return { paths };
	});

/** 唤起系统原生目录选择器，返回输出目录绝对路径（取消返回 null） */
export const pickBatchOutputDirectory = createServerFn({
	method: "POST",
}).handler(async (): Promise<{ path: string | null }> => {
	const dirs = await pickSystemPaths("directory");
	return { path: dirs[0] ?? null };
});

export interface BatchPathEntry {
	absPath: string;
	name: string;
	size: number;
	/** 相对所选根的路径（选目录时含目录名前缀），用于保留目录结构 */
	relativePath: string;
}

function normalizeExtensions(extensions: string[]): Set<string> {
	const set = new Set<string>();
	for (const raw of extensions) {
		const ext = raw.trim().toLowerCase().replace(/^\./, "");
		if (!ext) continue;
		set.add(ext);
		if (ext === "jpg") set.add("jpeg");
		if (ext === "jpeg") set.add("jpg");
	}
	return set;
}

async function scanPathEntries(
	target: string,
	exts: Set<string>,
	prefix: string,
	out: BatchPathEntry[],
	limit: { count: number },
): Promise<void> {
	if (limit.count >= 500) return;
	let st: Awaited<ReturnType<typeof fs.stat>>;
	try {
		st = await fs.stat(target);
	} catch {
		return;
	}
	if (st.isFile()) {
		const ext = path.extname(target).replace(/^\./, "").toLowerCase();
		if (exts.size === 0 || exts.has(ext)) {
			out.push({
				absPath: target,
				name: path.basename(target),
				size: st.size,
				relativePath: prefix || path.basename(target),
			});
			limit.count += 1;
		}
		return;
	}
	if (st.isDirectory()) {
		let dirents: import("node:fs").Dirent[];
		try {
			dirents = await fs.readdir(target, { withFileTypes: true });
		} catch {
			return;
		}
		for (const dirent of dirents) {
			if (dirent.name.startsWith(".")) continue;
			if (dirent.name === "node_modules") continue;
			await scanPathEntries(
				path.join(target, dirent.name),
				exts,
				prefix ? `${prefix}/${dirent.name}` : dirent.name,
				out,
				limit,
			);
			if (limit.count >= 500) return;
		}
	}
}

/** 展开所选文件/目录路径为批量条目（含大小与相对路径），本地零拷贝 */
export const statBatchPaths = createServerFn({ method: "POST" })
	.validator((data: { paths: string[]; extensions?: string[] }) => {
		if (!Array.isArray(data?.paths) || data.paths.length === 0) {
			throw new Error("缺少路径");
		}
		return data;
	})
	.handler(async ({ data }): Promise<{ entries: BatchPathEntry[] }> => {
		const exts = normalizeExtensions(data.extensions ?? []);
		const entries: BatchPathEntry[] = [];
		const limit = { count: 0 };
		for (const raw of data.paths) {
			if (typeof raw !== "string" || !raw) continue;
			const target = path.resolve(raw);
			let st: Awaited<ReturnType<typeof fs.stat>> | null = null;
			try {
				st = await fs.stat(target);
			} catch {
				continue;
			}
			// 选中的是目录时，保留目录名作为相对路径前缀（与拖拽展开行为一致）
			const prefix = st.isDirectory() ? path.basename(target) : "";
			await scanPathEntries(target, exts, prefix, entries, limit);
			if (limit.count >= 500) break;
		}
		return { entries };
	});
