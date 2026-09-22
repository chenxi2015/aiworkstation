import type { EditorView } from "@codemirror/view";
import { Tooltip, toast } from "@heroui/react";
import dayjs from "dayjs";
import {
	AlertTriangle,
	BookOpen,
	ChevronLeft,
	ChevronRight,
	Code2,
	ExternalLink,
	FileQuestion,
	Loader2,
	PenLine,
	Trash2,
	Waypoints,
} from "lucide-react";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { generateAiBarTextRpc } from "../../services/api/editorClient";
import {
	createVaultNoteRpc,
	deleteVaultEntryRpc,
	fetchVaultNote,
	getCachedVaultNote,
	openVaultEntryRpc,
	renameVaultEntryRpc,
	saveVaultNoteRpc,
} from "../../services/api/obsidianClient";
import { ImagePreviewProvider } from "../workbench/ai/shared/ImagePreviewModal";
import { ObsidianNoteBodySkeleton } from "../workbench/skeletons";
import { CanvasView } from "./canvas/CanvasView";
import {
	DeleteEntryDialog,
	shouldSkipDeleteConfirm,
} from "./DeleteEntryDialog";
import { MarkdownAiBubbleMenu } from "./markdown/MarkdownAiBubbleMenu";
import { MarkdownEditor } from "./markdown/MarkdownEditor";
import { clearWikilinkCaches } from "./markdown/wikilink";
import { JsonEditor } from "./panels/JsonEditor";
import { MediaPanel } from "./panels/MediaPanel";
import type { ObsidianNoteApi, ObsidianNoteContent } from "./types";
import { tryReapplyChanges } from "./utils/merge";
import { getVaultFileCategory } from "./utils/vaultFileUtils";

/** 自动保存防抖间隔（与创作模块 AUTOSAVE_DELAY 一致） */
const AUTOSAVE_DELAY = 800;
/** 自动保存成功后刷新目录树的节流间隔（避免每次保存都重扫 Vault） */
const TREE_SYNC_THROTTLE = 10000;

type NoteSaveState = "idle" | "dirty" | "saving" | "saved" | "error";

export interface NotePanelProps {
	relPath: string;
	onMutated: () => void;
	onRenamed: (newRelPath: string) => void;
	onDeleted: () => void;
	/** 向页面层注册当前笔记操作句柄（供 AI 侧边栏桥接调用） */
	onRegisterNoteApi?: (api: ObsidianNoteApi | null) => void;
	/** 笔记内链接（Dataview 结果等）跳转到其他笔记 */
	onNavigateNote?: (relPath: string) => void;
	/** 双链目标不存在时的新建回调（name 不含 .md 后缀） */
	onCreateNote?: (name: string) => void;
	/** 导航历史（Obsidian 同款返回/前进） */
	canGoBack?: boolean;
	canGoForward?: boolean;
	onBack?: () => void;
	onForward?: () => void;
	/** 面包屑点击文件夹：左侧树选中并展开该目录 */
	onSelectFolder?: (dir: string) => void;
}

/**
 * 面板分派器：按扩展名路由到 Markdown 编辑、Canvas 可视化或媒体查看器。
 */
export function NotePanel({
	relPath,
	onMutated,
	onDeleted,
	canGoBack,
	canGoForward,
	onBack,
	onForward,
	onSelectFolder,
	...rest
}: NotePanelProps) {
	const category = getVaultFileCategory(relPath);
	if (
		category === "image" ||
		category === "video" ||
		category === "audio" ||
		category === "pdf"
	) {
		return (
			<MediaPanel
				relPath={relPath}
				category={category}
				onMutated={onMutated}
				onDeleted={onDeleted}
				canGoBack={canGoBack}
				canGoForward={canGoForward}
				onBack={onBack}
				onForward={onForward}
				onSelectFolder={onSelectFolder}
			/>
		);
	}
	if (category !== "markdown" && category !== "canvas") {
		return (
			<UnsupportedFilePanel
				relPath={relPath}
				canGoBack={canGoBack}
				canGoForward={canGoForward}
				onBack={onBack}
				onForward={onForward}
			/>
		);
	}
	return (
		<TextNotePanel
			relPath={relPath}
			onMutated={onMutated}
			onDeleted={onDeleted}
			canGoBack={canGoBack}
			canGoForward={canGoForward}
			onBack={onBack}
			onForward={onForward}
			onSelectFolder={onSelectFolder}
			{...rest}
		/>
	);
}

/** 无法在应用内展示的文件类型：提示走系统默认应用 */
function UnsupportedFilePanel({
	relPath,
	canGoBack,
	canGoForward,
	onBack,
	onForward,
}: Pick<
	NotePanelProps,
	"relPath" | "canGoBack" | "canGoForward" | "onBack" | "onForward"
>) {
	const fileName = relPath.split("/").pop() ?? relPath;
	return (
		<div className="h-full flex flex-col overflow-hidden">
			<div className="flex items-center gap-1 px-2 py-1.5 border-b border-border shrink-0">
				<button
					type="button"
					aria-label="返回"
					onClick={onBack}
					disabled={!canGoBack}
					className="p-1.5 rounded-md text-muted hover:text-foreground hover:bg-surface-secondary/60 transition-colors disabled:opacity-30 disabled:pointer-events-none"
				>
					<ChevronLeft className="w-4 h-4" />
				</button>
				<button
					type="button"
					aria-label="前进"
					onClick={onForward}
					disabled={!canGoForward}
					className="p-1.5 rounded-md text-muted hover:text-foreground hover:bg-surface-secondary/60 transition-colors disabled:opacity-30 disabled:pointer-events-none"
				>
					<ChevronRight className="w-4 h-4" />
				</button>
			</div>
			<div className="flex-1 flex flex-col items-center justify-center text-center px-8">
				<FileQuestion className="w-8 h-8 text-muted mb-3" />
				<p className="text-sm text-foreground/80">{fileName}</p>
				<p className="mt-1 text-xs text-muted">暂不支持在应用内预览该类型</p>
				<button
					type="button"
					onClick={() => void openVaultEntryRpc(relPath)}
					className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs text-foreground/80 hover:bg-surface-secondary/60 transition-colors"
				>
					<ExternalLink className="w-3.5 h-3.5" />
					在系统应用中打开
				</button>
			</div>
		</div>
	);
}

/**
 * 笔记面板：所见即所得（Live Preview）Markdown 编辑 + 划词 AI，mtime 冲突检测。
 * Canvas 文件复用同一读取/保存/冲突管线，正文区在可视化视图与 JSON 源码间切换。
 * 顶栏 Obsidian 同款：左侧返回/前进，中间面包屑路径，右侧视图切换。
 */
function TextNotePanel({
	relPath,
	onMutated,
	onRenamed,
	onDeleted,
	onRegisterNoteApi,
	onNavigateNote,
	onCreateNote,
	canGoBack,
	canGoForward,
	onBack,
	onForward,
	onSelectFolder,
}: NotePanelProps) {
	const initialCached = getCachedVaultNote(relPath);
	const isCanvas = relPath.toLowerCase().endsWith(".canvas");
	const [note, setNote] = useState<ObsidianNoteContent | null>(initialCached);
	const [loading, setLoading] = useState(!initialCached);
	const [error, setError] = useState<string | null>(null);
	const [draft, setDraft] = useState(initialCached?.content ?? "");
	const [saveState, setSaveState] = useState<NoteSaveState>("idle");
	const [savedAt, setSavedAt] = useState<number | null>(null);
	const [conflict, setConflict] = useState<{ mtime?: number } | null>(null);
	const [editorView, setEditorView] = useState<EditorView | null>(null);
	const loadSeqRef = useRef(0);
	const [editingTitle, setEditingTitle] = useState(false);
	const [titleDraft, setTitleDraft] = useState("");
	const titleInputRef = useRef<HTMLInputElement | null>(null);
	const [deleteOpen, setDeleteOpen] = useState(false);
	// 阅读/编辑视图切换（Obsidian 同款），全局记住上次选择
	const [viewMode, setViewMode] = useState<"editing" | "reading">(() =>
		typeof window !== "undefined" &&
		window.localStorage.getItem("obsidian_note_view_mode") === "reading"
			? "reading"
			: "editing",
	);
	const toggleViewMode = useCallback(() => {
		setViewMode((prev) => {
			const next = prev === "editing" ? "reading" : "editing";
			try {
				window.localStorage.setItem("obsidian_note_view_mode", next);
			} catch {}
			return next;
		});
	}, []);
	// Canvas：可视化视图 / JSON 源码切换，全局记住上次选择
	const [canvasMode, setCanvasMode] = useState<"visual" | "source">(() =>
		typeof window !== "undefined" &&
		window.localStorage.getItem("obsidian_canvas_view_mode") === "source"
			? "source"
			: "visual",
	);
	const toggleCanvasMode = useCallback(() => {
		setCanvasMode((prev) => {
			const next = prev === "visual" ? "source" : "visual";
			try {
				window.localStorage.setItem("obsidian_canvas_view_mode", next);
			} catch {}
			return next;
		});
	}, []);

	// 进入标题编辑态时聚焦并全选（Obsidian 式内联重命名）
	useEffect(() => {
		if (!editingTitle) return;
		titleInputRef.current?.focus();
		titleInputRef.current?.select();
	}, [editingTitle]);

	const load = useCallback(async (target: string) => {
		const seq = ++loadSeqRef.current;
		const cached = getCachedVaultNote(target);
		if (cached) {
			setNote(cached);
			setDraft(cached.content);
			setLoading(false);
			setError(null);
			setConflict(null);
		} else {
			setLoading(true);
			setError(null);
			setConflict(null);
		}
		const { note: data, error: err } = await fetchVaultNote(target);
		if (seq !== loadSeqRef.current) return;
		if (data) {
			setNote(data);
			setDraft((prev) =>
				!cached || prev === cached.content ? data.content : prev,
			);
			setError(null);
		} else if (!cached) {
			setNote(null);
			setError(err ?? "读取笔记失败");
		}
		setSaveState("idle");
		setSavedAt(null);
		setLoading(false);
	}, []);

	// 供保存逻辑读取的最新引用（规避闭包过期）
	const noteRef = useRef(note);
	noteRef.current = note;
	const draftRef = useRef(draft);
	draftRef.current = draft;
	const conflictRef = useRef(conflict);
	conflictRef.current = conflict;
	const onMutatedRef = useRef(onMutated);
	onMutatedRef.current = onMutated;
	const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const inFlightRef = useRef<string | null>(null);
	const lastTreeSyncRef = useRef(0);

	/**
	 * 自动保存（git 式同步语义）：
	 * - mtime 一致 → 直接写；
	 * - mtime 不一致 → 服务端拉取磁盘最新内容做三方合并，干净合并回传 merged 落回编辑器；
	 * - 合并失败 → 暂停自动保存并弹冲突条，绝不静默覆盖任何一侧的修改。
	 */
	const flushSave = useCallback(async (force = false) => {
		const base = noteRef.current;
		if (!base || base.truncated) return;
		if (saveTimerRef.current) {
			clearTimeout(saveTimerRef.current);
			saveTimerRef.current = null;
		}
		if (conflictRef.current && !force) return; // 冲突期间自动保存保持暂停
		if (inFlightRef.current) return; // 已有保存飞行中，改动留待下一轮
		const content = draftRef.current;
		if (!force && content === base.content) return;
		const targetPath = base.relPath;
		inFlightRef.current = targetPath;
		setSaveState("saving");
		const res = await saveVaultNoteRpc(targetPath, content, {
			baseMtime: base.mtime,
			baseContent: base.content,
			force,
		});
		inFlightRef.current = null;
		// 飞行期间已切换笔记 → 丢弃结果，不触碰新笔记状态
		if (noteRef.current?.relPath !== targetPath) return;
		if (res.success) {
			const synced = res.merged ?? content;
			if (res.merged !== undefined && res.merged !== content) {
				// 服务端合入了 Obsidian 侧的修改：把保存期间的本地继续编辑重放到合并结果上
				const rebased = tryReapplyChanges(
					res.merged,
					content,
					draftRef.current,
				);
				if (rebased === null) {
					// 无法安全落回编辑器（磁盘已是合并结果，数据不丢）→ 人工处理
					setConflict({ mtime: res.mtime });
					setSaveState("error");
					toast.danger(
						"外部修改已合并到磁盘，但与你的最新输入交叠，请手动处理",
					);
					return;
				}
				if (rebased !== draftRef.current) setDraft(rebased);
				toast.info("已自动合并 Obsidian 侧的修改");
			}
			setNote({ ...base, content: synced, mtime: res.mtime ?? base.mtime });
			setConflict(null);
			setSaveState("saved");
			setSavedAt(Date.now());
			clearWikilinkCaches(targetPath);
			const now = Date.now();
			if (now - lastTreeSyncRef.current > TREE_SYNC_THROTTLE) {
				lastTreeSyncRef.current = now;
				onMutatedRef.current();
			}
			return;
		}
		if (res.conflict) {
			setConflict({ mtime: res.mtime });
			setSaveState("error");
			toast.danger("笔记已在 Obsidian 侧被修改且无法自动合并，自动保存已暂停");
			return;
		}
		setSaveState("error");
		toast.danger(res.error ?? "保存失败");
	}, []);

	const flushSaveRef = useRef(flushSave);
	flushSaveRef.current = flushSave;

	const scheduleSave = useCallback(() => {
		if (conflictRef.current) return;
		setSaveState("dirty");
		if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
		saveTimerRef.current = setTimeout(
			() => void flushSaveRef.current(),
			AUTOSAVE_DELAY,
		);
	}, []);

	// 编辑变更统一入口（用户输入与 AI/合并的程序化写入都经 CodeMirror 回流到这里）
	const handleDraftChange = useCallback(
		(value: string) => {
			setDraft(value);
			if (value !== noteRef.current?.content) scheduleSave();
		},
		[scheduleSave],
	);

	// Canvas 连线/搜索添加"新建笔记"：在当前 canvas 所在目录新建笔记，返回 relPath（不跳转）
	const handleCanvasCreateNote = useCallback(
		async (customName?: string): Promise<string | null> => {
			const current = noteRef.current;
			if (!current) return null;
			const dir = current.relPath.includes("/")
				? current.relPath.split("/").slice(0, -1).join("/")
				: "";

			const trimmed = customName?.trim();
			if (trimmed) {
				const res = await createVaultNoteRpc(dir, trimmed);
				if (res.success && res.relPath) {
					toast.success(`已新建笔记「${trimmed}」`);
					onMutatedRef.current();
					return res.relPath;
				}
				if (res.error) {
					toast.danger(res.error);
					return null;
				}
			}

			for (let i = 0; i < 1000; i++) {
				const name = i === 0 ? "未命名文件" : `未命名文件 ${i}`;
				const res = await createVaultNoteRpc(dir, name);
				if (res.success && res.relPath) {
					toast.success(`已新建笔记「${name}」`);
					onMutatedRef.current();
					return res.relPath;
				}
				if (res.error && !res.error.includes("已存在")) {
					toast.danger(res.error);
					return null;
				}
			}
			toast.danger("新建笔记失败");
			return null;
		},
		[],
	);

	useEffect(() => {
		// 切换笔记前把当前未保存改动后台落盘（flushSave 内部按 relPath 防串扰）
		void flushSaveRef.current();
		load(relPath);
	}, [relPath, load]);

	// 组件卸载时兜底落盘
	useEffect(() => {
		return () => {
			void flushSaveRef.current();
		};
	}, []);

	const handleRename = useCallback(
		async (newName: string) => {
			if (!note) return;
			const trimmed = newName.trim();
			if (!trimmed || trimmed === note.name) return;
			// canvas 保留原扩展名，不走 .md 自动补后缀
			const res = await renameVaultEntryRpc(note.relPath, trimmed, !isCanvas);
			if (!res.success || !res.relPath) {
				toast.danger(res.error ?? "重命名失败");
				return;
			}
			toast.success("已重命名");
			onMutated();
			onRenamed(res.relPath);
		},
		[note, isCanvas, onMutated, onRenamed],
	);

	const performDelete = useCallback(async () => {
		if (!note) return;
		const res = await deleteVaultEntryRpc(note.relPath);
		if (!res.success) {
			toast.danger(res.error ?? "删除失败");
			return;
		}
		toast.success("已移动到系统回收站");
		onMutated();
		onDeleted();
	}, [note, onMutated, onDeleted]);

	/** 删除入口：勾选过「不再询问」则直接执行，否则弹确认框 */
	const handleDelete = useCallback(() => {
		if (!note) return;
		if (shouldSkipDeleteConfirm()) {
			void performDelete();
			return;
		}
		setDeleteOpen(true);
	}, [note, performDelete]);

	// 供 AI 侧边栏桥接调用的笔记操作句柄（写入 draft 后经 CodeMirror 回流触发自动保存）
	useEffect(() => {
		if (!onRegisterNoteApi) return;
		onRegisterNoteApi({
			getTitle: () => noteRef.current?.name ?? null,
			hasNote: () => noteRef.current !== null,
			getContent: () => draftRef.current,
			flushSave: async () => {
				await flushSaveRef.current();
			},
			appendMarkdown: (md) => {
				if (!noteRef.current) return false;
				const current = draftRef.current;
				const next = current.trim()
					? `${current.replace(/\s+$/, "")}\n\n${md}\n`
					: `${md}\n`;
				setDraft(next);
				return true;
			},
			replaceMarkdown: (md) => {
				if (!noteRef.current) return false;
				setDraft(md);
				return true;
			},
		});
		return () => onRegisterNoteApi(null);
	}, [onRegisterNoteApi]);

	if (error && !note && !loading) {
		return (
			<div className="h-full flex flex-col items-center justify-center text-center px-8">
				<AlertTriangle className="w-6 h-6 text-danger mb-3" />
				<p className="text-xs text-muted">{error}</p>
			</div>
		);
	}

	const activeRelPath = note?.relPath ?? relPath;
	const activeName =
		note?.name ?? relPath.split("/").pop()?.replace(/\.md$/i, "") ?? "";

	return (
		<div className="h-full flex flex-col overflow-hidden">
			<div className="flex items-center gap-1 px-2 py-1.5 border-b border-border shrink-0">
				{/* 左：返回 / 前进（Obsidian 同款导航历史） */}
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
				</div>
				{/* 中：面包屑路径（文件夹可点击定位，笔记名点击进入重命名） */}
				<div className="flex-1 min-w-0 flex justify-center px-2">
					{editingTitle ? (
						<input
							ref={titleInputRef}
							type="text"
							value={titleDraft}
							onChange={(e) => setTitleDraft(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter") {
									setEditingTitle(false);
									void handleRename(titleDraft);
								}
								if (e.key === "Escape") setEditingTitle(false);
							}}
							onBlur={() => {
								setEditingTitle(false);
								void handleRename(titleDraft);
							}}
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
									if (!note) return;
									setTitleDraft(activeName);
									setEditingTitle(true);
								}}
								className="min-w-0 truncate px-1 py-0.5 rounded text-foreground font-medium hover:bg-surface-secondary/60 transition-colors"
							>
								{activeName}
							</button>
						</nav>
					)}
				</div>
				{/* 右：视图切换（Markdown 阅读/编辑，Canvas 可视化/源码）+ 删除 */}
				{note?.truncated && (
					<span className="text-[10px] text-warning shrink-0">
						文件过大已截断，只读
					</span>
				)}
				{!note?.truncated && isCanvas && (
					<Tooltip>
						<Tooltip.Trigger>
							<button
								type="button"
								aria-label={
									canvasMode === "visual" ? "切换到源码模式" : "切换到画布视图"
								}
								onClick={toggleCanvasMode}
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
				{!note?.truncated && !isCanvas && (
					<Tooltip>
						<Tooltip.Trigger>
							<button
								type="button"
								aria-label={
									viewMode === "editing" ? "切换到阅读视图" : "切换到编辑视图"
								}
								onClick={toggleViewMode}
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
				)}
				<Tooltip>
					<Tooltip.Trigger>
						<button
							type="button"
							aria-label="删除笔记"
							onClick={handleDelete}
							disabled={!note}
							className="p-1.5 rounded-md text-danger/80 hover:text-danger hover:bg-danger/10 transition-colors shrink-0 disabled:opacity-30 disabled:pointer-events-none"
						>
							<Trash2 className="w-3.5 h-3.5" />
						</button>
					</Tooltip.Trigger>
					<Tooltip.Content placement="bottom">删除</Tooltip.Content>
				</Tooltip>
			</div>
			{/* 微型加载进度条（静默加载，不破坏编辑器 DOM 与选区） */}
			{loading && (
				<div className="h-0.5 w-full bg-accent/20 overflow-hidden shrink-0">
					<div className="h-full bg-accent animate-pulse w-full" />
				</div>
			)}
			{conflict && (
				<div className="flex items-center gap-3 px-4 py-2.5 bg-warning/10 border-b border-warning/30 shrink-0">
					<AlertTriangle className="w-4 h-4 text-warning shrink-0" />
					<p className="text-[11px] text-foreground/80 flex-1">
						笔记在 Obsidian
						侧的修改与本地编辑交叠，无法自动合并：重新加载会放弃当前编辑，强制覆盖会用当前编辑覆盖对方改动。
					</p>
					<button
						type="button"
						onClick={() => load(relPath)}
						className="px-2.5 py-1 rounded-lg border border-border text-[11px] text-foreground/80 hover:bg-surface-secondary/60 shrink-0"
					>
						重新加载
					</button>
					<button
						type="button"
						onClick={() => void flushSave(true)}
						disabled={saveState === "saving"}
						className="px-2.5 py-1 rounded-lg bg-warning text-white text-[11px] font-medium hover:opacity-90 disabled:opacity-40 shrink-0"
					>
						强制覆盖
					</button>
				</div>
			)}
			<div className="flex-1 overflow-hidden relative">
				{note ? (
					isCanvas ? (
						canvasMode === "visual" ? (
							<CanvasView
								key={note.relPath}
								content={draft}
								onChange={handleDraftChange}
								onNavigateNote={onNavigateNote}
								readOnly={Boolean(note.truncated)}
								onCreateNoteFile={handleCanvasCreateNote}
							/>
						) : (
							<JsonEditor
								key={note.relPath}
								value={draft}
								onChange={handleDraftChange}
								readOnly={Boolean(note.truncated)}
								onSaveShortcut={() => void flushSave()}
							/>
						)
					) : (
						<ImagePreviewProvider>
							<MarkdownEditor
								key={viewMode}
								value={draft}
								onChange={handleDraftChange}
								onReady={setEditorView}
								readOnly={Boolean(note.truncated)}
								reading={viewMode === "reading"}
								noteRelPath={note.relPath}
								onSaveShortcut={() => void flushSave()}
								onNavigateNote={onNavigateNote}
								onCreateNote={onCreateNote}
							/>
						</ImagePreviewProvider>
					)
				) : (
					<ObsidianNoteBodySkeleton />
				)}
			</div>
			{/* 底部状态栏：与创作模块一致，为后续快照/导出/分发等动作预留位置 */}
			<div className="shrink-0 border-t border-border bg-surface px-4 py-1.5 flex items-center gap-2 text-[11px] text-muted">
				<span>{draft.length} 字</span>
				<span className="flex-1" />
				{conflict ? (
					<span className="text-warning">检测到外部修改，自动保存已暂停</span>
				) : saveState === "dirty" ? (
					<span>未保存更改…</span>
				) : saveState === "saving" ? (
					<span className="flex items-center gap-1">
						<Loader2 className="w-3 h-3 animate-spin" />
						保存中…
					</span>
				) : saveState === "saved" ? (
					<span>
						已自动保存 {savedAt ? dayjs(savedAt).format("HH:mm:ss") : ""}
					</span>
				) : saveState === "error" ? (
					<button
						type="button"
						onClick={() => void flushSave()}
						className="text-danger hover:underline cursor-pointer"
					>
						保存失败，点击重试
					</button>
				) : note?.truncated ? (
					<span>只读</span>
				) : (
					<span className="text-muted/50">自动保存</span>
				)}
			</div>
			<MarkdownAiBubbleMenu
				view={
					isCanvas || note?.truncated || viewMode === "reading"
						? null
						: editorView
				}
				onGenerate={(prompt) => generateAiBarTextRpc(prompt)}
			/>
			<DeleteEntryDialog
				target={
					deleteOpen && note
						? isCanvas
							? { name: note.name, kind: "file" }
							: { name: `${note.name}.md`, kind: "note" }
						: null
				}
				onClose={() => setDeleteOpen(false)}
				onConfirm={performDelete}
			/>
		</div>
	);
}
