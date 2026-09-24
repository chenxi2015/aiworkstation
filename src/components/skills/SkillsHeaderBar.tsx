import { ListBox, Select } from "@heroui/react";
import { LayoutGrid, List, Plus, RefreshCw, Search } from "lucide-react";
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

interface FilterOption {
	id: string;
	label: string;
}

interface FilterSelectProps {
	ariaLabel: string;
	value: string;
	onChange: (val: string) => void;
	options: FilterOption[];
	className?: string;
}

// Reusable filter dropdown matching the screenshot radio style
function FilterSelect({
	ariaLabel,
	value,
	onChange,
	options,
	className = "min-w-[110px]",
}: FilterSelectProps) {
	const selectedOption = options.find((opt) => opt.id === value) ?? options[0];

	return (
		<Select
			aria-label={ariaLabel}
			selectedKey={value}
			onSelectionChange={(key) => {
				if (key != null) onChange(String(key));
			}}
			className={className}
		>
			<Select.Trigger className="h-8 min-h-8 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 text-xs font-normal hover:bg-zinc-50 dark:hover:bg-zinc-800/60 shadow-none cursor-pointer flex items-center justify-between gap-1.5 transition-colors">
				<Select.Value className="text-xs text-zinc-800 dark:text-zinc-200 font-normal truncate leading-none">
					{selectedOption?.label}
				</Select.Value>
				<Select.Indicator className="text-zinc-400 size-3 shrink-0" />
			</Select.Trigger>
			<Select.Popover className="min-w-[130px] max-h-60 overflow-y-auto p-1.5 rounded-xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-lg text-xs z-50">
				<ListBox className="space-y-0.5 outline-none p-0">
					{options.map((opt) => {
						const isSelected = opt.id === value;
						return (
							<ListBox.Item
								key={opt.id}
								id={opt.id}
								textValue={opt.label}
								className={`flex items-center gap-2.5 px-2.5 py-1.5 !min-h-8 rounded-lg cursor-pointer transition-colors outline-none text-xs select-none ${
									isSelected
										? "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-medium"
										: "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/60"
								}`}
							>
								{/* Custom Radio Button Indicator */}
								{isSelected ? (
									<span className="w-3.5 h-3.5 rounded-full bg-zinc-800 dark:bg-zinc-200 flex items-center justify-center shrink-0">
										<span className="w-1.5 h-1.5 rounded-full bg-white dark:bg-zinc-900" />
									</span>
								) : (
									<span className="w-3.5 h-3.5 rounded-full border border-zinc-300 dark:border-zinc-600 shrink-0" />
								)}
								<span className="truncate">{opt.label}</span>
							</ListBox.Item>
						);
					})}
				</ListBox>
			</Select.Popover>
		</Select>
	);
}

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
	const sourceOptions: FilterOption[] = [
		{ id: "__all__", label: "所有来源" },
		...availableRoots.map((r) => ({
			id: r.label,
			label: `${r.label} (${r.skillCount})`,
		})),
	];

	const categoryOptions: FilterOption[] = [
		{ id: "__all__", label: "所有场景分类" },
		...availableCategories.map((c) => ({
			id: c,
			label: c,
		})),
	];

	const apiKeyOptions: FilterOption[] = [
		{ id: "__all__", label: "不限 API Key" },
		{ id: "needs_key", label: "需配置 API Key" },
		{ id: "no_key", label: "无需 API Key" },
	];

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
					<FilterSelect
						ariaLabel="来源过滤"
						value={sourceFilter}
						onChange={onSourceFilterChange}
						options={sourceOptions}
						className="min-w-[110px]"
					/>

					{/* Category Dropdown */}
					<FilterSelect
						ariaLabel="场景分类过滤"
						value={categoryFilter}
						onChange={onCategoryFilterChange}
						options={categoryOptions}
						className="min-w-[120px]"
					/>

					{/* API Key Dropdown */}
					<FilterSelect
						ariaLabel="API Key 过滤"
						value={apiKeyFilter}
						onChange={onApiKeyFilterChange}
						options={apiKeyOptions}
						className="min-w-[110px]"
					/>

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
