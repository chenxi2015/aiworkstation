import { toast } from "@heroui/react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
	BookOpen,
	ChevronDown,
	ChevronRight,
	Ellipsis,
	File,
	FileText,
	Film,
	Folder,
	FolderOpen,
	Image,
	Music,
	Waypoints,
} from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { openVaultEntryRpc } from "../../services/api/obsidianClient";
import type { ObsidianTreeNode } from "./types";
import { getVaultFileCategory, isViewableInApp } from "./utils/vaultFileUtils";

export interface FlatTreeNode {
	node: ObsidianTreeNode;
	depth: number;
	isFolder: boolean;
	isExpanded: boolean;
}

export interface VaultTreeProps {
	nodes: ObsidianTreeNode[];
	scrollElement?: HTMLDivElement | null;
	scrollRef?: React.RefObject<HTMLDivElement | null>;
	selectedNotePath: string | null;
	currentDir: string;
	expanded: Set<string>;
	/** 正在内联重命名的条目路径（新建后自动进入重命名） */
	renamingPath?: string | null;
	autoReveal?: boolean;
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
			className="flex-1 min-w-0 px-1 py-0 rounded border border-zinc-400 dark:border-zinc-600 bg-surface text-xs text-foreground focus:outline-none focus:border-zinc-900 dark:focus:border-zinc-100"
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
	// Cap visual indent to prevent text from being crushed in deep hierarchies
	const effectiveDepth = Math.min(depth, 10);
	const indent = { paddingLeft: `${effectiveDepth * 14 + 8}px` };
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
			className={`group w-full h-[28px] flex items-center gap-1.5 pr-1 text-left text-xs cursor-pointer select-none transition-colors ${
				active
					? "text-zinc-900 dark:text-zinc-100 bg-zinc-200/70 dark:bg-zinc-800 font-medium"
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

// ── 扁平单行渲染（按文件夹/笔记类型自适应） ──

interface FlatRowProps {
	item: FlatTreeNode;
	isCurrent: boolean;
	isSelected: boolean;
	isRenaming: boolean;
	onToggleFolder: (relPath: string) => void;
	onSelectFolder: (relPath: string) => void;
	onSelectNote: (relPath: string) => void;
	onOpenMenu: (node: ObsidianTreeNode, x: number, y: number) => void;
	onRenameCommit: (relPath: string, newName: string, isFolder: boolean) => void;
	onRenameCancel: () => void;
}

const FlatRow = memo(function FlatRow({
	item,
	isCurrent,
	isSelected,
	isRenaming,
	onToggleFolder,
	onSelectFolder,
	onSelectNote,
	onOpenMenu,
	onRenameCommit,
	onRenameCancel,
}: FlatRowProps) {
	const { node, depth, isFolder, isExpanded } = item;

	const handleRowClick = useCallback(async () => {
		if (isFolder) {
			onToggleFolder(node.relPath);
			onSelectFolder(node.relPath);
		} else if (node.kind === "file") {
			// 应用内可展示的类型（canvas/图片/音视频/PDF）进右侧面板，其余调系统默认应用
			if (isViewableInApp(getVaultFileCategory(node.relPath))) {
				onSelectNote(node.relPath);
				return;
			}
			const res = await openVaultEntryRpc(node.relPath);
			if (res.success) {
				toast.success(`已在系统默认应用中打开「${node.name}」`);
			} else {
				toast.danger(res.error || `打开文件「${node.name}」失败`);
			}
		} else {
			onSelectNote(node.relPath);
		}
	}, [
		isFolder,
		node.kind,
		node.name,
		node.relPath,
		onToggleFolder,
		onSelectFolder,
		onSelectNote,
	]);

	if (isFolder) {
		return (
			<RowShell
				node={node}
				depth={depth}
				active={isCurrent}
				isRenaming={isRenaming}
				onRowClick={handleRowClick}
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
							<FolderOpen
								className={`w-3.5 h-3.5 shrink-0 transition-colors ${
									isCurrent
										? "text-zinc-900 dark:text-zinc-100"
										: "text-muted group-hover:text-foreground/80"
								}`}
							/>
						) : (
							<Folder
								className={`w-3.5 h-3.5 shrink-0 transition-colors ${
									isCurrent
										? "text-zinc-900 dark:text-zinc-100"
										: "text-muted group-hover:text-foreground/80"
								}`}
							/>
						)}
					</>
				}
			/>
		);
	}

	const iconClass = `w-3.5 h-3.5 shrink-0 transition-colors ${
		isSelected
			? "text-zinc-900 dark:text-zinc-100"
			: "text-muted group-hover:text-foreground/80"
	}`;

	const renderFileIcon = () => {
		if (node.kind === "note") {
			return <FileText className={iconClass} />;
		}
		const category = getVaultFileCategory(node.name);
		switch (category) {
			case "canvas":
				return <Waypoints className={iconClass} />;
			case "book":
				return <BookOpen className={iconClass} />;
			case "image":
				return <Image className={iconClass} />;
			case "video":
				return <Film className={iconClass} />;
			case "audio":
				return <Music className={iconClass} />;
			default:
				return <File className={iconClass} />;
		}
	};

	return (
		<RowShell
			node={node}
			depth={depth}
			active={isSelected}
			isRenaming={isRenaming}
			onRowClick={handleRowClick}
			onOpenMenu={onOpenMenu}
			onRenameCommit={onRenameCommit}
			onRenameCancel={onRenameCancel}
			nameClassName={
				isSelected
					? "font-medium text-zinc-900 dark:text-zinc-100"
					: "text-foreground/70"
			}
			leading={
				<>
					<span className="w-3 shrink-0" />
					{renderFileIcon()}
				</>
			}
		/>
	);
});

/** 树结构平铺算法：按展开状态深度优先遍历输出可见行列表 */
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

/** Vault 目录树（虚拟列表渲染）：海量笔记展开时仅渲染可见 DOM 节点 */
export const VaultTree = memo(function VaultTree({
	nodes,
	scrollElement,
	scrollRef,
	selectedNotePath,
	currentDir,
	expanded,
	renamingPath,
	autoReveal,
	onToggleFolder,
	onSelectFolder,
	onSelectNote,
	onOpenMenu,
	onRenameCommit,
	onRenameCancel,
}: VaultTreeProps) {
	const internalRef = useRef<HTMLDivElement | null>(null);

	const flatNodes = useMemo(
		() => flattenVaultTree(nodes, expanded),
		[nodes, expanded],
	);

	const rowVirtualizer = useVirtualizer({
		count: flatNodes.length,
		getScrollElement: () =>
			scrollElement ?? scrollRef?.current ?? internalRef.current,
		estimateSize: () => 28,
		overscan: 10,
	});

	// Auto-reveal: scroll virtual row into view
	useEffect(() => {
		if (!autoReveal || !selectedNotePath) return;
		const index = flatNodes.findIndex(
			(item) => !item.isFolder && item.node.relPath === selectedNotePath,
		);
		if (index !== -1) {
			rowVirtualizer.scrollToIndex(index, { align: "auto" });
		}
	}, [autoReveal, selectedNotePath, flatNodes, rowVirtualizer]);

	const virtualRows = rowVirtualizer.getVirtualItems();
	// Initial frame fallback: if virtualizer hasn't measured yet but nodes exist, render directly
	const shouldFallback = virtualRows.length === 0 && flatNodes.length > 0;

	if (shouldFallback) {
		return (
			<div ref={internalRef} className="w-full">
				{flatNodes.map((item) => (
					<FlatRow
						key={item.node.relPath}
						item={item}
						isCurrent={item.isFolder && currentDir === item.node.relPath}
						isSelected={
							!item.isFolder && selectedNotePath === item.node.relPath
						}
						isRenaming={renamingPath === item.node.relPath}
						onToggleFolder={onToggleFolder}
						onSelectFolder={onSelectFolder}
						onSelectNote={onSelectNote}
						onOpenMenu={onOpenMenu}
						onRenameCommit={onRenameCommit}
						onRenameCancel={onRenameCancel}
					/>
				))}
			</div>
		);
	}

	return (
		<div
			ref={scrollElement ? undefined : scrollRef ? undefined : internalRef}
			style={{
				height: `${rowVirtualizer.getTotalSize()}px`,
				width: "100%",
				position: "relative",
			}}
		>
			{virtualRows.map((virtualRow) => {
				const item = flatNodes[virtualRow.index];
				if (!item) return null;

				return (
					<div
						key={item.node.relPath}
						style={{
							position: "absolute",
							top: 0,
							left: 0,
							width: "100%",
							height: `${virtualRow.size}px`,
							transform: `translateY(${virtualRow.start}px)`,
						}}
					>
						<FlatRow
							item={item}
							isCurrent={item.isFolder && currentDir === item.node.relPath}
							isSelected={
								!item.isFolder && selectedNotePath === item.node.relPath
							}
							isRenaming={renamingPath === item.node.relPath}
							onToggleFolder={onToggleFolder}
							onSelectFolder={onSelectFolder}
							onSelectNote={onSelectNote}
							onOpenMenu={onOpenMenu}
							onRenameCommit={onRenameCommit}
							onRenameCancel={onRenameCancel}
						/>
					</div>
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
