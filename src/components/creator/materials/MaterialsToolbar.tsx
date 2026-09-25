import { Button } from "@heroui/react";
import {
	Archive,
	CheckSquare,
	FolderInput,
	FolderPlus,
	LayoutGrid,
	List,
	ListChecks,
	Loader2,
	Plus,
	RefreshCw,
	Search,
	Trash2,
	X,
} from "lucide-react";
import { TYPE_TABS, type TypeTab } from "./types";

interface MaterialsToolbarProps {
	title: string;
	totalInFolder: number;
	search: string;
	onSearchChange: (val: string) => void;
	refreshing: boolean;
	onRefresh: () => void;
	// Selection mode
	selectMode: boolean;
	onEnterSelectMode: () => void;
	onExitSelectMode: () => void;
	selectedCount: number;
	allVisibleSelected: boolean;
	onToggleSelectAll: () => void;
	batchBusy: boolean;
	onOpenMoveModal: () => void;
	onBatchArchive: () => void;
	onConfirmBatchDelete: () => void;
	// View mode
	viewMode: "list" | "grid";
	onToggleViewMode: (mode: "list" | "grid") => void;
	// Actions
	onCreateFolder: () => void;
	onOpenImportModal: () => void;
	// Filter tab
	typeTab: TypeTab;
	onTypeTabChange: (tab: TypeTab) => void;
	getTypeCount: (tabId: TypeTab) => number;
}

/**
 * Top toolbar for materials view: title, search, batch actions, view toggling, and type tabs
 */
export function MaterialsToolbar({
	title,
	totalInFolder,
	search,
	onSearchChange,
	refreshing,
	onRefresh,
	selectMode,
	onEnterSelectMode,
	onExitSelectMode,
	selectedCount,
	allVisibleSelected,
	onToggleSelectAll,
	batchBusy,
	onOpenMoveModal,
	onBatchArchive,
	onConfirmBatchDelete,
	viewMode,
	onToggleViewMode,
	onCreateFolder,
	onOpenImportModal,
	typeTab,
	onTypeTabChange,
	getTypeCount,
}: MaterialsToolbarProps) {
	return (
		<div className="shrink-0 px-5 pt-4 border-b border-border">
			<div className="flex flex-wrap items-center gap-2 mb-3">
				<h2 className="text-sm font-semibold text-foreground mr-1">{title}</h2>
				<span className="text-[10px] text-muted">
					{totalInFolder} 条素材
				</span>
				<div className="ml-auto flex items-center gap-2">
					{/* Search input */}
					<div className="relative">
						<Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted pointer-events-none" />
						<input
							type="text"
							value={search}
							onChange={(e) => onSearchChange(e.target.value)}
							placeholder="搜索素材…"
							className="w-40 rounded-full border border-border/70 bg-surface pl-7 pr-3 py-1.5 text-xs text-foreground placeholder:text-muted/70 focus:outline-none focus:border-accent/60 transition-colors"
						/>
					</div>

					{/* Refresh button */}
					<button
						type="button"
						title="刷新"
						onClick={onRefresh}
						className="p-1.5 rounded-full text-muted hover:text-foreground hover:bg-muted/10 transition-colors cursor-pointer"
					>
						<RefreshCw
							className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`}
						/>
					</button>

					{/* Selection mode actions */}
					{selectMode ? (
						<>
							<span className="text-[10px] text-muted">
								已选 {selectedCount} 条
							</span>
							<Button
								type="button"
								variant="ghost"
								size="sm"
								className="rounded-full flex items-center gap-1.5 cursor-pointer text-muted"
								onPress={onToggleSelectAll}
							>
								<ListChecks className="w-3.5 h-3.5" />
								{allVisibleSelected ? "取消全选" : "全选"}
							</Button>
							<Button
								type="button"
								variant="ghost"
								size="sm"
								className="rounded-full flex items-center gap-1.5 cursor-pointer text-muted"
								isDisabled={selectedCount === 0 || batchBusy}
								onPress={onOpenMoveModal}
							>
								<FolderInput className="w-3.5 h-3.5" />
								移动到
							</Button>
							<Button
								type="button"
								variant="ghost"
								size="sm"
								className="rounded-full flex items-center gap-1.5 cursor-pointer text-muted"
								isDisabled={selectedCount === 0 || batchBusy}
								onPress={onBatchArchive}
							>
								{batchBusy ? (
									<Loader2 className="w-3.5 h-3.5 animate-spin" />
								) : (
									<Archive className="w-3.5 h-3.5" />
								)}
								归档
							</Button>
							<Button
								type="button"
								variant="ghost"
								size="sm"
								className="rounded-full flex items-center gap-1.5 cursor-pointer text-muted hover:text-danger"
								isDisabled={selectedCount === 0 || batchBusy}
								onPress={onConfirmBatchDelete}
							>
								<Trash2 className="w-3.5 h-3.5" />
								删除
							</Button>
							<Button
								type="button"
								variant="ghost"
								size="sm"
								className="rounded-full flex items-center gap-1.5 cursor-pointer text-muted"
								onPress={onExitSelectMode}
							>
								<X className="w-3.5 h-3.5" />
								取消多选
							</Button>
						</>
					) : (
						<Button
							type="button"
							variant="ghost"
							size="sm"
							className="rounded-full flex items-center gap-1.5 cursor-pointer text-muted"
							onPress={onEnterSelectMode}
						>
							<CheckSquare className="w-3.5 h-3.5" />
							多选
						</Button>
					)}

					{/* View mode toggle */}
					<div className="flex items-center rounded-full border border-border/70 p-0.5">
						<button
							type="button"
							title="网格视图"
							onClick={() => onToggleViewMode("grid")}
							className={`p-1.5 rounded-full transition-colors cursor-pointer ${
								viewMode === "grid"
									? "bg-accent/10 text-accent"
									: "text-muted hover:text-foreground"
							}`}
						>
							<LayoutGrid className="w-3.5 h-3.5" />
						</button>
						<button
							type="button"
							title="列表视图"
							onClick={() => onToggleViewMode("list")}
							className={`p-1.5 rounded-full transition-colors cursor-pointer ${
								viewMode === "list"
									? "bg-accent/10 text-accent"
									: "text-muted hover:text-foreground"
							}`}
						>
							<List className="w-3.5 h-3.5" />
						</button>
					</div>

					<Button
						type="button"
						variant="secondary"
						size="sm"
						className="rounded-full flex items-center gap-1.5 cursor-pointer"
						onPress={onCreateFolder}
					>
						<FolderPlus className="w-3.5 h-3.5" />
						新建文件夹
					</Button>
					<Button
						type="button"
						variant="primary"
						size="sm"
						className="rounded-full flex items-center gap-1.5 cursor-pointer"
						onPress={onOpenImportModal}
					>
						<Plus className="w-3.5 h-3.5" />
						导入素材
					</Button>
				</div>
			</div>

			{/* Type filter tabs */}
			<div className="flex items-center gap-1">
				{TYPE_TABS.map((tab) => {
					const Icon = tab.icon;
					const active = typeTab === tab.id;
					const count = getTypeCount(tab.id);
					return (
						<button
							key={tab.id}
							type="button"
							onClick={() => onTypeTabChange(tab.id)}
							className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors cursor-pointer ${
								active
									? "border-accent text-accent"
									: "border-transparent text-muted hover:text-foreground"
							}`}
						>
							<Icon className="w-3.5 h-3.5" />
							{tab.label}
							{count > 0 && (
								<span className="px-1.5 py-0.5 rounded-full bg-muted/10 text-[10px] text-muted">
									{count}
								</span>
							)}
						</button>
					);
				})}
			</div>
		</div>
	);
}
