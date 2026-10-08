import type { ObsidianTreeNode } from "../types";

export interface FlatTreeNode {
	node: ObsidianTreeNode;
	depth: number;
	isFolder: boolean;
	isExpanded: boolean;
}

/** Flatten tree structure into a visible row list using depth-first search based on expanded state */
export function flattenVaultTree(
	nodes: ObsidianTreeNode[],
	expanded: Set<string>,
	depth = 0,
): FlatTreeNode[] {
	const out: FlatTreeNode[] = [];

	const walk = (list: ObsidianTreeNode[], curDepth: number) => {
		for (const node of list) {
			const isFolder = node.kind === "folder";
			const isExpanded = isFolder && expanded.has(node.relPath);
			out.push({
				node,
				depth: curDepth,
				isFolder,
				isExpanded,
			});
			if (isExpanded && node.children && node.children.length > 0) {
				walk(node.children, curDepth + 1);
			}
		}
	};

	walk(nodes, depth);
	return out;
}

/** Filter tree by query keyword: retains matched notes and folders containing matched descendants */
export function filterVaultTree(
	nodes: ObsidianTreeNode[],
	query: string,
): ObsidianTreeNode[] {
	const q = query.trim().toLowerCase();
	if (!q) return nodes;
	const walk = (list: ObsidianTreeNode[]): ObsidianTreeNode[] => {
		const out: ObsidianTreeNode[] = [];
		for (const node of list) {
			if (node.kind === "note" || node.kind === "file") {
				if (node.name.toLowerCase().includes(q)) out.push(node);
				continue;
			}
			const children = walk(node.children ?? []);
			if (children.length > 0 || node.name.toLowerCase().includes(q)) {
				out.push({ ...node, children });
			}
		}
		return out;
	};
	return walk(nodes);
}

/** Collect all folder paths in the tree (used for expanding all folders during search) */
export function collectFolderPaths(nodes: ObsidianTreeNode[]): string[] {
	const out: string[] = [];
	const walk = (list: ObsidianTreeNode[]) => {
		for (const node of list) {
			if (node.kind !== "folder") continue;
			out.push(node.relPath);
			walk(node.children ?? []);
		}
	};
	walk(nodes);
	return out;
}

export interface VaultFolderItem {
	name: string;
	relPath: string;
	depth: number;
}

/** Check if moving a source node to targetDir is allowed */
export function canMoveEntry(
	source: ObsidianTreeNode,
	targetDir: string,
): { allowed: boolean; reason?: string } {
	const sourceParent = source.relPath.includes("/")
		? source.relPath.split("/").slice(0, -1).join("/")
		: "";

	if (sourceParent === targetDir) {
		return { allowed: false, reason: "已在当前位置" };
	}

	if (source.kind === "folder") {
		if (source.relPath === targetDir) {
			return { allowed: false, reason: "不能移动到自身" };
		}
		if (targetDir.startsWith(`${source.relPath}/`)) {
			return { allowed: false, reason: "不能移动到自身子目录下" };
		}
	}

	return { allowed: true };
}

/** Recursively collect all folders in tree with hierarchy depth */
export function collectAllFolders(
	nodes: ObsidianTreeNode[],
	depth = 0,
): VaultFolderItem[] {
	const out: VaultFolderItem[] = [];
	for (const node of nodes) {
		if (node.kind !== "folder") continue;
		out.push({
			name: node.name,
			relPath: node.relPath,
			depth,
		});
		if (node.children && node.children.length > 0) {
			out.push(...collectAllFolders(node.children, depth + 1));
		}
	}
	return out;
}
