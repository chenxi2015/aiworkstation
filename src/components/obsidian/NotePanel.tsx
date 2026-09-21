import type { EditorView } from "@codemirror/view";
import { Tooltip, toast } from "@heroui/react";
import dayjs from "dayjs";
import { AlertTriangle, Loader2, Pencil, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { generateAiBarTextRpc } from "../../services/api/editorClient";
import {
	deleteVaultEntryRpc,
	fetchVaultNote,
	renameVaultEntryRpc,
	saveVaultNoteRpc,
} from "../../services/api/obsidianClient";
import { ImagePreviewProvider } from "../workbench/ai/shared/ImagePreviewModal";
import { MarkdownAiBubbleMenu } from "./markdown/MarkdownAiBubbleMenu";
import { MarkdownEditor } from "./markdown/MarkdownEditor";
import type { ObsidianNoteApi, ObsidianNoteContent } from "./types";
import { tryReapplyChanges } from "./utils/merge";

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
}

/**
 * 笔记面板：所见即所得（Live Preview）Markdown 编辑 + 划词 AI，mtime 冲突检测。
 * 无编辑/预览切换：底层是纯 Markdown 文本，装饰层实时渲染样式。
 */
export function NotePanel({
	relPath,
	onMutated,
	onRenamed,
	onDeleted,
	onRegisterNoteApi,
	onNavigateNote,
	onCreateNote,
}: NotePanelProps) {
	const [note, setNote] = useState<ObsidianNoteContent | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [draft, setDraft] = useState("");
	const [saveState, setSaveState] = useState<NoteSaveState>("idle");
	const [savedAt, setSavedAt] = useState<number | null>(null);
	const [conflict, setConflict] = useState<{ mtime?: number } | null>(null);
	const [editorView, setEditorView] = useState<EditorView | null>(null);
	const loadSeqRef = useRef(0);
	const [editingTitle, setEditingTitle] = useState(false);
	const [titleDraft, setTitleDraft] = useState("");
	const titleInputRef = useRef<HTMLInputElement | null>(null);

	// 进入标题编辑态时聚焦并全选（Obsidian 式内联重命名）
	useEffect(() => {
		if (!editingTitle) return;
		titleInputRef.current?.focus();
		titleInputRef.current?.select();
	}, [editingTitle]);

	const load = useCallback(async (target: string) => {
		const seq = ++loadSeqRef.current;
		setLoading(true);
		setError(null);
		setConflict(null);
		const { note: data, error: err } = await fetchVaultNote(target);
		if (seq !== loadSeqRef.current) return;
		if (data) {
			setNote(data);
			setDraft(data.content);
		} else {
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
			const res = await renameVaultEntryRpc(note.relPath, trimmed, true);
			if (!res.success || !res.relPath) {
				toast.danger(res.error ?? "重命名失败");
				return;
			}
			toast.success("已重命名");
			onMutated();
			onRenamed(res.relPath);
		},
		[note, onMutated, onRenamed],
	);

	const handleDelete = useCallback(async () => {
		if (!note) return;
		if (!window.confirm(`确认删除笔记「${note.name}」？此操作不可恢复。`)) {
			return;
		}
		const res = await deleteVaultEntryRpc(note.relPath);
		if (!res.success) {
			toast.danger(res.error ?? "删除失败");
			return;
		}
		toast.success("已删除");
		onMutated();
		onDeleted();
	}, [note, onMutated, onDeleted]);

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

	if (loading) {
		return (
			<div className="h-full flex items-center justify-center text-muted">
				<Loader2 className="w-5 h-5 animate-spin" />
			</div>
		);
	}
	if (error || !note) {
		return (
			<div className="h-full flex flex-col items-center justify-center text-center px-8">
				<AlertTriangle className="w-6 h-6 text-danger mb-3" />
				<p className="text-xs text-muted">{error ?? "笔记不存在"}</p>
			</div>
		);
	}

	return (
		<div className="h-full flex flex-col overflow-hidden">
			<div className="flex items-center gap-2 px-4 py-2.5 border-b border-border shrink-0">
				<div className="min-w-0 flex-1">
					<div className="flex items-center gap-1">
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
								className="min-w-0 flex-1 px-1.5 py-0.5 rounded-md border border-accent/60 bg-surface text-sm font-semibold text-foreground focus:outline-none"
							/>
						) : (
							<>
								<h2 className="text-sm font-semibold text-foreground truncate">
									{note.name}
								</h2>
								<Tooltip>
									<Tooltip.Trigger>
										<button
											type="button"
											aria-label="重命名笔记"
											onClick={() => {
												setTitleDraft(note.name);
												setEditingTitle(true);
											}}
											className="p-1 rounded-md text-muted/70 hover:text-foreground hover:bg-surface-secondary/60 transition-colors shrink-0"
										>
											<Pencil className="w-3 h-3" />
										</button>
									</Tooltip.Trigger>
									<Tooltip.Content placement="bottom">重命名</Tooltip.Content>
								</Tooltip>
							</>
						)}
					</div>
					<p className="text-[10px] text-muted truncate font-mono">
						{note.relPath} · {new Date(note.mtime).toLocaleString()}
					</p>
				</div>
				{note.truncated && (
					<span className="text-[10px] text-warning shrink-0">
						文件过大已截断，只读
					</span>
				)}
				<Tooltip>
					<Tooltip.Trigger>
						<button
							type="button"
							aria-label="删除笔记"
							onClick={handleDelete}
							className="p-1.5 rounded-md text-danger/80 hover:text-danger hover:bg-danger/10 transition-colors shrink-0"
						>
							<Trash2 className="w-3.5 h-3.5" />
						</button>
					</Tooltip.Trigger>
					<Tooltip.Content placement="bottom">删除</Tooltip.Content>
				</Tooltip>
			</div>
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
			<div className="flex-1 overflow-hidden">
				<ImagePreviewProvider>
					<MarkdownEditor
						value={draft}
						onChange={handleDraftChange}
						onReady={setEditorView}
						readOnly={note.truncated}
						noteRelPath={note.relPath}
						onSaveShortcut={() => void flushSave()}
						onNavigateNote={onNavigateNote}
						onCreateNote={onCreateNote}
					/>
				</ImagePreviewProvider>
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
				) : note.truncated ? (
					<span>只读</span>
				) : (
					<span className="text-muted/50">自动保存</span>
				)}
			</div>
			<MarkdownAiBubbleMenu
				view={note.truncated ? null : editorView}
				onGenerate={(prompt) => generateAiBarTextRpc(prompt)}
			/>
		</div>
	);
}
