import { toast } from "@heroui/react";
import {
	Copy,
	ExternalLink,
	Folder,
	FolderSearch,
	LayoutGrid,
	Pencil,
	SquarePen,
	Trash2,
} from "lucide-react";
import { useEffect, useRef } from "react";
import { getFileManagerName } from "../../lib/platform";
import { openVaultEntryRpc } from "../../services/api/obsidianClient";
import type { ObsidianTreeNode } from "./types";

export interface TreeMenuTarget {
	node: ObsidianTreeNode | null;
	dirPath?: string;
	x: number;
	y: number;
}

export interface TreeContextMenuProps {
	target: TreeMenuTarget | null;
	onClose: () => void;
	onCreateNote: (dir: string) => void;
	onCreateFolder: (dir: string) => void;
	onCreateCanvas: (dir: string) => void;
	onRename: (node: ObsidianTreeNode) => void;
	onDelete: (node: ObsidianTreeNode) => void;
	onCopyPath: (node: ObsidianTreeNode) => void;
	onReveal: (node: ObsidianTreeNode) => void;
}

function MenuItem({
	icon: Icon,
	label,
	danger,
	onClick,
}: {
	icon: typeof Pencil;
	label: string;
	danger?: boolean;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-left text-xs font-medium transition-colors ${
				danger
					? "text-danger hover:bg-danger/10"
					: "text-foreground/85 hover:bg-surface-secondary/70"
			}`}
		>
			<Icon
				className={`w-4 h-4 shrink-0 ${danger ? "text-danger" : "text-muted"}`}
			/>
			<span>{label}</span>
		</button>
	);
}

/**
 * 目录树右键/「...」操作菜单（自定义定位，样式对齐 HeroUI Dropdown.Popover）。
 * 支持空白区域右键（新建笔记/文件夹/白板）及条目右键。
 */
export function TreeContextMenu({
	target,
	onClose,
	onCreateNote,
	onCreateFolder,
	onCreateCanvas,
	onRename,
	onDelete,
	onCopyPath,
	onReveal,
}: TreeContextMenuProps) {
	const menuRef = useRef<HTMLDivElement | null>(null);

	useEffect(() => {
		if (!target) return;
		const onPointerDown = (e: MouseEvent) => {
			if (!menuRef.current?.contains(e.target as Node)) onClose();
		};
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") onClose();
		};
		// 捕获阶段监听滚动：任何滚动都关闭菜单（位置已失效）
		const onScroll = () => onClose();
		document.addEventListener("mousedown", onPointerDown);
		document.addEventListener("keydown", onKeyDown);
		document.addEventListener("scroll", onScroll, true);
		return () => {
			document.removeEventListener("mousedown", onPointerDown);
			document.removeEventListener("keydown", onKeyDown);
			document.removeEventListener("scroll", onScroll, true);
		};
	}, [target, onClose]);

	if (!target) return null;

	const { node } = target;
	const isFolder = node?.kind === "folder";
	// Accurate heights: blank new menu (3 items ~112px), note file menu (~190px), folder menu (~250px)
	const menuHeight = !node ? 112 : isFolder ? 250 : 190;
	const menuWidth = !node ? 144 : 176;

	// Keep horizontally within viewport, flip left if overflowing right edge
	const left =
		target.x + menuWidth + 8 > window.innerWidth
			? Math.max(4, target.x - menuWidth)
			: Math.max(4, target.x);

	// Keep vertically attached to cursor; flip upwards if overflowing bottom edge
	const top =
		target.y + menuHeight + 8 > window.innerHeight
			? Math.max(4, target.y - menuHeight)
			: Math.max(4, target.y);

	const act = (fn: () => void) => () => {
		onClose();
		fn();
	};

	// 1. 空白区域右键菜单（只显示新建笔记、新建文件夹、新建白板）
	if (!node) {
		const targetDir = target.dirPath ?? "";
		return (
			<div
				ref={menuRef}
				style={{ left, top }}
				className="fixed z-50 min-w-36 p-1 shadow-lg border border-border/80 rounded-xl bg-surface animate-in fade-in zoom-in-95 duration-100 select-none"
			>
				<MenuItem
					icon={SquarePen}
					label="新建笔记"
					onClick={act(() => onCreateNote(targetDir))}
				/>
				<MenuItem
					icon={Folder}
					label="新建文件夹"
					onClick={act(() => onCreateFolder(targetDir))}
				/>
				<MenuItem
					icon={LayoutGrid}
					label="新建白板"
					onClick={act(() => onCreateCanvas(targetDir))}
				/>
			</div>
		);
	}

	return (
		<div
			ref={menuRef}
			style={{ left, top }}
			className="fixed z-50 min-w-44 p-1 shadow-lg border border-border/80 rounded-xl bg-surface animate-in fade-in zoom-in-95 duration-100 select-none"
		>
			{isFolder ? (
				<>
					<MenuItem
						icon={SquarePen}
						label="新建笔记"
						onClick={act(() => onCreateNote(node.relPath))}
					/>
					<MenuItem
						icon={Folder}
						label="新建文件夹"
						onClick={act(() => onCreateFolder(node.relPath))}
					/>
					<MenuItem
						icon={LayoutGrid}
						label="新建白板"
						onClick={act(() => onCreateCanvas(node.relPath))}
					/>
					<div className="my-1 border-t border-border/60" />
				</>
			) : (
				<>
					<MenuItem
						icon={ExternalLink}
						label="在系统默认应用中打开"
						onClick={act(async () => {
							const res = await openVaultEntryRpc(node.relPath);
							if (res.success) {
								toast.success(`已在系统默认应用中打开「${node.name}」`);
							} else {
								toast.danger(res.error || `打开文件「${node.name}」失败`);
							}
						})}
					/>
					<div className="my-1 border-t border-border/60" />
				</>
			)}
			<MenuItem
				icon={Pencil}
				label="重命名"
				onClick={act(() => onRename(node))}
			/>
			<MenuItem
				icon={Trash2}
				label="删除"
				danger
				onClick={act(() => onDelete(node))}
			/>
			<div className="my-1 border-t border-border/60" />
			<MenuItem
				icon={Copy}
				label="复制路径"
				onClick={act(() => onCopyPath(node))}
			/>
			<MenuItem
				icon={FolderSearch}
				label={`在${getFileManagerName()}中显示`}
				onClick={act(() => onReveal(node))}
			/>
		</div>
	);
}
