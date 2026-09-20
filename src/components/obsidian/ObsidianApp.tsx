import { toast } from "@heroui/react";
import {
	FilePlus2,
	FolderOpen,
	FolderPlus,
	Loader2,
	NotebookPen,
	RefreshCw,
	Search,
	Settings2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { NavLayoutEntry } from "../../modules/registry";
import {
	createVaultFolderRpc,
	createVaultNoteRpc,
	fetchObsidianTree,
} from "../../services/api/obsidianClient";
import { saveSettings } from "../../services/storage/settingsStorage";
import { useWorkbenchQuickActions } from "../workbench/layout/useWorkbenchQuickActions";
import { WorkbenchHeader } from "../workbench/layout/WorkbenchHeader";
import type { Folder, WorkbenchSettings } from "../workbench/types";
import { DirectoryPickerModal } from "./DirectoryPickerModal";
import { useObsidianAiBridge } from "./hooks/useObsidianAiBridge";
import { NotePanel } from "./NotePanel";
import type { ObsidianNoteApi, ObsidianTree } from "./types";
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
	const [selectedNotePath, setSelectedNotePath] = useState<string | null>(null);
	const [currentDir, setCurrentDir] = useState("");
	const [expanded, setExpanded] = useState<Set<string>>(new Set());
	const [editingVault, setEditingVault] = useState(false);
	const [vaultInput, setVaultInput] = useState(settings.obsidianVaultDir ?? "");
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
		setSelectedNotePath(initialNotePath);
	}, [initialNotePath]);

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

	const handleSaveVaultDir = useCallback(
		(explicit?: string) => {
			const next = (explicit ?? vaultInput).trim();
			saveSettings({ ...settings, obsidianVaultDir: next || undefined });
			setVaultInput(next);
			setEditingVault(false);
			setSelectedNotePath(null);
			setCurrentDir("");
			setExpanded(new Set());
			toast.success("Vault 路径已保存，正在重新扫描");
			load(true);
		},
		[vaultInput, settings, load],
	);

	const handleCreateNote = useCallback(async () => {
		const name = window.prompt(
			`新笔记名称（创建于：${currentDir || "Vault 根目录"}）`,
		);
		if (!name || !name.trim()) return;
		const res = await createVaultNoteRpc(currentDir, name.trim());
		if (!res.success) {
			toast.danger(res.error ?? "新建笔记失败");
			return;
		}
		toast.success("已新建笔记");
		await load(true);
		if (res.relPath) setSelectedNotePath(res.relPath);
	}, [currentDir, load]);

	const handleCreateFolder = useCallback(async () => {
		const name = window.prompt(
			`新文件夹名称（创建于：${currentDir || "Vault 根目录"}）`,
		);
		if (!name || !name.trim()) return;
		const res = await createVaultFolderRpc(currentDir, name.trim());
		if (!res.success) {
			toast.danger(res.error ?? "新建文件夹失败");
			return;
		}
		toast.success("已新建文件夹");
		if (res.relPath) {
			setExpanded((prev) => new Set(prev).add(res.relPath as string));
		}
		await load(true);
	}, [currentDir, load]);

	const vault = treeData?.vault;
	const vaultMissing = treeData !== null && !vault?.exists;

	return (
		<div className="h-screen bg-surface dark:bg-background text-foreground flex flex-col overflow-hidden">
			<WorkbenchHeader
				unclassifiedCount={unclassifiedCount}
				navLayout={navLayout}
				{...actionProps}
			/>

			<div className="flex items-center gap-2 px-4 py-2.5 border-b border-border shrink-0 flex-wrap">
				<NotebookPen className="w-4 h-4 text-accent shrink-0" />
				{editingVault ? (
					<>
						<input
							type="text"
							value={vaultInput}
							onChange={(e) => setVaultInput(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter") handleSaveVaultDir();
								if (e.key === "Escape") setEditingVault(false);
							}}
							placeholder="~/Documents/Obsidian"
							className="flex-1 min-w-56 px-3 py-1.5 rounded-lg border border-border bg-surface-secondary/40 text-xs font-mono text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/40"
						/>
						<button
							type="button"
							onClick={() => setPickerOpen(true)}
							className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-border text-[11px] text-foreground/80 hover:bg-surface-secondary/60 transition-colors"
						>
							<FolderOpen className="w-3 h-3" />
							浏览…
						</button>
						<button
							type="button"
							onClick={() => handleSaveVaultDir()}
							className="px-3 py-1.5 rounded-lg bg-accent text-accent-foreground text-[11px] font-medium hover:opacity-90"
						>
							保存
						</button>
						<button
							type="button"
							onClick={() => setEditingVault(false)}
							className="px-3 py-1.5 rounded-lg border border-border text-[11px] text-foreground/70 hover:bg-surface-secondary/60"
						>
							取消
						</button>
					</>
				) : (
					<>
						<span
							className="text-xs font-mono text-muted truncate max-w-72"
							title={vault?.path}
						>
							{vault?.configured || "未配置 Vault"}
						</span>
						<button
							type="button"
							onClick={() => {
								setVaultInput(settings.obsidianVaultDir ?? "");
								setEditingVault(true);
							}}
							className="p-1.5 rounded-lg text-muted hover:text-foreground hover:bg-surface-secondary/60 transition-colors"
							title="修改 Vault 路径"
						>
							<Settings2 className="w-3.5 h-3.5" />
						</button>
						{vault?.exists && (
							<span className="text-[10px] text-muted shrink-0">
								{vault.noteCount} 篇笔记 · 扫描于{" "}
								{new Date(treeData?.scannedAt ?? 0).toLocaleTimeString()}
							</span>
						)}
					</>
				)}
				<div className="ml-auto flex items-center gap-2">
					<div className="relative">
						<Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted pointer-events-none" />
						<input
							type="text"
							value={query}
							onChange={(e) => handleQueryChange(e.target.value)}
							placeholder="筛选笔记/文件夹…"
							className="w-44 pl-7 pr-2 py-1.5 rounded-lg border border-border bg-surface-secondary/40 text-[11px] text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/40"
						/>
					</div>
					<button
						type="button"
						onClick={handleCreateNote}
						disabled={!vault?.exists}
						className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-border text-[11px] text-foreground/80 hover:bg-surface-secondary/60 transition-colors disabled:opacity-40"
					>
						<FilePlus2 className="w-3 h-3" />
						新建笔记
					</button>
					<button
						type="button"
						onClick={handleCreateFolder}
						disabled={!vault?.exists}
						className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-border text-[11px] text-foreground/80 hover:bg-surface-secondary/60 transition-colors disabled:opacity-40"
					>
						<FolderPlus className="w-3 h-3" />
						新建文件夹
					</button>
					<button
						type="button"
						onClick={() => {
							setRefreshing(true);
							load(true);
						}}
						disabled={refreshing}
						className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-border text-[11px] text-foreground/80 hover:bg-surface-secondary/60 transition-colors disabled:opacity-50"
					>
						<RefreshCw
							className={`w-3 h-3 ${refreshing ? "animate-spin" : ""}`}
						/>
						重新扫描
					</button>
				</div>
			</div>

			{loading ? (
				<div className="flex-1 flex items-center justify-center text-muted">
					<Loader2 className="w-5 h-5 animate-spin" />
				</div>
			) : vaultMissing ? (
				<div className="flex-1 flex flex-col items-center justify-center text-center px-8">
					<div className="w-14 h-14 rounded-2xl bg-accent-soft text-accent flex items-center justify-center mb-4">
						<FolderOpen className="w-6 h-6" />
					</div>
					<h2 className="text-sm font-semibold text-foreground">
						Vault 目录不存在
					</h2>
					<p className="mt-2 text-xs text-muted max-w-sm leading-relaxed">
						当前配置：{vault?.configured || "未配置"}。请点击工具栏的
						设置图标填入你的 Obsidian 库路径（如 ~/Documents/Obsidian），
						保存后自动扫描。
					</p>
					<div className="mt-4 flex items-center gap-2">
						<button
							type="button"
							onClick={() => setPickerOpen(true)}
							className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-accent text-accent-foreground text-xs font-medium hover:opacity-90"
						>
							<FolderOpen className="w-3.5 h-3.5" />
							浏览选择目录
						</button>
						<button
							type="button"
							onClick={() => {
								setVaultInput(settings.obsidianVaultDir ?? "");
								setEditingVault(true);
							}}
							className="px-4 py-2 rounded-xl border border-border text-xs text-foreground/70 hover:bg-surface-secondary/60"
						>
							手动填写
						</button>
					</div>
				</div>
			) : (
				<div className="flex-1 flex overflow-hidden">
					<aside className="w-64 shrink-0 border-r border-border overflow-y-auto py-2">
						{filteredTree.length > 0 ? (
							<VaultTree
								nodes={filteredTree}
								selectedNotePath={selectedNotePath}
								currentDir={currentDir}
								expanded={effectiveExpanded}
								onToggleFolder={toggleFolder}
								onSelectFolder={setCurrentDir}
								onSelectNote={setSelectedNotePath}
							/>
						) : (
							<p className="px-4 py-8 text-center text-[11px] text-muted">
								{query ? "没有匹配的笔记" : "Vault 为空，点击「新建笔记」开始"}
							</p>
						)}
					</aside>
					<section className="flex-1 overflow-hidden">
						{selectedNotePath ? (
							<NotePanel
								key={selectedNotePath}
								relPath={selectedNotePath}
								onMutated={() => load(true)}
								onRenamed={setSelectedNotePath}
								onDeleted={() => setSelectedNotePath(null)}
								onRegisterNoteApi={handleRegisterNoteApi}
								onNavigateNote={setSelectedNotePath}
							/>
						) : (
							<div className="h-full flex flex-col items-center justify-center text-center px-8">
								<div className="w-14 h-14 rounded-2xl bg-accent-soft text-accent flex items-center justify-center mb-4">
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
			{pickerOpen && (
				<DirectoryPickerModal
					initialPath={vaultInput.trim() || settings.obsidianVaultDir}
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
