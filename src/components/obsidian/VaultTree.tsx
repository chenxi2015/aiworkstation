import {
	ChevronDown,
	ChevronRight,
	Ellipsis,
	FileText,
	Folder,
	FolderOpen,
} from "lucide-react";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import type { ObsidianTreeNode } from "./types";

export interface VaultTreeProps {
	nodes: ObsidianTreeNode[];
	depth?: number;
	selectedNotePath: string | null;
	currentDir: string;
	expanded: Set<string>;
	/** 正在内联重命名的条目路径（新建后自动进入重命名） */
	renamingPath?: string | null;
	onToggleFolder: (relPath: string) => void;
	onSelectFolder: (relPath: string) => void;
	onSelectNote: (relPath: string) => void;
	/** 打开条目操作菜单（右键或悬浮「...」），坐标为页面 clientX/Y */
	onOpenMenu: (node: ObsidianTreeNode, x: number, y: number) => void;
	/** 内联重命名提交（newName 不含 .md 后缀） */
	onRenameCommit: (relPath: string, newName: string, isFolder: boolean) => void;
	onRenameCancel: () => void;
}

// ── 行内重命名输入框 ──

function RenameInput({
	defaultValue,
	onCommit,
	onCancel,
}: {
	defaultValue: string;
	onCommit: (value: string) => void;
	onCancel: () => void;
}) {
	const [value, setValue] = useState(defaultValue);
	const inputRef = useRef<HTMLInputElement | null>(null);
	// blur 提交后不再重复提交（React 18 严格模式下双调用保护）
	const doneRef = useRef(false);

	useEffect(() => {
		const input = inputRef.current;
		if (!input) return;
		input.focus();
		input.select();
	}, []);

	const commit = () => {
		if (doneRef.current) return;
		doneRef.current = true;
		onCommit(value);
	};
	const cancel = () => {
		if (doneRef.current) return;
		doneRef.current = true;
		onCancel();
	};

	return (
		<input
			ref={inputRef}
			type="text"
			value={value}
			onChange={(e) => setValue(e.target.value)}
			onClick={(e) => e.stopPropagation()}
			onKeyDown={(e) => {
				e.stopPropagation();
				if (e.key === "Enter") commit();
				if (e.key === "Escape") cancel();
			}}
			onBlur={commit}
			className="flex-1 min-w-0 px-1 py-0 rounded border border-accent/60 bg-surface text-xs text-foreground focus:outline-none"
			onPointerDown={(e) => e.stopPropagation()}
		/>
	);
}

// ── 行共用：悬浮「...」按钮 + 右键菜单 + 可选内联重命名 ──

interface RowShellProps {
	node: ObsidianTreeNode;
	depth: number;
	active: boolean;
	isRenaming: boolean;
	onRowClick: () => void;
	onOpenMenu: (node: ObsidianTreeNode, x: number, y: number) => void;
	onRenameCommit: (relPath: string, newName: string, isFolder: boolean) => void;
	onRenameCancel: () => void;
	/** 左侧图标区（chevron/占位 + 类型图标） */
	leading: React.ReactNode;
	nameClassName: string;
}

function RowShell({
	node,
	depth,
	active,
	isRenaming,
	onRowClick,
	onOpenMenu,
	onRenameCommit,
	onRenameCancel,
	leading,
	nameClassName,
}: RowShellProps) {
	const indent = { paddingLeft: `${depth * 14 + 8}px` };
	const isFolder = node.kind === "folder";
	const defaultName =
		!isFolder && node.name.toLowerCase().endsWith(".md")
			? node.name.slice(0, -3)
			: node.name;

	const handleContextMenu = (e: React.MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
		onOpenMenu(node, e.clientX, e.clientY);
	};
	const handleDotsClick = (e: React.MouseEvent) => {
		e.stopPropagation();
		const rect = e.currentTarget.getBoundingClientRect();
		onOpenMenu(node, rect.right - 176, rect.bottom + 4);
	};

	const handleRowClick = () => {
		if (isRenaming) return;
		onRowClick();
	};

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: Row container is clickable for note/folder selection
		// biome-ignore lint/a11y/useKeyWithClickEvents: Keyboard navigation is handled by global vault shortcuts
		<div
			style={indent}
			data-reveal-path={node.relPath}
			onClick={handleRowClick}
			onContextMenu={handleContextMenu}
			className={`group w-full flex items-center gap-1.5 py-1.5 pr-1 text-left text-xs cursor-pointer select-none transition-colors ${
				active
					? "text-accent bg-accent/10"
					: "text-foreground/80 hover:bg-surface-secondary/60"
			}`}
			title={node.relPath}
		>
			{isRenaming ? (
				<>
					{leading}
					<RenameInput
						defaultValue={defaultName}
						onCommit={(value) => onRenameCommit(node.relPath, value, isFolder)}
						onCancel={onRenameCancel}
					/>
				</>
			) : (
				<div className="flex-1 flex items-center gap-1.5 min-w-0 text-left">
					{leading}
					<span className={`truncate ${nameClassName}`}>{node.name}</span>
				</div>
			)}
			{!isRenaming && (
				<button
					type="button"
					aria-label={`「${node.name}」操作`}
					onClick={handleDotsClick}
					className="p-0.5 rounded text-muted/70 opacity-0 group-hover:opacity-100 hover:text-foreground hover:bg-surface-secondary transition-all shrink-0"
				>
					<Ellipsis className="w-3.5 h-3.5" />
				</button>
			)}
		</div>
	);
}

// ── Memoized single row: only re-renders when its own relevant props change ──

interface FolderNodeProps {
	node: ObsidianTreeNode;
	depth: number;
	isCurrent: boolean;
	isExpanded: boolean;
	isRenaming: boolean;
	selectedNotePath: string | null;
	currentDir: string;
	expanded: Set<string>;
	renamingPath?: string | null;
	onToggleFolder: (relPath: string) => void;
	onSelectFolder: (relPath: string) => void;
	onSelectNote: (relPath: string) => void;
	onOpenMenu: (node: ObsidianTreeNode, x: number, y: number) => void;
	onRenameCommit: (relPath: string, newName: string, isFolder: boolean) => void;
	onRenameCancel: () => void;
}

const FolderNode = memo(function FolderNode({
	node,
	depth,
	isCurrent,
	isExpanded,
	isRenaming,
	selectedNotePath,
	currentDir,
	expanded,
	renamingPath,
	onToggleFolder,
	onSelectFolder,
	onSelectNote,
	onOpenMenu,
	onRenameCommit,
	onRenameCancel,
}: FolderNodeProps) {
	const handleClick = useCallback(() => {
		onToggleFolder(node.relPath);
		onSelectFolder(node.relPath);
	}, [node.relPath, onToggleFolder, onSelectFolder]);

	return (
		<div>
			<RowShell
				node={node}
				depth={depth}
				active={isCurrent}
				isRenaming={isRenaming}
				onRowClick={handleClick}
				onOpenMenu={onOpenMenu}
				onRenameCommit={onRenameCommit}
				onRenameCancel={onRenameCancel}
				nameClassName="font-medium"
				leading={
					<>
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
					</>
				}
			/>
			{isExpanded && node.children && node.children.length > 0 && (
				<VaultTree
					nodes={node.children}
					depth={depth + 1}
					selectedNotePath={selectedNotePath}
					currentDir={currentDir}
					expanded={expanded}
					renamingPath={renamingPath}
					onToggleFolder={onToggleFolder}
					onSelectFolder={onSelectFolder}
					onSelectNote={onSelectNote}
					onOpenMenu={onOpenMenu}
					onRenameCommit={onRenameCommit}
					onRenameCancel={onRenameCancel}
				/>
			)}
		</div>
	);
});

interface NoteNodeProps {
	node: ObsidianTreeNode;
	depth: number;
	isSelected: boolean;
	isRenaming: boolean;
	onSelectNote: (relPath: string) => void;
	onOpenMenu: (node: ObsidianTreeNode, x: number, y: number) => void;
	onRenameCommit: (relPath: string, newName: string, isFolder: boolean) => void;
	onRenameCancel: () => void;
}

const NoteNode = memo(function NoteNode({
	node,
	depth,
	isSelected,
	isRenaming,
	onSelectNote,
	onOpenMenu,
	onRenameCommit,
	onRenameCancel,
}: NoteNodeProps) {
	const handleClick = useCallback(() => {
		onSelectNote(node.relPath);
	}, [node.relPath, onSelectNote]);

	return (
		<RowShell
			node={node}
			depth={depth}
			active={isSelected}
			isRenaming={isRenaming}
			onRowClick={handleClick}
			onOpenMenu={onOpenMenu}
			onRenameCommit={onRenameCommit}
			onRenameCancel={onRenameCancel}
			nameClassName={isSelected ? "font-medium" : "text-foreground/70"}
			leading={
				<>
					<span className="w-3 shrink-0" />
					<FileText className="w-3.5 h-3.5 shrink-0 text-muted" />
				</>
			}
		/>
	);
});

/** Vault 目录树（递归渲染）：文件夹可折叠、点击即作为新建目标目录 */
export const VaultTree = memo(function VaultTree({
	nodes,
	depth = 0,
	selectedNotePath,
	currentDir,
	expanded,
	renamingPath,
	onToggleFolder,
	onSelectFolder,
	onSelectNote,
	onOpenMenu,
	onRenameCommit,
	onRenameCancel,
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
							isRenaming={renamingPath === node.relPath}
							selectedNotePath={selectedNotePath}
							currentDir={currentDir}
							expanded={expanded}
							renamingPath={renamingPath}
							onToggleFolder={onToggleFolder}
							onSelectFolder={onSelectFolder}
							onSelectNote={onSelectNote}
							onOpenMenu={onOpenMenu}
							onRenameCommit={onRenameCommit}
							onRenameCancel={onRenameCancel}
						/>
					);
				}
				return (
					<NoteNode
						key={node.relPath}
						node={node}
						depth={depth}
						isSelected={selectedNotePath === node.relPath}
						isRenaming={renamingPath === node.relPath}
						onSelectNote={onSelectNote}
						onOpenMenu={onOpenMenu}
						onRenameCommit={onRenameCommit}
						onRenameCancel={onRenameCancel}
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
