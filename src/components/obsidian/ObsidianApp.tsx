import { Button, Tooltip, toast } from "@heroui/react";
import {
	ChevronsDownUp,
	ChevronsUpDown,
	Crosshair,
	FilePlus2,
	FolderOpen,
	FolderPlus,
	Loader2,
	NotebookPen,
	RefreshCw,
	Search,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getFileManagerName } from "../../lib/platform";
import type { NavLayoutEntry } from "../../modules/registry";
import {
	createVaultFolderRpc,
	createVaultNoteRpc,
	deleteVaultEntryRpc,
	fetchObsidianTree,
	renameVaultEntryRpc,
	revealVaultEntryRpc,
} from "../../services/api/obsidianClient";
import { saveSettings } from "../../services/storage/settingsStorage";
import { useWorkbenchQuickActions } from "../workbench/layout/useWorkbenchQuickActions";
import { WorkbenchHeader } from "../workbench/layout/WorkbenchHeader";
import type { Folder, WorkbenchSettings } from "../workbench/types";
import {
	DeleteEntryDialog,
	shouldSkipDeleteConfirm,
} from "./DeleteEntryDialog";
import { DirectoryPickerModal } from "./DirectoryPickerModal";
import { useObsidianAiBridge } from "./hooks/useObsidianAiBridge";
import { clearWikilinkCaches } from "./markdown/wikilink";
import { NotePanel } from "./NotePanel";
import { TreeContextMenu, type TreeMenuTarget } from "./TreeContextMenu";
import type { ObsidianNoteApi, ObsidianTree } from "./types";
import { VaultSwitcher } from "./VaultSwitcher";
import { collectFolderPaths, filterVaultTree, VaultTree } from "./VaultTree";

export interface ObsidianAppProps {
	unclassifiedCount: number;
	navLayout?: NavLayoutEntry[];
	folders: Folder[];
	settings: WorkbenchSettings;
	/** 深链：加载完成后直接打开该笔记（相对 Vault 根目录路径） */
	initialNotePath?: string;
}

/**
 * Obsidian 模块主页：Vault 目录是唯一事实源，目录即分类；
 * 笔记直接读写 Markdown 文件，不落库、不与 editor documents 混合。
 */
export function ObsidianApp({
	unclassifiedCount,
	navLayout,
	folders,
	settings,
	initialNotePath,
}: ObsidianAppProps) {
	const { actionProps, modals } = useWorkbenchQuickActions({ folders });
	const [treeData, setTreeData] = useState<ObsidianTree | null>(null);
	const [loading, setLoading] = useState(true);
	const [refreshing, setRefreshing] = useState(false);
	const [query, setQuery] = useState("");
	// 侧边栏宽度：默认 300px（加宽，避免深层文件名截断），支持拖拽微调并持久化
	const [sidebarWidth, setSidebarWidth] = useState(() => {
		if (typeof window === "undefined") return 300;
		try {
			const saved = Number(localStorage.getItem("obsidian_sidebar_width"));
			if (saved >= 240 && saved <= 600) return saved;
		} catch {}
		return 300;
	});
	const sidebarWidthRef = useRef(sidebarWidth);
	sidebarWidthRef.current = sidebarWidth;

	const handleSidebarResizeStart = useCallback((e: React.MouseEvent) => {
		e.preventDefault();
		const startX = e.clientX;
		const startWidth = sidebarWidthRef.current;

		const onMouseMove = (ev: MouseEvent) => {
			const next = Math.max(240, Math.min(600, startWidth + (ev.clientX - startX)));
			setSidebarWidth(next);
		};

		const onMouseUp = () => {
			window.removeEventListener("mousemove", onMouseMove);
			window.removeEventListener("mouseup", onMouseUp);
			try {
				localStorage.setItem("obsidian_sidebar_width", String(sidebarWidthRef.current));
			} catch {}
		};

		window.addEventListener("mousemove", onMouseMove);
		window.addEventListener("mouseup", onMouseUp);
	}, []);
	// 笔记导航历史（Obsidian 同款返回/前进）：栈 + 游标，新跳转截断前向分支
	const [noteHistory, setNoteHistory] = useState<{
		stack: string[];
		index: number;
	}>({ stack: [], index: -1 });
	const selectedNotePath =
		noteHistory.index >= 0
			? (noteHistory.stack[noteHistory.index] ?? null)
			: null;
	const openNote = useCallback((path: string) => {
		setNoteHistory((prev) => {
			if (prev.stack[prev.index] === path) return prev;
			const stack = [...prev.stack.slice(0, prev.index + 1), path];
			return { stack, index: stack.length - 1 };
		});
	}, []);
	const clearNoteHistory = useCallback(() => {
		setNoteHistory({ stack: [], index: -1 });
	}, []);
	const goBack = useCallback(() => {
		setNoteHistory((prev) =>
			prev.index > 0 ? { ...prev, index: prev.index - 1 } : prev,
		);
	}, []);
	const goForward = useCallback(() => {
		setNoteHistory((prev) =>
			prev.index < prev.stack.length - 1
				? { ...prev, index: prev.index + 1 }
				: prev,
		);
	}, []);
	/** 重命名/移动后原地替换历史条目（不产生新历史） */
	const remapNoteHistory = useCallback((remap: (p: string) => string) => {
		setNoteHistory((prev) => ({
			stack: prev.stack.map(remap),
			index: prev.index,
		}));
	}, []);
	/** 当前笔记被删除：从历史移除该条目并回退到上一条 */
	const removeCurrentNote = useCallback(() => {
		setNoteHistory((prev) => {
			if (prev.index < 0) return prev;
			const stack = prev.stack.filter((_, i) => i !== prev.index);
			return { stack, index: Math.min(prev.index, stack.length - 1) };
		});
	}, []);
	/** 笔记内重命名：原地替换当前历史条目（不产生新历史） */
	const handleNoteRenamed = useCallback((newPath: string) => {
		setNoteHistory((prev) => {
			if (prev.index < 0) return prev;
			const stack = [...prev.stack];
			stack[prev.index] = newPath;
			return { stack, index: prev.index };
		});
	}, []);
	/** 面包屑点击文件夹：左侧树选中该目录并展开祖先链 */
	const handleSelectFolder = useCallback((dir: string) => {
		setCurrentDir(dir);
		setExpanded((prev) => {
			const next = new Set(prev);
			let cur = dir;
			while (cur) {
				next.add(cur);
				const idx = cur.lastIndexOf("/");
				cur = idx > 0 ? cur.slice(0, idx) : "";
			}
			return next;
		});
	}, []);
	const canGoBack = noteHistory.index > 0;
	const canGoForward = noteHistory.index < noteHistory.stack.length - 1;

	// 导航快捷键（对齐 Obsidian：⌘/Ctrl+Alt+←/→ 返回/前进）
	useEffect(() => {
		const onKeyDown = (e: KeyboardEvent) => {
			if (!(e.altKey && (e.metaKey || e.ctrlKey))) return;
			if (e.key === "ArrowLeft") {
				e.preventDefault();
				goBack();
			} else if (e.key === "ArrowRight") {
				e.preventDefault();
				goForward();
			}
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [goBack, goForward]);
	const [currentDir, setCurrentDir] = useState("");
	const [expanded, setExpanded] = useState<Set<string>>(new Set());
	const [renamingPath, setRenamingPath] = useState<string | null>(null);
	const [menu, setMenu] = useState<TreeMenuTarget | null>(null);
	const [deleteTarget, setDeleteTarget] = useState<
		ObsidianTree["tree"][number] | null
	>(null);
	const [pickerOpen, setPickerOpen] = useState(false);
	// Debounced search: raw query drives the input, debouncedQuery drives filtering
	const [debouncedQuery, setDebouncedQuery] = useState("");
	const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const handleQueryChange = useCallback((value: string) => {
		setQuery(value);
		if (debounceRef.current) clearTimeout(debounceRef.current);
		debounceRef.current = setTimeout(() => setDebouncedQuery(value), 300);
	}, []);
	const noteApiRef = useRef<ObsidianNoteApi | null>(null);
	const handleRegisterNoteApi = useCallback((api: ObsidianNoteApi | null) => {
		noteApiRef.current = api;
	}, []);

	// 桥接全局 AI 侧边栏：空态快捷动作 + 消息级「写入笔记」
	useObsidianAiBridge({ noteApiRef, selectedNotePath });

	const load = useCallback(async (force: boolean) => {
		const data = await fetchObsidianTree(force);
		setTreeData(data);
		setLoading(false);
		setRefreshing(false);
	}, []);

	useEffect(() => {
		load(false);
	}, [load]);

	// 深链直开：按相对路径直接选中笔记（笔记内容独立读盘，无需等目录树命中）
	const initialNoteHandledRef = useRef(false);
	useEffect(() => {
		if (initialNoteHandledRef.current || !initialNotePath) return;
		initialNoteHandledRef.current = true;
		openNote(initialNotePath);
	}, [initialNotePath, openNote]);

	const filteredTree = useMemo(
		() => (treeData ? filterVaultTree(treeData.tree, debouncedQuery) : []),
		[treeData, debouncedQuery],
	);

	// Cache all folder paths independently of query (only recompute on tree change)
	const allFolderPaths = useMemo(
		() => (treeData ? collectFolderPaths(treeData.tree) : []),
		[treeData],
	);

	// Force-expand all folders during search so hits are visible
	const effectiveExpanded = useMemo(() => {
		if (!debouncedQuery.trim()) return expanded;
		return new Set([...expanded, ...allFolderPaths]);
	}, [debouncedQuery, allFolderPaths, expanded]);

	const toggleFolder = useCallback((relPath: string) => {
		setExpanded((prev) => {
			const next = new Set(prev);
			if (next.has(relPath)) {
				next.delete(relPath);
			} else {
				next.add(relPath);
			}
			return next;
		});
	}, []);

	/** 展开/收起全部文件夹：有展开项时一键收起，否则全部展开 */
	const anyExpanded = expanded.size > 0;
	const handleToggleExpandAll = useCallback(() => {
		setExpanded((prev) =>
			prev.size > 0 ? new Set() : new Set(allFolderPaths),
		);
	}, [allFolderPaths]);

	const handleSaveVaultDir = useCallback(
		(path: string) => {
			const next = path.trim();
			saveSettings({ ...settings, obsidianVaultDir: next || undefined });
			clearNoteHistory();
			clearWikilinkCaches();
			setCurrentDir("");
			setExpanded(new Set());
			toast.success("Vault 路径已保存，正在重新扫描");
			load(true);
		},
		[settings, load, clearNoteHistory],
	);

	/** VaultSwitcher 应用新设置；rescan 时清空选中状态并重扫目录树 */
	const handleApplyVaultSettings = useCallback(
		(next: WorkbenchSettings, rescan: boolean) => {
			saveSettings(next);
			if (!rescan) return;
			clearNoteHistory();
			clearWikilinkCaches();
			setCurrentDir("");
			setExpanded(new Set());
			load(true);
		},
		[load, clearNoteHistory],
	);

	/** 在目标目录下生成不冲突的名称：base → base 1 → base 2（对齐 Obsidian「未命名」行为） */
	const nextAvailableName = useCallback(
		(dirPath: string, base: string, isFolder: boolean) => {
			const findChildren = (
				nodes: ObsidianTree["tree"],
				dir: string,
			): string[] | null => {
				if (!dir) return nodes.map((n) => n.name);
				for (const node of nodes) {
					if (node.kind !== "folder") continue;
					if (node.relPath === dir) {
						return (node.children ?? []).map((c) => c.name);
					}
					const hit = findChildren(node.children ?? [], dir);
					if (hit) return hit;
				}
				return null;
			};
			const existing = new Set(
				(findChildren(treeData?.tree ?? [], dirPath) ?? []).map((n) =>
					n.toLowerCase(),
				),
			);
			const taken = (name: string) =>
				existing.has(
					isFolder ? name.toLowerCase() : `${name}.md`.toLowerCase(),
				);
			if (!taken(base)) return base;
			for (let i = 1; i < 1000; i++) {
				const candidate = `${base} ${i}`;
				if (!taken(candidate)) return candidate;
			}
			return `${base} ${Date.now()}`;
		},
		[treeData],
	);

	/** 展开目录及其全部祖先链（保证新建/重命名条目在树中可见） */
	const expandDirChain = useCallback((dir: string) => {
		setExpanded((prev) => {
			const next = new Set(prev);
			let cur = dir;
			while (cur) {
				next.add(cur);
				const idx = cur.lastIndexOf("/");
				cur = idx > 0 ? cur.slice(0, idx) : "";
			}
			return next;
		});
	}, []);

	/** 自动显示当前文件（Obsidian 同款开关）：选中笔记变化时展开祖先链并滚动到可见 */
	const [autoReveal, setAutoReveal] = useState(
		() =>
			typeof window === "undefined" ||
			window.localStorage.getItem("obsidian_auto_reveal") !== "0",
	);
	const handleToggleAutoReveal = useCallback(() => {
		setAutoReveal((prev) => {
			const next = !prev;
			try {
				window.localStorage.setItem("obsidian_auto_reveal", next ? "1" : "0");
			} catch {}
			return next;
		});
	}, []);

	useEffect(() => {
		if (!autoReveal || !selectedNotePath) return;
		const parent = selectedNotePath.includes("/")
			? selectedNotePath.split("/").slice(0, -1).join("/")
			: "";
		expandDirChain(parent);
		// 等展开动画/渲染后滚动到目标行
		const timer = setTimeout(() => {
			document
				.querySelector(`[data-reveal-path="${CSS.escape(selectedNotePath)}"]`)
				?.scrollIntoView({ block: "nearest" });
		}, 50);
		return () => clearTimeout(timer);
	}, [autoReveal, selectedNotePath, expandDirChain]);

	/** 新建笔记：不弹窗，直接以「未命名文件」落在目标目录并进入内联重命名 */
	const handleCreateNote = useCallback(
		async (dir?: string) => {
			const targetDir = dir ?? currentDir;
			const name = nextAvailableName(targetDir, "未命名文件", false);
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

	/** 双链跳转新建：落在当前笔记所在目录（对齐 Obsidian 默认行为），静默创建后直接打开 */
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

	/** 新建文件夹：不弹窗，直接以「未命名」落在目标目录并进入内联重命名 */
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

	/** 内联重命名提交：同步选中态/当前目录路径前缀 */
	const handleRenameCommit = useCallback(
		async (relPath: string, newName: string, isFolder: boolean) => {
			setRenamingPath(null);
			const trimmed = newName.trim();
			const currentName = relPath.split("/").pop() ?? "";
			const currentBase = isFolder
				? currentName
				: currentName.replace(/\.md$/i, "");
			if (!trimmed || trimmed === currentBase) return;
			const res = await renameVaultEntryRpc(relPath, trimmed, !isFolder);
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
		[load, remapNoteHistory],
	);

	/** 执行删除（移动到系统回收站），清理受影响的选中态 */
	const performDeleteEntry = useCallback(
		async (node: ObsidianTree["tree"][number]) => {
			const res = await deleteVaultEntryRpc(node.relPath);
			if (!res.success) {
				toast.danger(res.error ?? "删除失败");
				return;
			}
			const affected = (p: string | null) =>
				p !== null && (p === node.relPath || p.startsWith(`${node.relPath}/`));
			setNoteHistory((prev) => {
				if (!prev.stack.some((p) => affected(p))) return prev;
				const current = prev.index >= 0 ? prev.stack[prev.index] : null;
				const stack = prev.stack.filter((p) => !affected(p));
				const index =
					current && !affected(current)
						? stack.lastIndexOf(current)
						: Math.min(prev.index, stack.length) - 1;
				return { stack, index };
			});
			setCurrentDir((prev) => (affected(prev) ? "" : prev));
			setRenamingPath((prev) => (affected(prev) ? null : prev));
			clearWikilinkCaches();
			toast.success("已移动到系统回收站");
			await load(true);
		},
		[load],
	);

	/** 删除入口：勾选过「不再询问」则直接执行，否则弹确认框 */
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
		(node: ObsidianTree["tree"][number], x: number, y: number) => {
			setMenu({ node, x, y });
		},
		[],
	);
	const handleCloseMenu = useCallback(() => setMenu(null), []);

	/** 菜单选择「重命名」：展开祖先链保证条目可见，再进入内联重命名 */
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

	const vault = treeData?.vault;
	const vaultMissing = treeData !== null && !vault?.exists;

	return (
		<div className="h-screen bg-surface dark:bg-background text-foreground flex flex-col overflow-hidden">
			<WorkbenchHeader
				unclassifiedCount={unclassifiedCount}
				navLayout={navLayout}
				{...actionProps}
			/>

			{loading ? (
				<div className="flex-1 flex items-center justify-center text-muted">
					<Loader2 className="w-5 h-5 animate-spin" />
				</div>
			) : (
				<div className="flex-1 flex overflow-hidden">
					<aside
						style={{ width: `${sidebarWidth}px` }}
						className="relative shrink-0 border-r border-border flex flex-col overflow-hidden"
					>
						<div className="px-2.5 pt-2.5 pb-1.5 space-y-1.5 shrink-0">
							<div className="relative">
								<Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted pointer-events-none" />
								<input
									type="text"
									value={query}
									onChange={(e) => handleQueryChange(e.target.value)}
									placeholder="筛选笔记/文件夹…"
									className="w-full pl-7 pr-2 py-1.5 rounded-lg border border-border bg-surface-secondary/40 text-[11px] text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-zinc-400/40 dark:focus:ring-zinc-600/40"
								/>
							</div>
							<div className="flex items-center gap-0.5 px-1">
								<span className="flex-1 text-[11px] font-medium text-muted select-none">
									笔记
								</span>
								<Tooltip>
									<Tooltip.Trigger>
										<button
											type="button"
											onClick={() => void handleCreateNote()}
											disabled={!vault?.exists}
											aria-label="新建笔记"
											className="p-1.5 rounded-md text-muted hover:text-foreground hover:bg-surface-secondary/60 transition-colors disabled:opacity-40"
										>
											<FilePlus2 className="w-3.5 h-3.5" />
										</button>
									</Tooltip.Trigger>
									<Tooltip.Content placement="bottom">新建笔记</Tooltip.Content>
								</Tooltip>
								<Tooltip>
									<Tooltip.Trigger>
										<button
											type="button"
											onClick={() => void handleCreateFolder()}
											disabled={!vault?.exists}
											aria-label="新建文件夹"
											className="p-1.5 rounded-md text-muted hover:text-foreground hover:bg-surface-secondary/60 transition-colors disabled:opacity-40"
										>
											<FolderPlus className="w-3.5 h-3.5" />
										</button>
									</Tooltip.Trigger>
									<Tooltip.Content placement="bottom">
										新建文件夹
									</Tooltip.Content>
								</Tooltip>
								<Tooltip>
									<Tooltip.Trigger>
										<button
											type="button"
											onClick={() => {
												setRefreshing(true);
												load(true);
											}}
											disabled={refreshing}
											aria-label="重新扫描"
											className="p-1.5 rounded-md text-muted hover:text-foreground hover:bg-surface-secondary/60 transition-colors disabled:opacity-50"
										>
											<RefreshCw
												className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`}
											/>
										</button>
									</Tooltip.Trigger>
									<Tooltip.Content placement="bottom">重新扫描</Tooltip.Content>
								</Tooltip>
								<Tooltip>
									<Tooltip.Trigger>
										<button
											type="button"
											onClick={handleToggleExpandAll}
											disabled={!vault?.exists}
											aria-label={
												anyExpanded ? "收起全部文件夹" : "展开全部文件夹"
											}
											className="p-1.5 rounded-md text-muted hover:text-foreground hover:bg-surface-secondary/60 transition-colors disabled:opacity-40"
										>
											{anyExpanded ? (
												<ChevronsDownUp className="w-3.5 h-3.5" />
											) : (
												<ChevronsUpDown className="w-3.5 h-3.5" />
											)}
										</button>
									</Tooltip.Trigger>
									<Tooltip.Content placement="bottom">
										{anyExpanded ? "收起全部文件夹" : "展开全部文件夹"}
									</Tooltip.Content>
								</Tooltip>
								<Tooltip>
									<Tooltip.Trigger>
										<button
											type="button"
											onClick={handleToggleAutoReveal}
											aria-label="自动显示当前文件"
											aria-pressed={autoReveal}
											className={`p-1.5 rounded-md transition-colors ${
												autoReveal
													? "text-zinc-900 bg-zinc-200/80 dark:text-zinc-100 dark:bg-zinc-700/80 font-medium"
													: "text-muted hover:text-foreground hover:bg-surface-secondary/60"
											}`}
										>
											<Crosshair className="w-3.5 h-3.5" />
										</button>
									</Tooltip.Trigger>
									<Tooltip.Content placement="bottom">
										自动显示当前文件
									</Tooltip.Content>
								</Tooltip>
							</div>
						</div>
						{/* biome-ignore lint/a11y/noStaticElementInteractions lint/a11y/useKeyWithClickEvents: 点击空白区域清除文件夹选中态，新建落回根目录；行内交互在各自 button 上 */}
						<div
							className="flex-1 overflow-y-auto py-1"
							onClick={(e) => {
								if (e.target === e.currentTarget) setCurrentDir("");
							}}
						>
							{filteredTree.length > 0 ? (
								<VaultTree
									nodes={filteredTree}
									selectedNotePath={selectedNotePath}
									currentDir={currentDir}
									expanded={effectiveExpanded}
									renamingPath={renamingPath}
									onToggleFolder={toggleFolder}
									onSelectFolder={setCurrentDir}
									onSelectNote={openNote}
									onOpenMenu={handleOpenMenu}
									onRenameCommit={(p, name, isFolder) =>
										void handleRenameCommit(p, name, isFolder)
									}
									onRenameCancel={() => setRenamingPath(null)}
								/>
							) : (
								<p className="px-4 py-8 text-center text-[11px] text-muted">
									{query
										? "没有匹配的笔记"
										: vaultMissing
											? "Vault 不可用，从下方仓库入口重新选择"
											: "Vault 为空，点击上方「新建笔记」开始"}
								</p>
							)}
						</div>
						<VaultSwitcher
							settings={settings}
							vault={vault}
							scannedAt={treeData?.scannedAt}
							onApply={handleApplyVaultSettings}
						/>
						{/* 拖拽调整侧边栏宽度 */}
						<div
							onMouseDown={handleSidebarResizeStart}
							className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-zinc-400/50 active:bg-zinc-500 transition-colors z-10 select-none"
							title="拖拽调整侧边栏宽度"
						/>
					</aside>
					<section className="flex-1 overflow-hidden">
						{vaultMissing ? (
							<div className="h-full flex flex-col items-center justify-center text-center px-8">
								<div className="w-14 h-14 rounded-2xl bg-surface-secondary text-foreground/70 flex items-center justify-center mb-4">
									<FolderOpen className="w-6 h-6" />
								</div>
								<h2 className="text-sm font-semibold text-foreground">
									Vault 目录不存在
								</h2>
								<p className="mt-2 text-xs text-muted max-w-sm leading-relaxed">
									当前配置：{vault?.configured || "未配置"}
									。可从左下角仓库入口打开/新建仓库，或直接浏览选择目录。
								</p>
								<div className="mt-4 flex items-center gap-2">
									<Button
										variant="primary"
										size="sm"
										className="flex items-center gap-1.5"
										onPress={() => setPickerOpen(true)}
									>
										<FolderOpen className="w-3.5 h-3.5" />
										浏览选择目录
									</Button>
									<Button
										variant="secondary"
										size="sm"
										onPress={() => {
											const input = window.prompt(
												"输入 Vault 目录路径（支持 ~ 开头）",
												settings.obsidianVaultDir ?? "~/Documents/Obsidian",
											);
											if (input?.trim()) handleSaveVaultDir(input);
										}}
									>
										手动填写
									</Button>
								</div>
							</div>
						) : selectedNotePath ? (
							<NotePanel
								relPath={selectedNotePath}
								onMutated={() => load(true)}
								onRenamed={handleNoteRenamed}
								onDeleted={removeCurrentNote}
								onRegisterNoteApi={handleRegisterNoteApi}
								onNavigateNote={openNote}
								onCreateNote={(name) => void handleCreateNoteFromLink(name)}
								canGoBack={canGoBack}
								canGoForward={canGoForward}
								onBack={goBack}
								onForward={goForward}
								onSelectFolder={handleSelectFolder}
							/>
						) : (
							<div className="h-full flex flex-col items-center justify-center text-center px-8">
								<div className="w-14 h-14 rounded-2xl bg-surface-secondary text-foreground/70 flex items-center justify-center mb-4">
									<NotebookPen className="w-6 h-6" />
								</div>
								<h2 className="text-sm font-semibold text-foreground">
									从左侧选择一篇笔记
								</h2>
								<p className="mt-2 text-xs text-muted max-w-sm leading-relaxed">
									目录即分类：点击文件夹选定新建位置，笔记直接读写 Vault 内的
									Markdown 文件，与 Obsidian 实时双向同步。
								</p>
							</div>
						)}
					</section>
				</div>
			)}
			{modals}
			<TreeContextMenu
				target={menu}
				onClose={handleCloseMenu}
				onCreateNote={(dir) => void handleCreateNote(dir)}
				onCreateFolder={(dir) => void handleCreateFolder(dir)}
				onRename={handleStartRename}
				onDelete={(node) => void handleDeleteEntry(node)}
				onCopyPath={handleCopyPath}
				onReveal={(node) => void handleRevealEntry(node)}
			/>
			<DeleteEntryDialog
				target={deleteTarget}
				onClose={() => setDeleteTarget(null)}
				onConfirm={async () => {
					if (deleteTarget) await performDeleteEntry(deleteTarget);
				}}
			/>
			{pickerOpen && (
				<DirectoryPickerModal
					initialPath={settings.obsidianVaultDir}
					onSelect={(path) => {
						setPickerOpen(false);
						handleSaveVaultDir(path);
					}}
					onClose={() => setPickerOpen(false)}
				/>
			)}
		</div>
	);
}
