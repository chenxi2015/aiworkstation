import { Dropdown, Tooltip, toast } from "@heroui/react";
import {
	BookOpen,
	ChevronLeft,
	ChevronRight,
	Code2,
	Columns2,
	Copy,
	Ellipsis,
	FolderSearch,
	Loader2,
	PenLine,
	PenTool,
	Redo2,
	Trash2,
	Undo2,
	Waypoints,
} from "lucide-react";
import { Fragment, useEffect, useRef, useState } from "react";
import { getFileManagerName } from "../../../../lib/platform";
import { revealVaultEntryRpc } from "../../../../services/api/obsidianClient";

export interface NoteToolbarProps {
	canGoBack?: boolean;
	canGoForward?: boolean;
	onBack?: () => void;
	onForward?: () => void;
	canUndo?: boolean;
	canRedo?: boolean;
	onUndo?: () => void;
	onRedo?: () => void;
	activeRelPath: string;
	activeName: string;
	onSelectFolder?: (dir: string) => void;
	onRename: (newName: string) => Promise<void>;
	isTruncated?: boolean;
	isCanvas: boolean;
	/** 可视化视图的展示名（画布视图 / 画板视图），用于切换按钮提示 */
	visualLabel?: string;
	canvasMode: "visual" | "source";
	onToggleCanvasMode: () => void;
	isSplitOpen: boolean;
	onToggleSplitCompare: () => void;
	viewMode: "editing" | "reading";
	onToggleViewMode: () => void;
	canDelete: boolean;
	onDelete: () => void;
	/** 导入创作台二次创作 */
	onImportToStudio?: () => void;
	isImportingToStudio?: boolean;
}

/** Top navigation and action toolbar for notes (Obsidian-styled breadcrumbs, view toggles, history navigation) */
export function NoteToolbar({
	canGoBack,
	canGoForward,
	onBack,
	onForward,
	canUndo,
	canRedo,
	onUndo,
	onRedo,
	activeRelPath,
	activeName,
	onSelectFolder,
	onRename,
	isTruncated,
	isCanvas,
	visualLabel = "画布视图",
	canvasMode,
	onToggleCanvasMode,
	isSplitOpen,
	onToggleSplitCompare,
	viewMode,
	onToggleViewMode,
	canDelete,
	onDelete,
	onImportToStudio,
	isImportingToStudio,
}: NoteToolbarProps) {
	const [editingTitle, setEditingTitle] = useState(false);
	const [titleDraft, setTitleDraft] = useState("");
	const titleInputRef = useRef<HTMLInputElement | null>(null);

	// Focus and select title on entering rename mode
	useEffect(() => {
		if (!editingTitle) return;
		titleInputRef.current?.focus();
		titleInputRef.current?.select();
	}, [editingTitle]);

	const commitRename = () => {
		setEditingTitle(false);
		void onRename(titleDraft);
	};

	return (
		<div className="flex items-center gap-1 px-2 py-1.5 border-b border-border shrink-0">
			{/* Left: Back / Forward navigation & Undo / Redo history */}
			<div className="flex items-center shrink-0">
				<Tooltip>
					<Tooltip.Trigger>
						<button
							type="button"
							aria-label="返回"
							onClick={onBack}
							disabled={!canGoBack}
							className="p-1.5 rounded-md text-muted hover:text-foreground hover:bg-surface-secondary/60 transition-colors disabled:opacity-30 disabled:pointer-events-none"
						>
							<ChevronLeft className="w-4 h-4" />
						</button>
					</Tooltip.Trigger>
					<Tooltip.Content placement="bottom">返回</Tooltip.Content>
				</Tooltip>
				<Tooltip>
					<Tooltip.Trigger>
						<button
							type="button"
							aria-label="前进"
							onClick={onForward}
							disabled={!canGoForward}
							className="p-1.5 rounded-md text-muted hover:text-foreground hover:bg-surface-secondary/60 transition-colors disabled:opacity-30 disabled:pointer-events-none"
						>
							<ChevronRight className="w-4 h-4" />
						</button>
					</Tooltip.Trigger>
					<Tooltip.Content placement="bottom">前进</Tooltip.Content>
				</Tooltip>

				<div className="h-3.5 w-px bg-border/60 mx-1 shrink-0" />

				<Tooltip>
					<Tooltip.Trigger>
						<button
							type="button"
							aria-label="撤销"
							onClick={onUndo}
							disabled={!canUndo}
							className="p-1.5 rounded-md text-muted hover:text-foreground hover:bg-surface-secondary/60 transition-colors disabled:opacity-30 disabled:pointer-events-none"
						>
							<Undo2 className="w-4 h-4" />
						</button>
					</Tooltip.Trigger>
					<Tooltip.Content placement="bottom">撤销 (⌘Z)</Tooltip.Content>
				</Tooltip>
				<Tooltip>
					<Tooltip.Trigger>
						<button
							type="button"
							aria-label="重做"
							onClick={onRedo}
							disabled={!canRedo}
							className="p-1.5 rounded-md text-muted hover:text-foreground hover:bg-surface-secondary/60 transition-colors disabled:opacity-30 disabled:pointer-events-none"
						>
							<Redo2 className="w-4 h-4" />
						</button>
					</Tooltip.Trigger>
					<Tooltip.Content placement="bottom">重做 (⌘⇧Z)</Tooltip.Content>
				</Tooltip>
			</div>

			{/* Center: Breadcrumb path & inline note renaming */}
			<div className="flex-1 min-w-0 flex justify-center px-2">
				{editingTitle ? (
					<input
						ref={titleInputRef}
						type="text"
						value={titleDraft}
						onChange={(e) => setTitleDraft(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter") commitRename();
							if (e.key === "Escape") setEditingTitle(false);
						}}
						onBlur={commitRename}
						className="w-72 max-w-full px-1.5 py-0.5 rounded-md border border-zinc-400 dark:border-zinc-600 bg-surface text-xs font-medium text-foreground focus:outline-none focus:border-zinc-900 dark:focus:border-zinc-100"
					/>
				) : (
					<nav
						className="flex items-center min-w-0 max-w-full text-xs text-muted"
						title={activeRelPath}
					>
						{activeRelPath
							.split("/")
							.slice(0, -1)
							.map((seg, i, arr) => (
								<Fragment key={arr.slice(0, i + 1).join("/")}>
									<button
										type="button"
										onClick={() =>
											onSelectFolder?.(arr.slice(0, i + 1).join("/"))
										}
										className="shrink-0 max-w-36 truncate px-1 py-0.5 rounded hover:text-foreground hover:bg-surface-secondary/60 transition-colors"
									>
										{seg}
									</button>
									<span className="shrink-0 text-muted/50">/</span>
								</Fragment>
							))}
						<button
							type="button"
							aria-label="重命名笔记"
							onClick={() => {
								if (!canDelete) return;
								setTitleDraft(
									activeName.replace(/\.(md|canvas|excalidraw)$/i, ""),
								);
								setEditingTitle(true);
							}}
							className="min-w-0 truncate px-1 py-0.5 rounded text-foreground font-medium hover:bg-surface-secondary/60 transition-colors"
						>
							{activeName}
						</button>
					</nav>
				)}
			</div>

			{/* Right: View toggles & actions */}
			{isTruncated && (
				<span className="text-[10px] text-warning shrink-0">
					文件过大已截断，只读
				</span>
			)}
			{!isTruncated && isCanvas && (
				<Tooltip>
					<Tooltip.Trigger>
						<button
							type="button"
							aria-label={
								canvasMode === "visual"
									? "切换到源码模式"
									: `切换到${visualLabel}`
							}
							onClick={onToggleCanvasMode}
							className="p-1.5 rounded-md text-muted hover:text-foreground hover:bg-surface-secondary/60 transition-colors shrink-0"
						>
							{canvasMode === "visual" ? (
								<Code2 className="w-3.5 h-3.5" />
							) : (
								<Waypoints className="w-3.5 h-3.5" />
							)}
						</button>
					</Tooltip.Trigger>
					<Tooltip.Content placement="bottom">
						{canvasMode === "visual" ? "源码模式" : visualLabel}
					</Tooltip.Content>
				</Tooltip>
			)}
			{!isTruncated && !isCanvas && (
				<>
					<Tooltip>
						<Tooltip.Trigger>
							<button
								type="button"
								aria-label={isSplitOpen ? "退出双栏比对" : "开启双栏比对"}
								onClick={onToggleSplitCompare}
								className={`p-1.5 rounded-md transition-colors shrink-0 ${
									isSplitOpen
										? "bg-accent/15 text-accent"
										: "text-muted hover:text-foreground hover:bg-surface-secondary/60"
								}`}
							>
								<Columns2 className="w-3.5 h-3.5" />
							</button>
						</Tooltip.Trigger>
						<Tooltip.Content placement="bottom">
							{isSplitOpen ? "退出双栏比对" : "开启双栏比对"}
						</Tooltip.Content>
					</Tooltip>
					<Tooltip>
						<Tooltip.Trigger>
							<button
								type="button"
								aria-label={
									viewMode === "editing" ? "切换到阅读视图" : "切换到编辑视图"
								}
								onClick={onToggleViewMode}
								className="p-1.5 rounded-md text-muted hover:text-foreground hover:bg-surface-secondary/60 transition-colors shrink-0"
							>
								{viewMode === "editing" ? (
									<BookOpen className="w-3.5 h-3.5" />
								) : (
									<PenLine className="w-3.5 h-3.5" />
								)}
							</button>
						</Tooltip.Trigger>
						<Tooltip.Content placement="bottom">
							{viewMode === "editing" ? "阅读视图" : "编辑视图"}
						</Tooltip.Content>
					</Tooltip>
				</>
			)}
			<Dropdown>
				<Dropdown.Trigger
					aria-label="更多操作"
					className="p-1.5 rounded-md text-muted hover:text-foreground hover:bg-surface-secondary/60 transition-colors cursor-pointer shrink-0 data-[pressed]:bg-surface-secondary/80"
				>
					<Ellipsis className="w-4 h-4" />
				</Dropdown.Trigger>
				<Dropdown.Popover
					placement="bottom end"
					className="min-w-[190px] p-1 shadow-lg border border-border/80 rounded-xl bg-surface"
				>
					<Dropdown.Menu aria-label="笔记更多操作">
						{onImportToStudio && (
							<Dropdown.Item
								id="import-to-studio"
								textValue="转到创作台二次创作"
								onAction={onImportToStudio}
							>
								<div className="flex items-center gap-2 py-0.5">
									{isImportingToStudio ? (
										<Loader2 className="w-3.5 h-3.5 text-accent animate-spin shrink-0" />
									) : (
										<PenTool className="w-3.5 h-3.5 text-accent shrink-0" />
									)}
									<div className="flex flex-col min-w-0">
										<span className="text-xs font-medium text-foreground">
											转到创作台
										</span>
										<span className="text-[10px] text-muted">
											一键导入并二次创作
										</span>
									</div>
								</div>
							</Dropdown.Item>
						)}
						<Dropdown.Item
							id="copy-path"
							textValue="复制相对路径"
							onAction={() => {
								void navigator.clipboard.writeText(activeRelPath);
								toast.success("已复制相对路径");
							}}
						>
							<div className="flex items-center gap-2 py-0.5">
								<Copy className="w-3.5 h-3.5 text-muted shrink-0" />
								<span className="text-xs">复制相对路径</span>
							</div>
						</Dropdown.Item>
						<Dropdown.Item
							id="reveal-in-finder"
							textValue={`在${getFileManagerName()}中显示`}
							onAction={async () => {
								const res = await revealVaultEntryRpc(activeRelPath);
								if (!res.success) {
									toast.danger(res.error || "定位文件失败");
								}
							}}
						>
							<div className="flex items-center gap-2 py-0.5">
								<FolderSearch className="w-3.5 h-3.5 text-muted shrink-0" />
								<span className="text-xs">在{getFileManagerName()}中显示</span>
							</div>
						</Dropdown.Item>
						{canDelete && (
							<Dropdown.Item
								id="delete-note"
								textValue="删除笔记"
								className="text-danger hover:!bg-danger/10 hover:!text-danger"
								onAction={onDelete}
							>
								<div className="flex items-center gap-2 py-0.5">
									<Trash2 className="w-3.5 h-3.5 text-danger shrink-0" />
									<span className="text-xs text-danger font-medium">
										删除笔记
									</span>
								</div>
							</Dropdown.Item>
						)}
					</Dropdown.Menu>
				</Dropdown.Popover>
			</Dropdown>
		</div>
	);
}
