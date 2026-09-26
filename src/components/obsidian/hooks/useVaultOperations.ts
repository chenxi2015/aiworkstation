import { toast } from "@heroui/react";
import { useCallback, useState } from "react";
import { getFileManagerName } from "../../../lib/platform";
import {
	createVaultCanvasRpc,
	createVaultFolderRpc,
	createVaultNoteRpc,
	deleteVaultEntryRpc,
	renameVaultEntryRpc,
	revealVaultEntryRpc,
} from "../../../services/api/obsidianClient";
import { shouldSkipDeleteConfirm } from "../DeleteEntryDialog";
import { clearWikilinkCaches } from "../markdown/wikilink";
import type { TreeMenuTarget } from "../TreeContextMenu";
import type { ObsidianTree } from "../types";

export interface UseVaultOperationsOptions {
	treeData: ObsidianTree | null;
	currentDir: string;
	selectedNotePath: string | null;
	load: (force: boolean) => Promise<void>;
	expandDirChain: (dir: string) => void;
	openNote: (path: string) => void;
	remapNoteHistory: (remap: (p: string) => string) => void;
	removeAffectedHistory: (isAffected: (p: string) => boolean) => void;
	setCurrentDir: React.Dispatch<React.SetStateAction<string>>;
	setExpanded: React.Dispatch<React.SetStateAction<Set<string>>>;
}

/**
 * Manages vault file and folder CRUD actions, conflict-free naming, context menu, and deletion.
 */
export function useVaultOperations({
	treeData,
	currentDir,
	selectedNotePath,
	load,
	expandDirChain,
	openNote,
	remapNoteHistory,
	removeAffectedHistory,
	setCurrentDir,
	setExpanded,
}: UseVaultOperationsOptions) {
	const [renamingPath, setRenamingPath] = useState<string | null>(null);
	const [menu, setMenu] = useState<TreeMenuTarget | null>(null);
	const [deleteTarget, setDeleteTarget] = useState<
		ObsidianTree["tree"][number] | null
	>(null);

	/** Generates conflict-free name in target folder: base -> base 1 -> base 2 */
	const nextAvailableName = useCallback(
		(dirPath: string, base: string, isFolder: boolean, extension?: string) => {
			const findChildren = (
				nodes: ObsidianTree["tree"],
				dir: string,
			): ObsidianTree["tree"] | null => {
				if (!dir) return nodes;
				for (const node of nodes) {
					if (node.kind !== "folder") continue;
					if (node.relPath === dir) {
						return node.children ?? [];
					}
					const hit = findChildren(node.children ?? [], dir);
					if (hit) return hit;
				}
				return null;
			};
			const children = findChildren(treeData?.tree ?? [], dirPath) ?? [];
			const existing = new Set<string>();
			for (const child of children) {
				const fullFileName = child.relPath.split("/").pop() ?? child.name;
				existing.add(fullFileName.toLowerCase());
				// Markdown note nodes in tree have bare name in child.name, add both
				if (
					child.kind === "note" ||
					fullFileName.toLowerCase().endsWith(".md")
				) {
					existing.add(fullFileName.replace(/\.md$/i, "").toLowerCase());
				}
			}
			const ext = extension ?? (isFolder ? "" : ".md");
			const taken = (name: string) => {
				const fullCandidate = isFolder
					? name.toLowerCase()
					: `${name}${ext}`.toLowerCase();
				return (
					existing.has(fullCandidate) ||
					(!isFolder && existing.has(name.toLowerCase()))
				);
			};
			if (!taken(base)) return base;
			for (let i = 1; i < 1000; i++) {
				const candidate = `${base} ${i}`;
				if (!taken(candidate)) return candidate;
			}
			return `${base} ${Date.now()}`;
		},
		[treeData],
	);

	/** Create a new note and enter inline rename mode directly */
	const handleCreateNote = useCallback(
		async (dir?: string) => {
			const targetDir = dir ?? currentDir;
			const name = nextAvailableName(targetDir, "未命名文件", false, ".md");
			const res = await createVaultNoteRpc(targetDir, name);
			if (!res.success) {
				toast.danger(res.error ?? "新建笔记失败");
				return;
			}
			expandDirChain(targetDir);
			await load(true);
			if (res.relPath) {
				openNote(res.relPath);
				setRenamingPath(res.relPath);
			}
		},
		[currentDir, nextAvailableName, expandDirChain, load, openNote],
	);

	/** Create note triggered by wikilink navigation */
	const handleCreateNoteFromLink = useCallback(
		async (name: string) => {
			const dir = selectedNotePath?.includes("/")
				? selectedNotePath.split("/").slice(0, -1).join("/")
				: "";
			const res = await createVaultNoteRpc(dir, name);
			if (!res.success) {
				toast.danger(res.error ?? "新建笔记失败");
				return;
			}
			toast.success(`已新建笔记「${name}」`);
			await load(true);
			if (res.relPath) openNote(res.relPath);
		},
		[selectedNotePath, load, openNote],
	);

	/** Create a new folder and enter inline rename mode directly */
	const handleCreateFolder = useCallback(
		async (dir?: string) => {
			const targetDir = dir ?? currentDir;
			const name = nextAvailableName(targetDir, "未命名", true);
			const res = await createVaultFolderRpc(targetDir, name);
			if (!res.success) {
				toast.danger(res.error ?? "新建文件夹失败");
				return;
			}
			expandDirChain(targetDir);
			await load(true);
			if (res.relPath) setRenamingPath(res.relPath);
		},
		[currentDir, nextAvailableName, expandDirChain, load],
	);

	/** Create a new canvas, optionally with a custom name, and open it */
	const handleCreateCanvas = useCallback(
		async (dir?: string, customName?: string, enterRename = true) => {
			const targetDir = dir ?? currentDir;
			const defaultTitle = customName?.trim() || "未命名白板";
			const name = nextAvailableName(targetDir, defaultTitle, false, ".canvas");
			const res = await createVaultCanvasRpc(targetDir, name);
			if (!res.success) {
				toast.danger(res.error ?? "新建白板失败");
				return res;
			}
			expandDirChain(targetDir);
			await load(true);
			if (res.relPath) {
				openNote(res.relPath);
				if (enterRename) {
					setRenamingPath(res.relPath);
				}
			}
			return res;
		},
		[currentDir, nextAvailableName, expandDirChain, load, openNote],
	);

	/** Commit inline rename and remap active history/expanded states */
	const handleRenameCommit = useCallback(
		async (relPath: string, newName: string, isFolder: boolean) => {
			setRenamingPath(null);
			const trimmed = newName.trim();
			const currentName = relPath.split("/").pop() ?? "";
			const currentBase = isFolder
				? currentName
				: currentName.replace(/\.(md|canvas)$/i, "");
			if (!trimmed || trimmed === currentBase) return;
			const isMdNote = !isFolder && relPath.toLowerCase().endsWith(".md");
			const res = await renameVaultEntryRpc(relPath, trimmed, isMdNote);
			if (!res.success || !res.relPath) {
				toast.danger(res.error ?? "重命名失败");
				return;
			}
			const newPath = res.relPath;
			const remap = (p: string | null): string | null => {
				if (!p) return p;
				if (p === relPath) return newPath;
				if (p.startsWith(`${relPath}/`))
					return newPath + p.slice(relPath.length);
				return p;
			};
			remapNoteHistory((p) => remap(p) ?? p);
			setCurrentDir((prev) => remap(prev) ?? "");
			setExpanded((prev) => {
				const next = new Set<string>();
				for (const p of prev) next.add(remap(p) ?? p);
				return next;
			});
			clearWikilinkCaches();
			await load(true);
		},
		[load, remapNoteHistory, setCurrentDir, setExpanded],
	);

	/** Perform file/folder deletion (move to trash) and cleanup affected state */
	const performDeleteEntry = useCallback(
		async (node: ObsidianTree["tree"][number]) => {
			const res = await deleteVaultEntryRpc(node.relPath);
			if (!res.success) {
				toast.danger(res.error ?? "删除失败");
				return;
			}
			const affected = (p: string) =>
				p === node.relPath || p.startsWith(`${node.relPath}/`);

			removeAffectedHistory(affected);
			setCurrentDir((prev) => (affected(prev) ? "" : prev));
			setRenamingPath((prev) => (prev && affected(prev) ? null : prev));
			clearWikilinkCaches();
			toast.success("已移动到系统回收站");
			await load(true);
		},
		[load, removeAffectedHistory, setCurrentDir],
	);

	/** Delete entrance: skip confirm if checked 'Do not ask again' */
	const handleDeleteEntry = useCallback(
		(node: ObsidianTree["tree"][number]) => {
			if (shouldSkipDeleteConfirm()) {
				void performDeleteEntry(node);
				return;
			}
			setDeleteTarget(node);
		},
		[performDeleteEntry],
	);

	const handleCopyPath = useCallback((node: ObsidianTree["tree"][number]) => {
		navigator.clipboard
			.writeText(node.relPath)
			.then(() => toast.success("已复制路径"))
			.catch(() => toast.danger("复制失败"));
	}, []);

	const handleRevealEntry = useCallback(
		async (node: ObsidianTree["tree"][number]) => {
			const res = await revealVaultEntryRpc(node.relPath);
			if (!res.success)
				toast.danger(res.error ?? `打开${getFileManagerName()}失败`);
		},
		[],
	);

	const handleOpenMenu = useCallback(
		(
			node: ObsidianTree["tree"][number] | null,
			x: number,
			y: number,
			dirPath?: string,
		) => {
			setMenu({ node, x, y, dirPath });
		},
		[],
	);

	const handleCloseMenu = useCallback(() => setMenu(null), []);

	const handleStartRename = useCallback(
		(node: ObsidianTree["tree"][number]) => {
			const parent = node.relPath.includes("/")
				? node.relPath.split("/").slice(0, -1).join("/")
				: "";
			expandDirChain(parent);
			setRenamingPath(node.relPath);
		},
		[expandDirChain],
	);

	return {
		renamingPath,
		setRenamingPath,
		menu,
		deleteTarget,
		setDeleteTarget,
		handleCreateNote,
		handleCreateNoteFromLink,
		handleCreateFolder,
		handleCreateCanvas,
		handleRenameCommit,
		performDeleteEntry,
		handleDeleteEntry,
		handleCopyPath,
		handleRevealEntry,
		handleOpenMenu,
		handleCloseMenu,
		handleStartRename,
	};
}
