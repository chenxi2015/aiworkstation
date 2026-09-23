import { Tooltip } from "@heroui/react";
import {
	BookOpen,
	ChevronLeft,
	ChevronRight,
	Code2,
	Columns2,
	PenLine,
	Redo2,
	Trash2,
	Undo2,
	Waypoints,
} from "lucide-react";
import { Fragment, useEffect, useRef, useState } from "react";

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
	canvasMode: "visual" | "source";
	onToggleCanvasMode: () => void;
	isSplitOpen: boolean;
	onToggleSplitCompare: () => void;
	viewMode: "editing" | "reading";
	onToggleViewMode: () => void;
	canDelete: boolean;
	onDelete: () => void;
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
	canvasMode,
	onToggleCanvasMode,
	isSplitOpen,
	onToggleSplitCompare,
	viewMode,
	onToggleViewMode,
	canDelete,
	onDelete,
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
								setTitleDraft(activeName.replace(/\.(md|canvas)$/i, ""));
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
								canvasMode === "visual" ? "切换到源码模式" : "切换到画布视图"
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
						{canvasMode === "visual" ? "源码模式" : "画布视图"}
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
			<Tooltip>
				<Tooltip.Trigger>
					<button
						type="button"
						aria-label="删除笔记"
						onClick={onDelete}
						disabled={!canDelete}
						className="p-1.5 rounded-md text-danger/80 hover:text-danger hover:bg-danger/10 transition-colors shrink-0 disabled:opacity-30 disabled:pointer-events-none"
					>
						<Trash2 className="w-3.5 h-3.5" />
					</button>
				</Tooltip.Trigger>
				<Tooltip.Content placement="bottom">删除</Tooltip.Content>
			</Tooltip>
		</div>
	);
}
