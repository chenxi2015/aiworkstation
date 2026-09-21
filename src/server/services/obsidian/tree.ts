import { type Dirent, promises as fs } from "node:fs";
import path from "node:path";
import type {
	ObsidianTree,
	ObsidianTreeNode,
} from "../../../components/obsidian/types.ts";
import { invalidateDataviewCache } from "./dataview.ts";
import { resolveObsidianVaultDir, toPosixRelPath } from "./vault.ts";

const TREE_CACHE_MS = 60_000;
const MAX_DEPTH = 8;
const MAX_NODES = 5000;

/** Obsidian 元数据 / 回收站 / 依赖目录，连同一切隐藏项一起跳过 */
const SKIP_DIRS = new Set([".obsidian", ".trash", "node_modules"]);

let treeCache: { data: ObsidianTree; at: number } | null = null;
let treeInflight: Promise<ObsidianTree> | null = null;

interface WikilinkIndex {
	byName: Map<string, string[]>;
	allNotes: Array<{ bare: string; relPath: string }>;
}
let wikilinkIndexCache: WikilinkIndex | null = null;

/** 结构变更（增删改移动）后调用，强制下次扫描重读磁盘 */
export function invalidateVaultTreeCache(): void {
	treeCache = null;
	wikilinkIndexCache = null;
	invalidateDataviewCache();
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

function buildWikilinkIndex(tree: ObsidianTreeNode[]): WikilinkIndex {
	const byName = new Map<string, string[]>();
	const allNotes: Array<{ bare: string; relPath: string }> = [];

	const walk = (nodes: ObsidianTreeNode[]) => {
		for (const node of nodes) {
			if (node.kind === "note") {
				const list = byName.get(node.name) ?? [];
				list.push(node.relPath);
				byName.set(node.name, list);

				const bare = node.relPath.replace(/\.md$/i, "");
				allNotes.push({ bare, relPath: node.relPath });
			} else {
				walk(node.children ?? []);
			}
		}
	};
	walk(tree);

	for (const list of byName.values()) {
		list.sort((a, b) => a.length - b.length);
	}
	allNotes.sort((a, b) => a.relPath.length - b.relPath.length);

	return { byName, allNotes };
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
	wikilinkIndexCache = buildWikilinkIndex(tree);
	return data;
}

/**
 * 解析 Obsidian 双链目标 → Vault 相对路径（基于目录树缓存）：
 * - 含 "/" 按路径精确匹配（可省略 .md 后缀）
 * - 纯名称按文件名全局匹配（多命中取路径最短者，对齐 Obsidian 最短路径优先）
 * - 未找到返回 null（由调用方决定是否新建）
 */
export async function resolveVaultWikilink(
	target: string,
): Promise<string | null> {
	const cleaned = target.trim().replace(/\.md$/i, "");
	if (!cleaned) return null;
	const treeData = await scanVaultTree();
	if (!wikilinkIndexCache) {
		wikilinkIndexCache = buildWikilinkIndex(treeData.tree);
	}

	if (cleaned.includes("/")) {
		// 完整路径优先，其次路径后缀匹配（Obsidian 允许省略上层目录）
		const match = wikilinkIndexCache.allNotes.find(
			(n) => n.bare === cleaned || n.bare.endsWith(`/${cleaned}`),
		);
		return match?.relPath ?? null;
	}

	const candidates = wikilinkIndexCache.byName.get(cleaned);
	return candidates?.[0] ?? null;
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

	// Separate entries into folders and .md files for different handling
	const folderEntries: Dirent[] = [];
	const noteEntries: Dirent[] = [];
	for (const entry of entries) {
		if (state.nodes > MAX_NODES) break;
		if (entry.name.startsWith(".") || SKIP_DIRS.has(entry.name)) continue;
		if (entry.isDirectory()) {
			folderEntries.push(entry);
		} else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
			noteEntries.push(entry);
		}
	}

	const nodes: ObsidianTreeNode[] = [];

	// Folders: recurse children, skip mtime stat (UI doesn't display folder mtime)
	for (const entry of folderEntries) {
		if (state.nodes > MAX_NODES) break;
		const full = path.join(dir, entry.name);
		const relPath = toPosixRelPath(baseDir, full);
		const children = await scanDir(full, baseDir, state, depth + 1);
		nodes.push({
			name: entry.name,
			relPath,
			kind: "folder",
			size: 0,
			mtime: 0,
			children,
		});
		state.nodes += 1;
	}

	// Notes: parallel stat for all .md files in same directory
	if (
		noteEntries.length > 0 &&
		state.nodes + noteEntries.length <= MAX_NODES + noteEntries.length
	) {
		const statResults = await Promise.all(
			noteEntries.map(async (entry) => {
				const full = path.join(dir, entry.name);
				try {
					const stat = await fs.stat(full);
					return { entry, full, stat };
				} catch {
					return null;
				}
			}),
		);
		for (const result of statResults) {
			if (!result || state.nodes > MAX_NODES) continue;
			const relPath = toPosixRelPath(baseDir, result.full);
			nodes.push({
				name: result.entry.name.slice(0, -3),
				relPath,
				kind: "note",
				size: result.stat.size,
				mtime: result.stat.mtimeMs,
			});
			state.nodes += 1;
			state.noteCount += 1;
		}
	}

	// Folders first, then sort by name (Chinese pinyin)
	nodes.sort((a, b) =>
		a.kind === b.kind
			? a.name.localeCompare(b.name, "zh-Hans-CN")
			: a.kind === "folder"
				? -1
				: 1,
	);
	return nodes;
}
