import { Tooltip } from "@heroui/react";
import {
	ChevronsDownUp,
	ChevronsUpDown,
	Crosshair,
	FilePlus2,
	FolderPlus,
	RefreshCw,
	Search,
} from "lucide-react";
import type { WorkbenchSettings } from "../../workbench/types";
import type { ObsidianTree } from "../types";
import { VaultSwitcher } from "../VaultSwitcher";
import { VaultTree } from "../VaultTree";

export interface ObsidianSidebarProps {
	sidebarWidth: number;
	onSidebarResizeStart: (e: React.MouseEvent) => void;
	query: string;
	onQueryChange: (query: string) => void;
	vaultExists: boolean;
	onCreateNote: () => void;
	onCreateFolder: () => void;
	onRefresh: () => void;
	refreshing: boolean;
	anyExpanded: boolean;
	onToggleExpandAll: () => void;
	autoReveal: boolean;
	onToggleAutoReveal: () => void;
	filteredTree: ObsidianTree["tree"];
	selectedNotePath: string | null;
	currentDir: string;
	effectiveExpanded: Set<string>;
	renamingPath: string | null;
	onToggleFolder: (path: string) => void;
	onSelectFolder: (path: string) => void;
	onSelectNote: (path: string) => void;
	onOpenMenu: (
		node: ObsidianTree["tree"][number],
		x: number,
		y: number,
	) => void;
	onRenameCommit: (path: string, newName: string, isFolder: boolean) => void;
	onRenameCancel: () => void;
	onClearCurrentDir: () => void;
	vaultMissing: boolean;
	settings: WorkbenchSettings;
	vault?: ObsidianTree["vault"];
	scannedAt?: number;
	onApplyVaultSettings: (next: WorkbenchSettings, rescan: boolean) => void;
}

/**
 * Sidebar component containing search, actions toolbar, folder/file tree, and vault switcher.
 */
export function ObsidianSidebar({
	sidebarWidth,
	onSidebarResizeStart,
	query,
	onQueryChange,
	vaultExists,
	onCreateNote,
	onCreateFolder,
	onRefresh,
	refreshing,
	anyExpanded,
	onToggleExpandAll,
	autoReveal,
	onToggleAutoReveal,
	filteredTree,
	selectedNotePath,
	currentDir,
	effectiveExpanded,
	renamingPath,
	onToggleFolder,
	onSelectFolder,
	onSelectNote,
	onOpenMenu,
	onRenameCommit,
	onRenameCancel,
	onClearCurrentDir,
	vaultMissing,
	settings,
	vault,
	scannedAt,
	onApplyVaultSettings,
}: ObsidianSidebarProps) {
	return (
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
						onChange={(e) => onQueryChange(e.target.value)}
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
								onClick={onCreateNote}
								disabled={!vaultExists}
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
								onClick={onCreateFolder}
								disabled={!vaultExists}
								aria-label="新建文件夹"
								className="p-1.5 rounded-md text-muted hover:text-foreground hover:bg-surface-secondary/60 transition-colors disabled:opacity-40"
							>
								<FolderPlus className="w-3.5 h-3.5" />
							</button>
						</Tooltip.Trigger>
						<Tooltip.Content placement="bottom">新建文件夹</Tooltip.Content>
					</Tooltip>
					<Tooltip>
						<Tooltip.Trigger>
							<button
								type="button"
								onClick={onRefresh}
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
								onClick={onToggleExpandAll}
								disabled={!vaultExists}
								aria-label={anyExpanded ? "收起全部文件夹" : "展开全部文件夹"}
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
								onClick={onToggleAutoReveal}
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

			{/* Empty area click clears selected directory */}
			{/* biome-ignore lint/a11y/noStaticElementInteractions lint/a11y/useKeyWithClickEvents: Click blank space to reset current directory */}
			<div
				className="flex-1 overflow-y-auto py-1"
				onClick={(e) => {
					if (e.target === e.currentTarget) onClearCurrentDir();
				}}
			>
				{filteredTree.length > 0 ? (
					<VaultTree
						nodes={filteredTree}
						selectedNotePath={selectedNotePath}
						currentDir={currentDir}
						expanded={effectiveExpanded}
						renamingPath={renamingPath}
						onToggleFolder={onToggleFolder}
						onSelectFolder={onSelectFolder}
						onSelectNote={onSelectNote}
						onOpenMenu={onOpenMenu}
						onRenameCommit={onRenameCommit}
						onRenameCancel={onRenameCancel}
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
				scannedAt={scannedAt}
				onApply={onApplyVaultSettings}
			/>

			{/* Drag resize handle */}
			{/* biome-ignore lint/a11y/noStaticElementInteractions: sidebar resize handle */}
			<div
				onMouseDown={onSidebarResizeStart}
				className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-zinc-400/50 active:bg-zinc-500 transition-colors z-10 select-none"
				title="拖拽调整侧边栏宽度"
			/>
		</aside>
	);
}
