import { toast } from "@heroui/react";
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
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { openVaultEntryRpc } from "../../../services/api/obsidianClient";
import type { ObsidianTreeNode } from "../types";
import { getVaultFileCategory, isViewableInApp } from "../utils/vaultFileUtils";
import type { FlatTreeNode } from "./vaultTreeUtils";

interface RenameInputProps {
	defaultValue: string;
	onCommit: (value: string) => void;
	onCancel: () => void;
}

/** Inline rename input box with auto-focus, select-all, and Enter/Escape handling */
export function RenameInput({
	defaultValue,
	onCommit,
	onCancel,
}: RenameInputProps) {
	const [value, setValue] = useState(defaultValue);
	const inputRef = useRef<HTMLInputElement | null>(null);
	// Double-call guard for React 18 strict mode
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

interface RowShellProps {
	node: ObsidianTreeNode;
	depth: number;
	active: boolean;
	isRenaming: boolean;
	onRowClick: () => void;
	onOpenMenu: (node: ObsidianTreeNode, x: number, y: number) => void;
	onRenameCommit: (relPath: string, newName: string, isFolder: boolean) => void;
	onRenameCancel: () => void;
	leading: React.ReactNode;
	nameClassName: string;
}

/** Row shell handling visual indent, context menu, hover ellipsis button, and rename state */
export function RowShell({
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

export interface FlatRowProps {
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

/** Memoized flat tree row renderer that branches between folder and file representations */
export const FlatRow = memo(function FlatRow({
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
			// Files viewable in-app go to the right-hand panel, others delegate to system app
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
