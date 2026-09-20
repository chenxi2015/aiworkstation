import { type Dirent, promises as fs } from "node:fs";
import path from "node:path";
import type {
	ObsidianTree,
	ObsidianTreeNode,
} from "../../../components/obsidian/types.ts";
import { resolveObsidianVaultDir } from "./vault.ts";

const TREE_CACHE_MS = 60_000;
const MAX_DEPTH = 8;
const MAX_NODES = 5000;

/** Obsidian 元数据 / 回收站 / 依赖目录，连同一切隐藏项一起跳过 */
const SKIP_DIRS = new Set([".obsidian", ".trash", "node_modules"]);

let treeCache: { data: ObsidianTree; at: number } | null = null;
let treeInflight: Promise<ObsidianTree> | null = null;

/** 结构变更（增删改移动）后调用，强制下次扫描重读磁盘 */
export function invalidateVaultTreeCache(): void {
	treeCache = null;
}

/** 扫描 Vault 目录树（60s 内存缓存，force 可绕过；并发去重同 skills overview） */
export async function scanVaultTree(force = false): Promise<ObsidianTree> {
	if (!force && treeCache && Date.now() - treeCache.at < TREE_CACHE_MS) {
		return treeCache.data;
	}
	if (!force && treeInflight) return treeInflight;
	const task = doScanVaultTree();
	treeInflight = task;
	try {
		return await task;
	} finally {
		if (treeInflight === task) treeInflight = null;
	}
}

async function doScanVaultTree(): Promise<ObsidianTree> {
	const vault = resolveObsidianVaultDir();
	let exists = false;
	try {
		exists = (await fs.stat(vault.path)).isDirectory();
	} catch {
		exists = false;
	}
	const state = { noteCount: 0, nodes: 0 };
	const tree = exists ? await scanDir(vault.path, vault.path, state, 0) : [];
	const data: ObsidianTree = {
		vault: {
			path: vault.path,
			configured: vault.configured,
			exists,
			noteCount: state.noteCount,
		},
		tree,
		scannedAt: Date.now(),
	};
	treeCache = { data, at: Date.now() };
	return data;
}

async function scanDir(
	dir: string,
	baseDir: string,
	state: { noteCount: number; nodes: number },
	depth: number,
): Promise<ObsidianTreeNode[]> {
	if (depth > MAX_DEPTH || state.nodes > MAX_NODES) return [];
	let entries: Dirent[];
	try {
		entries = await fs.readdir(dir, { withFileTypes: true });
	} catch {
		return [];
	}

	const nodes: ObsidianTreeNode[] = [];
	for (const entry of entries) {
		if (state.nodes > MAX_NODES) break;
		if (entry.name.startsWith(".") || SKIP_DIRS.has(entry.name)) continue;
		const full = path.join(dir, entry.name);
		const relPath = path.relative(baseDir, full);

		if (entry.isDirectory()) {
			const children = await scanDir(full, baseDir, state, depth + 1);
			let mtime = 0;
			try {
				mtime = (await fs.stat(full)).mtimeMs;
			} catch {
				// 忽略单条目读取失败
			}
			nodes.push({
				name: entry.name,
				relPath,
				kind: "folder",
				size: 0,
				mtime,
				children,
			});
			state.nodes += 1;
		} else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
			try {
				const stat = await fs.stat(full);
				nodes.push({
					name: entry.name.slice(0, -3),
					relPath,
					kind: "note",
					size: stat.size,
					mtime: stat.mtimeMs,
				});
				state.nodes += 1;
				state.noteCount += 1;
			} catch {
				// 忽略单条目读取失败
			}
		}
	}

	// 文件夹在前，各自按名称排序（中文按拼音）
	nodes.sort((a, b) =>
		a.kind === b.kind
			? a.name.localeCompare(b.name, "zh-Hans-CN")
			: a.kind === "folder"
				? -1
				: 1,
	);
	return nodes;
}
