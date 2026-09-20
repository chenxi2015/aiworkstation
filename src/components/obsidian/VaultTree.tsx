import {
	ChevronDown,
	ChevronRight,
	FileText,
	Folder,
	FolderOpen,
} from "lucide-react";
import { memo, useCallback } from "react";
import type { ObsidianTreeNode } from "./types";

export interface VaultTreeProps {
	nodes: ObsidianTreeNode[];
	depth?: number;
	selectedNotePath: string | null;
	currentDir: string;
	expanded: Set<string>;
	onToggleFolder: (relPath: string) => void;
	onSelectFolder: (relPath: string) => void;
	onSelectNote: (relPath: string) => void;
}

// ── Memoized single row: only re-renders when its own relevant props change ──

interface FolderNodeProps {
	node: ObsidianTreeNode;
	depth: number;
	isCurrent: boolean;
	isExpanded: boolean;
	selectedNotePath: string | null;
	currentDir: string;
	expanded: Set<string>;
	onToggleFolder: (relPath: string) => void;
	onSelectFolder: (relPath: string) => void;
	onSelectNote: (relPath: string) => void;
}

const FolderNode = memo(function FolderNode({
	node,
	depth,
	isCurrent,
	isExpanded,
	selectedNotePath,
	currentDir,
	expanded,
	onToggleFolder,
	onSelectFolder,
	onSelectNote,
}: FolderNodeProps) {
	const indent = { paddingLeft: `${depth * 14 + 8}px` };
	const handleClick = useCallback(() => {
		onToggleFolder(node.relPath);
		onSelectFolder(node.relPath);
	}, [node.relPath, onToggleFolder, onSelectFolder]);

	return (
		<div>
			<button
				type="button"
				style={indent}
				onClick={handleClick}
				className={`w-full flex items-center gap-1.5 py-1.5 pr-2 text-left text-xs transition-colors ${
					isCurrent
						? "text-accent bg-accent/10"
						: "text-foreground/80 hover:bg-surface-secondary/60"
				}`}
				title={node.relPath}
			>
				{isExpanded ? (
					<ChevronDown className="w-3 h-3 shrink-0 text-muted" />
				) : (
					<ChevronRight className="w-3 h-3 shrink-0 text-muted" />
				)}
				{isExpanded ? (
					<FolderOpen className="w-3.5 h-3.5 shrink-0 text-accent/80" />
				) : (
					<Folder className="w-3.5 h-3.5 shrink-0 text-accent/80" />
				)}
				<span className="truncate font-medium">{node.name}</span>
			</button>
			{isExpanded && node.children && node.children.length > 0 && (
				<VaultTree
					nodes={node.children}
					depth={depth + 1}
					selectedNotePath={selectedNotePath}
					currentDir={currentDir}
					expanded={expanded}
					onToggleFolder={onToggleFolder}
					onSelectFolder={onSelectFolder}
					onSelectNote={onSelectNote}
				/>
			)}
		</div>
	);
});

interface NoteNodeProps {
	node: ObsidianTreeNode;
	depth: number;
	isSelected: boolean;
	onSelectNote: (relPath: string) => void;
}

const NoteNode = memo(function NoteNode({
	node,
	depth,
	isSelected,
	onSelectNote,
}: NoteNodeProps) {
	const indent = { paddingLeft: `${depth * 14 + 8}px` };
	const handleClick = useCallback(() => {
		onSelectNote(node.relPath);
	}, [node.relPath, onSelectNote]);

	return (
		<button
			type="button"
			style={indent}
			onClick={handleClick}
			className={`w-full flex items-center gap-1.5 py-1.5 pr-2 text-left text-xs transition-colors ${
				isSelected
					? "text-accent bg-accent/10 font-medium"
					: "text-foreground/70 hover:bg-surface-secondary/60"
			}`}
			title={node.relPath}
		>
			<span className="w-3 shrink-0" />
			<FileText className="w-3.5 h-3.5 shrink-0 text-muted" />
			<span className="truncate">{node.name}</span>
		</button>
	);
});

/** Vault 目录树（递归渲染）：文件夹可折叠、点击即作为新建目标目录 */
export const VaultTree = memo(function VaultTree({
	nodes,
	depth = 0,
	selectedNotePath,
	currentDir,
	expanded,
	onToggleFolder,
	onSelectFolder,
	onSelectNote,
}: VaultTreeProps) {
	return (
		<div>
			{nodes.map((node) => {
				if (node.kind === "folder") {
					return (
						<FolderNode
							key={node.relPath}
							node={node}
							depth={depth}
							isCurrent={currentDir === node.relPath}
							isExpanded={expanded.has(node.relPath)}
							selectedNotePath={selectedNotePath}
							currentDir={currentDir}
							expanded={expanded}
							onToggleFolder={onToggleFolder}
							onSelectFolder={onSelectFolder}
							onSelectNote={onSelectNote}
						/>
					);
				}
				return (
					<NoteNode
						key={node.relPath}
						node={node}
						depth={depth}
						isSelected={selectedNotePath === node.relPath}
						onSelectNote={onSelectNote}
					/>
				);
			})}
		</div>
	);
});

/** 按关键词过滤目录树：保留命中的笔记与含有命中后代的文件夹 */
export function filterVaultTree(
	nodes: ObsidianTreeNode[],
	query: string,
): ObsidianTreeNode[] {
	const q = query.trim().toLowerCase();
	if (!q) return nodes;
	const walk = (list: ObsidianTreeNode[]): ObsidianTreeNode[] => {
		const out: ObsidianTreeNode[] = [];
		for (const node of list) {
			if (node.kind === "note") {
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

/** 收集树中全部文件夹路径（搜索时强制展开用） */
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
