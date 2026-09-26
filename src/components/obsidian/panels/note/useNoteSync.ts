import { toast } from "@heroui/react";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	fetchVaultNote,
	getCachedVaultNote,
	saveVaultNoteRpc,
} from "../../../../services/api/obsidianClient";
import { clearWikilinkCaches } from "../../markdown/wikilink";
import type {
	ObsidianCanvasApi,
	ObsidianNoteApi,
	ObsidianNoteContent,
} from "../../types";
import { tryReapplyChanges } from "../../utils/merge";
import type { NoteSaveState } from "./NoteStatusBar";

/** Autosave debounce delay in milliseconds */
const AUTOSAVE_DELAY = 800;

/** Throttle interval for refreshing vault tree after autosave (avoids rescan flood) */
const TREE_SYNC_THROTTLE = 10000;

export interface UseNoteSyncOptions {
	relPath: string;
	onMutated: () => void;
	onRegisterNoteApi?: (api: ObsidianNoteApi | null) => void;
	onStartRewritePipeline?: (
		instruction?: string,
		modeLabel?: string,
	) => Promise<void>;
	toggleSplitCompare?: () => void;
	onUndo?: () => boolean;
	onRedo?: () => boolean;
	canUndo?: () => boolean;
	canRedo?: () => boolean;
	canvasApiRef?: React.RefObject<ObsidianCanvasApi | null>;
}

export interface UseNoteSyncReturn {
	note: ObsidianNoteContent | null;
	draft: string;
	loading: boolean;
	error: string | null;
	saveState: NoteSaveState;
	savedAt: number | null;
	conflict: { mtime?: number } | null;
	setDraft: React.Dispatch<React.SetStateAction<string>>;
	setNote: React.Dispatch<React.SetStateAction<ObsidianNoteContent | null>>;
	setConflict: React.Dispatch<React.SetStateAction<{ mtime?: number } | null>>;
	handleDraftChange: (value: string) => void;
	flushSave: (force?: boolean) => Promise<void>;
	load: (target: string) => Promise<void>;
}

/**
 * Custom hook managing note fetch lifecycle, local draft, debounce autosave,
 * three-way merge conflict handling, and registering ObsidianNoteApi for AI sidebar.
 */
export function useNoteSync({
	relPath,
	onMutated,
	onRegisterNoteApi,
	onStartRewritePipeline,
	toggleSplitCompare,
	onUndo,
	onRedo,
	canUndo,
	canRedo,
	canvasApiRef,
}: UseNoteSyncOptions): UseNoteSyncReturn {
	const initialCached = getCachedVaultNote(relPath);
	const [note, setNote] = useState<ObsidianNoteContent | null>(initialCached);
	const [loading, setLoading] = useState(!initialCached);
	const [error, setError] = useState<string | null>(null);
	const [draft, setDraft] = useState(initialCached?.content ?? "");
	const [saveState, setSaveState] = useState<NoteSaveState>("idle");
	const [savedAt, setSavedAt] = useState<number | null>(null);
	const [conflict, setConflict] = useState<{ mtime?: number } | null>(null);
	const loadSeqRef = useRef(0);

	// Latest mutable references to avoid stale closure in asynchronous autosave
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
			setDraft((prev: string) =>
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

	/**
	 * Autosave (git-like sync semantics):
	 * - mtime identical -> write directly;
	 * - mtime modified -> server performs three-way merge; clean merge returns to editor;
	 * - conflict -> pause autosave and show conflict banner without silent overwrite.
	 */
	const flushSave = useCallback(async (force = false) => {
		const base = noteRef.current;
		if (!base || base.truncated) return;
		if (saveTimerRef.current) {
			clearTimeout(saveTimerRef.current);
			saveTimerRef.current = null;
		}
		if (conflictRef.current && !force) return;
		if (inFlightRef.current) return;
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
		// Active note switched during save -> discard stale result
		if (noteRef.current?.relPath !== targetPath) return;
		if (res.success) {
			const synced = res.merged ?? content;
			if (res.merged !== undefined && res.merged !== content) {
				const rebased = tryReapplyChanges(
					res.merged,
					content,
					draftRef.current,
				);
				if (rebased === null) {
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

	const handleDraftChange = useCallback(
		(value: string) => {
			setDraft(value);
			if (value !== noteRef.current?.content) scheduleSave();
		},
		[scheduleSave],
	);

	// Load note and flush previous unsaved changes on relPath switch
	useEffect(() => {
		void flushSaveRef.current();
		load(relPath);
	}, [relPath, load]);

	// Flush unsaved draft on unmount
	useEffect(() => {
		return () => {
			void flushSaveRef.current();
		};
	}, []);

	// Register note API handler for AI sidebar bridge
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
			onStartRewritePipeline,
			toggleSplitCompare,
			undo: onUndo,
			redo: onRedo,
			canUndo,
			canRedo,
			isCanvas: () => relPath.endsWith(".canvas"),
			get canvasApi() {
				return canvasApiRef?.current ?? undefined;
			},
		});
		return () => onRegisterNoteApi(null);
	}, [
		onRegisterNoteApi,
		onStartRewritePipeline,
		toggleSplitCompare,
		onUndo,
		onRedo,
		canUndo,
		canRedo,
		canvasApiRef,
		relPath,
	]);


	return {
		note,
		draft,
		loading,
		error,
		saveState,
		savedAt,
		conflict,
		setDraft,
		setNote,
		setConflict,
		handleDraftChange,
		flushSave,
		load,
	};
}
