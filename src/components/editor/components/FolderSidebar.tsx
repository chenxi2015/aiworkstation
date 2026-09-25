import { Feedback } from "@dnd-kit/dom";
import { useDroppable } from "@dnd-kit/react";
import { useSortable } from "@dnd-kit/react/sortable";
import { Dropdown, Modal, Tooltip } from "@heroui/react";
import {
	Ellipsis,
	Folder as FolderIcon,
	FolderPlus,
	Inbox,
	PanelLeftClose,
	PanelLeftOpen,
	Pencil,
	Trash2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ConfirmDialog } from "../../workbench/ConfirmDialog";
import type { ActiveFolderId } from "../hooks/useDocumentManager";
import type { EditorDocFolder } from "../types";
import {
	EDITOR_ALL_DROP_ID,
	EDITOR_DOC_TYPE,
	EDITOR_FOLDER_TYPE,
	type EditorFolderDragData,
	editorFolderRowId,
} from "../utils/editorDnd";

export interface FolderSidebarProps {
	folders: EditorDocFolder[];
	/** 全部文档数（不含 archived） */
	totalCount: number;
	activeFolderId: ActiveFolderId;
	/** 文档拖拽悬停高亮的放置目标（由 EditorApp 的 DnD 状态驱动） */
	docDropTarget: number | "all" | null;
	collapsed: boolean;
	onToggleCollapsed: () => void;
	onSelectFolder: (id: ActiveFolderId) => void;
	onCreateFolder: (name?: string) => Promise<EditorDocFolder>;
	onRenameFolder: (id: number, name: string) => Promise<void>;
	onDeleteFolder: (id: number) => Promise<void>;
}

export function FolderSidebar({
	folders,
	totalCount,
	activeFolderId,
	docDropTarget,
	collapsed,
	onToggleCollapsed,
	onSelectFolder,
	onCreateFolder,
	onRenameFolder,
	onDeleteFolder,
}: FolderSidebarProps) {
	const [renamingId, setRenamingId] = useState<number | null>(null);
	const [renameValue, setRenameValue] = useState("");
	const [deletingFolder, setDeletingFolder] = useState<EditorDocFolder | null>(
		null,
	);
	const [isCreateOpen, setIsCreateOpen] = useState(false);
	const [createName, setCreateName] = useState("");
	const [creating, setCreating] = useState(false);

	const commitRename = async () => {
		const id = renamingId;
		const name = renameValue.trim();
		setRenamingId(null);
		if (id != null && name) {
			await onRenameFolder(id, name);
		}
	};

	const openCreateModal = () => {
		setCreateName("新建文件夹");
		setIsCreateOpen(true);
	};

	const handleCreateConfirm = async () => {
		if (creating) return;
		setCreating(true);
		try {
			const folder = await onCreateFolder(createName.trim() || "新建文件夹");
			setIsCreateOpen(false);
			onSelectFolder(folder.id);
		} finally {
			setCreating(false);
		}
	};

	return (
		<>
			{/* 单一 aside 承载两种宽度，配合 transition 实现折叠/展开动画 */}
			<aside
				className={`shrink-0 border-r border-border bg-surface flex flex-col min-h-0 overflow-hidden transition-[width] duration-200 ease-in-out ${
					collapsed ? "w-12" : "w-48"
				}`}
			>
				{collapsed ? (
					<>
						{/* 折叠态：图标栏，悬停 Tooltip 显示名称 */}
						<div className="flex flex-col items-center py-2 gap-1">
							<button
								type="button"
								onClick={onToggleCollapsed}
								title="展开文件夹栏"
								aria-label="展开文件夹栏"
								className="p-1.5 rounded-lg text-muted hover:text-foreground hover:bg-muted/15 transition-colors cursor-pointer"
							>
								<PanelLeftOpen className="w-4 h-4" />
							</button>
							<button
								type="button"
								onClick={openCreateModal}
								title="新建文件夹"
								aria-label="新建文件夹"
								className="p-1.5 rounded-lg text-muted hover:text-foreground hover:bg-muted/15 transition-colors cursor-pointer"
							>
								<FolderPlus className="w-4 h-4" />
							</button>
						</div>
						<div className="w-6 h-px bg-border my-1 mx-auto shrink-0" />
						<div className="flex-1 overflow-y-auto flex flex-col items-center gap-1 min-h-0 w-full pb-2">
							<Tooltip>
								<Tooltip.Trigger>
									<button
										type="button"
										onClick={() => onSelectFolder("all")}
										aria-label="全部"
										className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
											activeFolderId === "all"
												? "bg-accent/15 text-accent"
												: "text-muted hover:text-foreground hover:bg-muted/15"
										}`}
									>
										<Inbox className="w-4 h-4" />
									</button>
								</Tooltip.Trigger>
								<Tooltip.Content placement="right">
									全部（{totalCount}）
								</Tooltip.Content>
							</Tooltip>
							{folders.map((folder) => (
								<Tooltip key={folder.id}>
									<Tooltip.Trigger>
										<button
											type="button"
											onClick={() => onSelectFolder(folder.id)}
											aria-label={folder.name}
											className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
												activeFolderId === folder.id
													? "bg-accent/15 text-accent"
													: "text-muted hover:text-foreground hover:bg-muted/15"
											}`}
										>
											<FolderIcon className="w-4 h-4" />
										</button>
									</Tooltip.Trigger>
									<Tooltip.Content placement="right">
										{folder.name}（{folder.docCount ?? 0}）
									</Tooltip.Content>
								</Tooltip>
							))}
						</div>
					</>
				) : (
					<>
						{/* 顶部：新建文件夹（置顶）+ 折叠切换，与文档栏头部同高对齐 */}
						<div className="p-3 border-b border-border flex items-center gap-2">
							<button
								type="button"
								onClick={openCreateModal}
								className="flex-1 flex items-center justify-center gap-1.5 px-3 h-8 rounded-lg bg-green-500 text-accent-foreground text-xs font-medium hover:opacity-90 transition-opacity cursor-pointer whitespace-nowrap"
							>
								<FolderPlus className="w-3.5 h-3.5 shrink-0" />
								新建文件夹
							</button>
							<button
								type="button"
								onClick={onToggleCollapsed}
								title="隐藏文件夹栏"
								aria-label="隐藏文件夹栏"
								className="h-8 w-8 flex items-center justify-center rounded-lg bg-surface-secondary border border-border text-muted hover:text-foreground hover:bg-muted/15 transition-colors cursor-pointer shrink-0"
							>
								<PanelLeftClose className="w-3.5 h-3.5" />
							</button>
						</div>

						<div className="flex-1 overflow-y-auto p-1.5 space-y-0.5 min-h-0">
							{/* 全部（固定置顶，不可删改） */}
							<AllDocsRow
								totalCount={totalCount}
								active={activeFolderId === "all"}
								dropActive={docDropTarget === "all"}
								onSelect={() => onSelectFolder("all")}
							/>

							{folders.map((folder, index) => (
								<FolderRow
									key={folder.id}
									folder={folder}
									index={index}
									active={activeFolderId === folder.id}
									dropActive={docDropTarget === folder.id}
									renaming={renamingId === folder.id}
									renameValue={renameValue}
									onRenameValueChange={setRenameValue}
									onRenameCommit={() => void commitRename()}
									onRenameCancel={() => setRenamingId(null)}
									onSelect={() => onSelectFolder(folder.id)}
									onStartRename={() => {
										setRenamingId(folder.id);
										setRenameValue(folder.name);
									}}
									onRequestDelete={() => setDeletingFolder(folder)}
								/>
							))}
						</div>
					</>
				)}
			</aside>

			{/* 新建文件夹弹框 */}
			<Modal.Backdrop
				isOpen={isCreateOpen}
				onOpenChange={(open) => {
					if (!open) setIsCreateOpen(false);
				}}
				variant="blur"
			>
				<Modal.Container placement="center">
					<Modal.Dialog className="sm:max-w-[360px]">
						<Modal.CloseTrigger />
						<Modal.Header>
							<Modal.Heading>新建文件夹</Modal.Heading>
						</Modal.Header>
						<Modal.Body className="mt-2">
							<input
								autoFocus
								value={createName}
								onChange={(e) => setCreateName(e.target.value)}
								onKeyDown={(e) => {
									if (e.key === "Enter") void handleCreateConfirm();
								}}
								onFocus={(e) => e.target.select()}
								placeholder="文件夹名称"
								className="w-full px-3 py-2 text-sm bg-surface-secondary border border-border rounded-lg outline-none focus:border-accent/60 transition-colors"
							/>
						</Modal.Body>
						<Modal.Footer className="flex justify-end gap-2 mt-4">
							<button
								type="button"
								onClick={() => setIsCreateOpen(false)}
								className="px-3 py-1.5 text-xs rounded-lg border border-border text-muted hover:text-foreground hover:bg-muted/10 transition-colors cursor-pointer"
							>
								取消
							</button>
							<button
								type="button"
								disabled={creating}
								onClick={() => void handleCreateConfirm()}
								className="px-3 py-1.5 text-xs rounded-lg bg-accent text-accent-foreground font-medium hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50"
							>
								{creating ? "创建中…" : "创建"}
							</button>
						</Modal.Footer>
					</Modal.Dialog>
				</Modal.Container>
			</Modal.Backdrop>

			<ConfirmDialog
				isOpen={deletingFolder !== null}
				onOpenChange={(open) => {
					if (!open) setDeletingFolder(null);
				}}
				title="删除文件夹"
				description={`确定删除文件夹「${deletingFolder?.name ?? ""}」吗？其中的 ${
					deletingFolder?.docCount ?? 0
				} 篇文档会移回「全部」，不会被删除。`}
				onConfirm={async () => {
					if (deletingFolder) {
						await onDeleteFolder(deletingFolder.id);
					}
					setDeletingFolder(null);
				}}
			/>
		</>
	);
}

/** 「全部」行：固定置顶，同时是「移出文件夹」的放置目标 */
function AllDocsRow({
	totalCount,
	active,
	dropActive,
	onSelect,
}: {
	totalCount: number;
	active: boolean;
	dropActive: boolean;
	onSelect: () => void;
}) {
	// 只接受文档拖拽（文件夹排序不会在这里触发高亮/放置）
	const { ref } = useDroppable({
		id: EDITOR_ALL_DROP_ID,
		accept: EDITOR_DOC_TYPE,
	});
	return (
		<div ref={ref} data-edfolder="all" className="rounded-lg">
			<button
				type="button"
				onClick={onSelect}
				className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs transition-colors cursor-pointer ${
					dropActive
						? "bg-accent/20 border border-accent/50"
						: active
							? "bg-accent/10 border border-accent/30 text-foreground"
							: "text-foreground hover:bg-muted/10 border border-transparent"
				}`}
			>
				<Inbox className="w-3.5 h-3.5 text-muted shrink-0" />
				<span className="flex-1 text-left font-medium truncate">全部</span>
				<span className="text-[10px] text-muted/70 tabular-nums">
					{totalCount}
				</span>
			</button>
		</div>
	);
}

/** 文件夹行：sortable（拖拽排序）+ 文档放置目标 + ⋯ 菜单（重命名/删除） */
function FolderRow({
	folder,
	index,
	active,
	dropActive,
	renaming,
	renameValue,
	onRenameValueChange,
	onRenameCommit,
	onRenameCancel,
	onSelect,
	onStartRename,
	onRequestDelete,
}: {
	folder: EditorDocFolder;
	index: number;
	active: boolean;
	dropActive: boolean;
	renaming: boolean;
	renameValue: string;
	onRenameValueChange: (value: string) => void;
	onRenameCommit: () => void;
	onRenameCancel: () => void;
	onSelect: () => void;
	onStartRename: () => void;
	onRequestDelete: () => void;
}) {
	const { ref, isDragSource } = useSortable({
		id: editorFolderRowId(folder.id),
		index,
		// 类型+分组双重隔离：只与文件夹互相排序，文档拖入仅作放置目标高亮
		type: EDITOR_FOLDER_TYPE,
		accept: EDITOR_FOLDER_TYPE,
		group: "editor-folder",
		// 跟随物由 EditorDragChip 承担，源行不跟随指针
		plugins: [Feedback.configure({ feedback: "none" })],
		data: {
			kind: "editor-folder",
			folderId: folder.id,
		} satisfies EditorFolderDragData,
	});

	const renameInputRef = useRef<HTMLInputElement | null>(null);
	// 记录进入重命名的时间，用于忽略菜单关闭动画期间的焦点抢夺
	const renamingStartedAtRef = useRef(0);

	useEffect(() => {
		if (!renaming) return;
		const input = renameInputRef.current;
		if (!input) return;
		renamingStartedAtRef.current = Date.now();
		// 下拉菜单关闭期间 FocusScope 会把焦点圈定/还原到 ⋯ 触发按钮，
		// 立即 focus 会被弹层夺回，需在关闭动画结束前多次尝试抢占焦点
		const focusInput = () => {
			if (document.activeElement !== input) {
				input.focus();
				input.select();
			}
		};
		focusInput();
		const timers = [120, 260].map((ms) => setTimeout(focusInput, ms));
		return () => {
			for (const timer of timers) clearTimeout(timer);
		};
	}, [renaming]);

	return (
		// biome-ignore lint/a11y/useSemanticElements: 行内嵌套重命名输入框与菜单按钮，无法用原生 button
		<div
			ref={ref}
			data-edfolder={folder.id}
			role="button"
			tabIndex={0}
			className={`group flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs transition-colors cursor-pointer ${
				isDragSource ? "opacity-40 " : ""
			}${
				dropActive
					? "bg-accent/20 border border-accent/50"
					: active
						? "bg-accent/10 border border-accent/30 text-foreground"
						: "text-foreground hover:bg-muted/10 border border-transparent"
			}`}
			onClick={onSelect}
			onKeyDown={(e) => {
				if (e.key === "Enter") onSelect();
			}}
		>
			<FolderIcon className="w-3.5 h-3.5 text-muted shrink-0" />
			{renaming ? (
				<input
					ref={renameInputRef}
					value={renameValue}
					onChange={(e) => onRenameValueChange(e.target.value)}
					onKeyDown={(e) => {
						e.stopPropagation();
						if (e.key === "Enter") onRenameCommit();
						if (e.key === "Escape") onRenameCancel();
					}}
					onBlur={() => {
						// 菜单关闭动画期间焦点被弹层短暂夺走，不视为用户主动失焦
						if (Date.now() - renamingStartedAtRef.current < 300) return;
						onRenameCommit();
					}}
					onClick={(e) => e.stopPropagation()}
					className="flex-1 min-w-0 px-1 py-0.5 text-xs bg-surface border border-accent/50 rounded outline-none"
				/>
			) : (
				<span className="flex-1 text-left truncate select-none">
					{folder.name}
				</span>
			)}
			{!renaming && (
				<>
					<span className="text-[10px] text-muted/70 tabular-nums shrink-0">
						{folder.docCount ?? 0}
					</span>
					<Dropdown>
						<Dropdown.Trigger
							aria-label="文件夹更多操作"
							className="p-0.5 rounded text-muted hover:text-foreground hover:bg-muted/20 transition-colors cursor-pointer opacity-0 group-hover:opacity-100 data-[pressed]:opacity-100 shrink-0"
							onClick={(e: React.MouseEvent) => e.stopPropagation()}
							onPointerDown={(e: React.PointerEvent) => e.stopPropagation()}
						>
							<Ellipsis className="w-3.5 h-3.5" />
						</Dropdown.Trigger>
						<Dropdown.Popover
							placement="bottom start"
							className="min-w-[140px] p-1 shadow-lg border border-border/80 rounded-xl bg-surface"
						>
							<Dropdown.Menu aria-label="文件夹操作">
								<Dropdown.Item
									id="rename"
									textValue="重命名文件夹"
									onAction={onStartRename}
								>
									<div className="flex items-center gap-2 py-0.5">
										<Pencil className="w-3.5 h-3.5 text-muted shrink-0" />
										<span className="text-xs">重命名文件夹</span>
									</div>
								</Dropdown.Item>
								<Dropdown.Item
									id="delete"
									textValue="删除文件夹"
									onAction={onRequestDelete}
								>
									<div className="flex items-center gap-2 py-0.5">
										<Trash2 className="w-3.5 h-3.5 text-danger shrink-0" />
										<span className="text-xs text-danger">删除文件夹</span>
									</div>
								</Dropdown.Item>
							</Dropdown.Menu>
						</Dropdown.Popover>
					</Dropdown>
				</>
			)}
		</div>
	);
}
