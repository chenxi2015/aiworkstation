import { type Dirent, promises as fs } from "node:fs";
import path from "node:path";
import type {
	ObsidianTree,
	ObsidianTreeNode,
} from "../../../components/obsidian/types.ts";
import { invalidateDataviewCache } from "./dataview.ts";
import { resolveObsidianVaultDir, toPosixRelPath } from "./vault.ts";

const TREE_CACHE_MS = 60_000;
// Allow deep directory hierarchies while preventing infinite loops from circular symlinks
const MAX_DEPTH = 32;
// High threshold to support large-scale Obsidian vaults without early truncation
const MAX_NODES = 50_000;

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
export async function scanVaultTree(
	force = false,
	vaultDir?: string,
): Promise<ObsidianTree> {
	const cleanVaultDir = vaultDir?.trim();
	// If explicit vault dir requested and differs from cached vault, invalidate first
	if (cleanVaultDir && treeCache && treeCache.data.vault.configured !== cleanVaultDir) {
		invalidateVaultTreeCache();
	}

	if (!force && !cleanVaultDir && treeCache && Date.now() - treeCache.at < TREE_CACHE_MS) {
		return treeCache.data;
	}
	if (!force && !cleanVaultDir && treeInflight) return treeInflight;
	const task = doScanVaultTree(cleanVaultDir);
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
				// 纯笔记名（如 "MyNote"）与带后缀名（"MyNote.md"）都建立索引
				const list = byName.get(node.name) ?? [];
				list.push(node.relPath);
				byName.set(node.name, list);

				const mdFullName = `${node.name}.md`;
				const mdList = byName.get(mdFullName) ?? [];
				if (!mdList.includes(node.relPath)) {
					mdList.push(node.relPath);
					byName.set(mdFullName, mdList);
				}

				const bare = node.relPath.replace(/\.md$/i, "");
				allNotes.push({ bare, relPath: node.relPath });
			} else if (node.kind === "file") {
				// 通用文件（如 "How to take smart notes.epub"）
				const list = byName.get(node.name) ?? [];
				list.push(node.relPath);
				byName.set(node.name, list);

				// 建立去掉扩展名的别名索引（同名 note 优先）
				const dotIdx = node.name.lastIndexOf(".");
				if (dotIdx > 0) {
					const stem = node.name.slice(0, dotIdx);
					const stemList = byName.get(stem) ?? [];
					if (!stemList.includes(node.relPath)) {
						stemList.push(node.relPath);
						byName.set(stem, stemList);
					}
					const bareRel = node.relPath.slice(0, -(node.name.length - dotIdx));
					allNotes.push({ bare: bareRel, relPath: node.relPath });
				}
				allNotes.push({ bare: node.relPath, relPath: node.relPath });
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

async function doScanVaultTree(vaultDir?: string): Promise<ObsidianTree> {
	const vault = resolveObsidianVaultDir(vaultDir);
	let exists = false;
	try {
		exists = (await fs.stat(vault.path)).isDirectory();
	} catch {
		exists = false;
	}
	const state = { noteCount: 0, nodes: 0 };
	const visited = new Set<string>();
	const tree = exists
		? await scanDir(vault.path, vault.path, state, 0, visited)
		: [];
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
 * - 含 "/" 按路径精确匹配（支持 .md 与非 md 扩展名）
 * - 纯名称按文件名全局匹配（多命中取路径最短者，对齐 Obsidian 最短路径优先）
 * - 支持外部文件（如 .epub、.pdf、音视频等真实文件）
 * - 未找到返回 null（由调用方决定是否新建）
 */
export async function resolveVaultWikilink(
	target: string,
): Promise<string | null> {
	const trimmed = target.trim();
	if (!trimmed) return null;
	const treeData = await scanVaultTree();
	if (!wikilinkIndexCache) {
		wikilinkIndexCache = buildWikilinkIndex(treeData.tree);
	}

	if (trimmed.includes("/")) {
		// 完整路径优先，其次路径后缀匹配（Obsidian 允许省略上层目录）
		const cleaned = trimmed.replace(/\.md$/i, "");
		const match = wikilinkIndexCache.allNotes.find(
			(n) =>
				n.relPath === trimmed ||
				n.bare === trimmed ||
				n.relPath === `${cleaned}.md` ||
				n.bare === cleaned ||
				n.relPath.endsWith(`/${trimmed}`) ||
				n.bare.endsWith(`/${trimmed}`) ||
				n.relPath.endsWith(`/${cleaned}.md`) ||
				n.bare.endsWith(`/${cleaned}`),
		);
		return match?.relPath ?? null;
	}

	// 1. 尝试以原 target 查找（例如 "How to take smart notes.epub" 或 "MyNote"）
	let candidates = wikilinkIndexCache.byName.get(trimmed);
	if (candidates && candidates.length > 0) {
		return candidates[0];
	}

	// 2. 如果 target 以 .md 结尾，尝试去掉 .md 查；如果没带，尝试加上 .md 查
	if (/\.md$/i.test(trimmed)) {
		candidates = wikilinkIndexCache.byName.get(trimmed.replace(/\.md$/i, ""));
	} else {
		candidates = wikilinkIndexCache.byName.get(`${trimmed}.md`);
	}

	return candidates?.[0] ?? null;
}

async function scanDir(
	dir: string,
	baseDir: string,
	state: { noteCount: number; nodes: number },
	depth: number,
	visited: Set<string>,
): Promise<ObsidianTreeNode[]> {
	if (depth > MAX_DEPTH || state.nodes > MAX_NODES) return [];
	if (visited.has(dir)) return [];
	visited.add(dir);

	let entries: Dirent[];
	try {
		entries = await fs.readdir(dir, { withFileTypes: true });
	} catch {
		return [];
	}

	// Separate entries into folders and files (.md notes + other attachments)
	const folderEntries: Dirent[] = [];
	const fileEntries: Dirent[] = [];
	for (const entry of entries) {
		if (state.nodes > MAX_NODES) break;
		if (entry.name.startsWith(".") || SKIP_DIRS.has(entry.name)) continue;
		if (entry.isDirectory()) {
			folderEntries.push(entry);
		} else if (entry.isFile()) {
			fileEntries.push(entry);
		}
	}

	const nodes: ObsidianTreeNode[] = [];

	// Folders: recurse children, skip mtime stat (UI doesn't display folder mtime)
	for (const entry of folderEntries) {
		if (state.nodes > MAX_NODES) break;
		const full = path.join(dir, entry.name);
		const relPath = toPosixRelPath(baseDir, full);
		const children = await scanDir(full, baseDir, state, depth + 1, visited);
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

	// Files: parallel stat for all files (.md notes and other attachments like epub, pdf, etc.)
	if (
		fileEntries.length > 0 &&
		state.nodes + fileEntries.length <= MAX_NODES + fileEntries.length
	) {
		const statResults = await Promise.all(
			fileEntries.map(async (entry) => {
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
			const isMd = result.entry.name.toLowerCase().endsWith(".md");
			const relPath = toPosixRelPath(baseDir, result.full);
			nodes.push({
				name: isMd ? result.entry.name.slice(0, -3) : result.entry.name,
				relPath,
				kind: isMd ? "note" : "file",
				size: result.stat.size,
				mtime: result.stat.mtimeMs,
			});
			state.nodes += 1;
			if (isMd) {
				state.noteCount += 1;
			}
		}
	}

	// Folders first, then sort by name (Chinese pinyin)
	nodes.sort((a, b) =>
		a.kind === "folder" && b.kind !== "folder"
			? -1
			: a.kind !== "folder" && b.kind === "folder"
				? 1
				: a.name.localeCompare(b.name, "zh-Hans-CN"),
	);
	return nodes;
}
