import { ChevronDown, LayoutGrid, List, Plus, RefreshCw, Search } from "lucide-react";
import type { SkillRootInfo, SkillTab, SkillViewMode } from "./types";

export interface SkillsHeaderBarProps {
	activeTab: SkillTab;
	onTabChange: (tab: SkillTab) => void;
	viewMode: SkillViewMode;
	onViewModeChange: (mode: SkillViewMode) => void;
	query: string;
	onQueryChange: (q: string) => void;
	// Filters
	sourceFilter: string;
	onSourceFilterChange: (src: string) => void;
	categoryFilter: string;
	onCategoryFilterChange: (cat: string) => void;
	apiKeyFilter: string;
	onApiKeyFilterChange: (key: string) => void;
	// Available options
	availableRoots: SkillRootInfo[];
	availableCategories: string[];
	// Actions
	onOpenInstallModal: () => void;
	onRefresh: () => void;
	refreshing: boolean;
	totalCount: number;
}

const TABS: { id: SkillTab; label: string }[] = [
	{ id: "all", label: "全部" },
	{ id: "latest", label: "最近更新" },
	{ id: "alphabetical", label: "名称 A-Z" },
];

export function SkillsHeaderBar({
	activeTab,
	onTabChange,
	viewMode,
	onViewModeChange,
	query,
	onQueryChange,
	sourceFilter,
	onSourceFilterChange,
	categoryFilter,
	onCategoryFilterChange,
	apiKeyFilter,
	onApiKeyFilterChange,
	availableRoots,
	availableCategories,
	onOpenInstallModal,
	onRefresh,
	refreshing,
	totalCount,
}: SkillsHeaderBarProps) {
	return (
		<div className="space-y-4 mb-6">
			{/* Top Control Bar: Tabs on left, dropdowns & actions on right */}
			<div className="flex flex-wrap items-center justify-between gap-3 pt-2">
				{/* Tabs */}
				<div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
					{TABS.map((tab) => {
						const isActive = activeTab === tab.id;
						return (
							<button
								key={tab.id}
								type="button"
								onClick={() => onTabChange(tab.id)}
								className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors shrink-0 ${
									isActive
										? "bg-zinc-200 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-semibold"
										: "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800/50"
								}`}
							>
								{tab.label}
								{tab.id === "all" && totalCount > 0 && (
									<span className="ml-1 opacity-70 font-normal">
										({totalCount})
									</span>
								)}
							</button>
						);
					})}
				</div>

				{/* Right Filters & View Switcher */}
				<div className="flex flex-wrap items-center gap-2 text-xs">
					{/* Source Dropdown */}
					<div className="relative">
						<select
							value={sourceFilter}
							onChange={(e) => onSourceFilterChange(e.target.value)}
							className="appearance-none pl-3 pr-7 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-zinc-400 cursor-pointer"
						>
							<option value="__all__">所有来源</option>
							{availableRoots.map((r) => (
								<option key={r.path} value={r.label}>
									{r.label} ({r.skillCount})
								</option>
							))}
						</select>
						<ChevronDown className="w-3.5 h-3.5 text-zinc-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
					</div>

					{/* Category Dropdown */}
					<div className="relative">
						<select
							value={categoryFilter}
							onChange={(e) => onCategoryFilterChange(e.target.value)}
							className="appearance-none pl-3 pr-7 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-zinc-400 cursor-pointer"
						>
							<option value="__all__">所有场景分类</option>
							{availableCategories.map((c) => (
								<option key={c} value={c}>
									{c}
								</option>
							))}
						</select>
						<ChevronDown className="w-3.5 h-3.5 text-zinc-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
					</div>

					{/* API Key Dropdown */}
					<div className="relative">
						<select
							value={apiKeyFilter}
							onChange={(e) => onApiKeyFilterChange(e.target.value)}
							className="appearance-none pl-3 pr-7 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-zinc-400 cursor-pointer"
						>
							<option value="__all__">不限 API Key</option>
							<option value="needs_key">需配置 API Key</option>
							<option value="no_key">无需 API Key</option>
						</select>
						<ChevronDown className="w-3.5 h-3.5 text-zinc-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
					</div>

					{/* Install Skill Button */}
					<button
						type="button"
						onClick={onOpenInstallModal}
						className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 font-medium hover:opacity-90 transition-opacity"
					>
						<Plus className="w-3.5 h-3.5" />
						安装技能
					</button>

					{/* Refresh button */}
					<button
						type="button"
						onClick={onRefresh}
						disabled={refreshing}
						title="重新扫描"
						className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors disabled:opacity-50"
					>
						<RefreshCw
							className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`}
						/>
					</button>

					{/* Grid vs List View Switcher */}
					<div className="flex items-center p-0.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-100/60 dark:bg-zinc-900">
						<button
							type="button"
							onClick={() => onViewModeChange("list")}
							title="列表视图"
							className={`p-1.5 rounded-md transition-colors ${
								viewMode === "list"
									? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-xs"
									: "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
							}`}
						>
							<List className="w-3.5 h-3.5" />
						</button>
						<button
							type="button"
							onClick={() => onViewModeChange("grid")}
							title="网格视图"
							className={`p-1.5 rounded-md transition-colors ${
								viewMode === "grid"
									? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-xs"
									: "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
							}`}
						>
							<LayoutGrid className="w-3.5 h-3.5" />
						</button>
					</div>
				</div>
			</div>

			{/* Full-width Search Bar */}
			<div className="relative">
				<Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
				<input
					type="text"
					value={query}
					onChange={(e) => onQueryChange(e.target.value)}
					placeholder="搜索技能名称、描述或关键词..."
					className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 text-xs text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-300 dark:focus:ring-zinc-700 transition-shadow shadow-2xs"
				/>
				{query && (
					<button
						type="button"
						onClick={() => onQueryChange("")}
						className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs text-zinc-400 hover:text-zinc-600"
					>
						清空
					</button>
				)}
			</div>
		</div>
	);
}
