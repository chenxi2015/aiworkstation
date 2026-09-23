import { redo, undo } from "@codemirror/commands";
import type { EditorView } from "@codemirror/view";
import { toast } from "@heroui/react";
import { AlertTriangle } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { generateAiBarTextRpc } from "../../../../services/api/editorClient";
import {
	createVaultNoteRpc,
	deleteVaultEntryRpc,
	renameVaultEntryRpc,
	saveVaultNoteRpc,
} from "../../../../services/api/obsidianClient";
import { ImagePreviewProvider } from "../../../workbench/ai/shared/ImagePreviewModal";
import { ObsidianNoteBodySkeleton } from "../../../workbench/skeletons";
import { CanvasView } from "../../canvas/CanvasView";
import {
	DeleteEntryDialog,
	shouldSkipDeleteConfirm,
} from "../../DeleteEntryDialog";
import { MarkdownAiBubbleMenu } from "../../markdown/MarkdownAiBubbleMenu";
import { MarkdownEditor } from "../../markdown/MarkdownEditor";
import { SplitNoteCompareView } from "../../markdown/SplitNoteCompareView";
import type { NotePanelProps } from "../../NotePanel";
import { JsonEditor } from "../JsonEditor";
import { NoteConflictBanner } from "./NoteConflictBanner";
import { NoteStatusBar } from "./NoteStatusBar";
import { NoteToolbar } from "./NoteToolbar";
import { useNoteSync } from "./useNoteSync";

/**
 * Text and Canvas note editor panel: Live Preview Markdown editing, Canvas node flow,
 * Split note AI rewrite comparison, inline rename, and conflict resolution.
 */
export function TextNotePanel({
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
	const isCanvas = relPath.toLowerCase().endsWith(".canvas");
	const [editorView, setEditorView] = useState<EditorView | null>(null);
	const [deleteOpen, setDeleteOpen] = useState(false);
	const [canUndo, setCanUndo] = useState(false);
	const [canRedo, setCanRedo] = useState(false);

	const handleHistoryChange = useCallback(
		(nextCanUndo: boolean, nextCanRedo: boolean) => {
			setCanUndo(nextCanUndo);
			setCanRedo(nextCanRedo);
		},
		[],
	);

	// Persist view mode across sessions (Obsidian-styled)
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

	// Canvas visual vs source JSON toggle
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

	// Split compare & AI rewrite pipeline state (Markdown only)
	const [splitSession, setSplitSession] = useState<{
		isOpen: boolean;
		instruction?: string;
		modeLabel?: string;
	} | null>(null);

	const toggleSplitCompare = useCallback(() => {
		if (isCanvas) return;
		setSplitSession((prev) => (prev?.isOpen ? null : { isOpen: true }));
	}, [isCanvas]);

	const startRewritePipeline = useCallback(
		async (instruction?: string, modeLabel?: string) => {
			if (isCanvas) return;
			setSplitSession({
				isOpen: true,
				instruction,
				modeLabel,
			});
		},
		[isCanvas],
	);

	const handleUndoRef = useRef<() => boolean>(() => false);
	const handleRedoRef = useRef<() => boolean>(() => false);
	const canUndoRef = useRef<() => boolean>(() => false);
	const canRedoRef = useRef<() => boolean>(() => false);

	const {
		note,
		draft,
		loading,
		error,
		saveState,
		savedAt,
		conflict,
		handleDraftChange,
		flushSave,
		load,
	} = useNoteSync({
		relPath,
		onMutated,
		onRegisterNoteApi,
		onStartRewritePipeline: startRewritePipeline,
		toggleSplitCompare,
		onUndo: () => handleUndoRef.current(),
		onRedo: () => handleRedoRef.current(),
		canUndo: () => canUndoRef.current(),
		canRedo: () => canRedoRef.current(),
	});

	const isEditableDoc = !isCanvas || canvasMode === "source";
	const effectiveCanUndo = canUndo && !note?.truncated && isEditableDoc;
	const effectiveCanRedo = canRedo && !note?.truncated && isEditableDoc;

	const handleUndo = useCallback(() => {
		if (!editorView || Boolean(note?.truncated)) return false;
		const res = undo(editorView);
		if (viewMode === "editing") {
			editorView.focus();
		}
		return res;
	}, [editorView, viewMode, note?.truncated]);

	const handleRedo = useCallback(() => {
		if (!editorView || Boolean(note?.truncated)) return false;
		const res = redo(editorView);
		if (viewMode === "editing") {
			editorView.focus();
		}
		return res;
	}, [editorView, viewMode, note?.truncated]);

	handleUndoRef.current = handleUndo;
	handleRedoRef.current = handleRedo;
	canUndoRef.current = () => effectiveCanUndo;
	canRedoRef.current = () => effectiveCanRedo;

	// Keyboard shortcuts for Undo/Redo in reading mode or when editorView lacks direct focus
	useEffect(() => {
		if (isCanvas) return;
		const handleKeyDown = (e: KeyboardEvent) => {
			const isMod = e.metaKey || e.ctrlKey;
			if (!isMod) return;

			// Skip if focus is in an input or textarea (e.g. rename, search, or dialog)
			const target = e.target as HTMLElement | null;
			if (
				target instanceof HTMLInputElement ||
				target instanceof HTMLTextAreaElement ||
				target?.isContentEditable
			) {
				return;
			}

			const key = e.key.toLowerCase();
			if (key === "z") {
				if (!e.shiftKey) {
					if (effectiveCanUndo) {
						e.preventDefault();
						e.stopPropagation();
						handleUndo();
					}
				} else {
					if (effectiveCanRedo) {
						e.preventDefault();
						e.stopPropagation();
						handleRedo();
					}
				}
			} else if (key === "y" && !e.shiftKey) {
				if (effectiveCanRedo) {
					e.preventDefault();
					e.stopPropagation();
					handleRedo();
				}
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [isCanvas, effectiveCanUndo, effectiveCanRedo, handleUndo, handleRedo]);

	const handleAcceptSplit = useCallback(
		(newContent: string) => {
			handleDraftChange(newContent);
			setSplitSession(null);
			toast.success("已采纳 AI 改写并同步保存到 Vault");
		},
		[handleDraftChange],
	);

	const handleSaveAsNewNote = useCallback(
		async (newContent: string) => {
			if (!note) return;
			const dir = note.relPath.includes("/")
				? note.relPath.split("/").slice(0, -1).join("/")
				: "";
			const baseName = note.name.replace(/\.md$/i, "");
			const newName = `${baseName} · 改写版`;

			const res = await createVaultNoteRpc(dir, newName);
			if (res.success && res.relPath) {
				await saveVaultNoteRpc(res.relPath, newContent);
				toast.success(`已另存为新笔记「${newName}」`);
				setSplitSession(null);
				onMutated();
				onNavigateNote?.(res.relPath);
			} else {
				toast.danger(res.error ?? "另存为新笔记失败");
			}
		},
		[note, onMutated, onNavigateNote],
	);

	// Canvas helper: create a new note in current canvas folder and return relPath without jumping
	const handleCanvasCreateNote = useCallback(
		async (customName?: string): Promise<string | null> => {
			if (!note) return null;
			const dir = note.relPath.includes("/")
				? note.relPath.split("/").slice(0, -1).join("/")
				: "";

			const trimmed = customName?.trim();
			if (trimmed) {
				const res = await createVaultNoteRpc(dir, trimmed);
				if (res.success && res.relPath) {
					toast.success(`已新建笔记「${trimmed}」`);
					onMutated();
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
					onMutated();
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
		[note, onMutated],
	);

	const handleRename = useCallback(
		async (newName: string) => {
			if (!note) return;
			const trimmed = newName.trim();
			if (!trimmed || trimmed === note.name) return;
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

	const handleDelete = useCallback(() => {
		if (!note) return;
		if (shouldSkipDeleteConfirm()) {
			void performDelete();
			return;
		}
		setDeleteOpen(true);
	}, [note, performDelete]);

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
	const isSplitOpen = Boolean(splitSession?.isOpen);

	return (
		<div className="h-full flex flex-col overflow-hidden">
			{/* Hide top toolbar during split compare to avoid duplicated back controls */}
			{!isSplitOpen && (
				<NoteToolbar
					canGoBack={canGoBack}
					canGoForward={canGoForward}
					onBack={onBack}
					onForward={onForward}
					canUndo={effectiveCanUndo}
					canRedo={effectiveCanRedo}
					onUndo={() => void handleUndo()}
					onRedo={() => void handleRedo()}
					activeRelPath={activeRelPath}
					activeName={activeName}
					onSelectFolder={onSelectFolder}
					onRename={handleRename}
					isTruncated={Boolean(note?.truncated)}
					isCanvas={isCanvas}
					canvasMode={canvasMode}
					onToggleCanvasMode={toggleCanvasMode}
					isSplitOpen={isSplitOpen}
					onToggleSplitCompare={toggleSplitCompare}
					viewMode={viewMode}
					onToggleViewMode={toggleViewMode}
					canDelete={Boolean(note)}
					onDelete={handleDelete}
				/>
			)}

			{/* Micro loading progress bar */}
			{loading && (
				<div className="h-0.5 w-full bg-accent/20 overflow-hidden shrink-0">
					<div className="h-full bg-accent animate-pulse w-full" />
				</div>
			)}

			{conflict && (
				<NoteConflictBanner
					isSaving={saveState === "saving"}
					onReload={() => load(relPath)}
					onForceOverwrite={() => void flushSave(true)}
				/>
			)}

			<div className="flex-1 min-h-0 overflow-hidden relative">
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
								onReady={setEditorView}
								onHistoryChange={handleHistoryChange}
								readOnly={Boolean(note.truncated)}
								onSaveShortcut={() => void flushSave()}
							/>
						)
					) : splitSession?.isOpen ? (
						<SplitNoteCompareView
							key={note.relPath}
							originalContent={draft}
							docTitle={activeName}
							instruction={splitSession.instruction}
							modeLabel={splitSession.modeLabel}
							onAccept={handleAcceptSplit}
							onCancel={() => setSplitSession(null)}
							onSaveAsNewNote={handleSaveAsNewNote}
						/>
					) : (
						<ImagePreviewProvider>
							<MarkdownEditor
								value={draft}
								onChange={handleDraftChange}
								onReady={setEditorView}
								onHistoryChange={handleHistoryChange}
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

			<NoteStatusBar
				charCount={draft.length}
				hasConflict={Boolean(conflict)}
				saveState={saveState}
				savedAt={savedAt}
				isTruncated={Boolean(note?.truncated)}
				onRetrySave={() => void flushSave()}
			/>

			<MarkdownAiBubbleMenu
				view={isCanvas || note?.truncated ? null : editorView}
				onGenerate={(prompt: string) => generateAiBarTextRpc(prompt)}
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
