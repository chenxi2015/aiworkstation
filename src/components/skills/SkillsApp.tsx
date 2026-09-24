import { useVirtualizer } from "@tanstack/react-virtual";
import { FolderOpen, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { NavLayoutEntry } from "../../modules/registry";
import { fetchSkillsOverview } from "../../services/api/skillsClient";
import { useWorkbenchQuickActions } from "../workbench/layout/useWorkbenchQuickActions";
import { WorkbenchHeader } from "../workbench/layout/WorkbenchHeader";
import type { Folder } from "../workbench/types";
import { InstallSkillModal } from "./InstallSkillModal";
import { SkillDetailPanel } from "./SkillDetailPanel";
import { SkillGridCard } from "./SkillGridCard";
import { SkillListItem } from "./SkillListItem";
import { SkillsHeaderBar } from "./SkillsHeaderBar";
import type {
	SkillInfo,
	SkillsOverview,
	SkillTab,
	SkillViewMode,
} from "./types";
import { UninstallConfirmModal } from "./UninstallConfirmModal";

export interface SkillsAppProps {
	unclassifiedCount: number;
	navLayout?: NavLayoutEntry[];
	folders: Folder[];
	/** Deep link: auto open skill detail panel if dirPath matches */
	initialSkillPath?: string;
}

const ALL_FILTER = "__all__";

/**
 * Skills Module Main View:
 * Matches modern UI card & list design, supports install/uninstall, and integrates virtualized scrolling.
 */
export function SkillsApp({
	unclassifiedCount,
	navLayout,
	folders,
	initialSkillPath,
}: SkillsAppProps) {
	const { actionProps, modals } = useWorkbenchQuickActions({ folders });
	const [overview, setOverview] = useState<SkillsOverview | null>(null);
	const [loading, setLoading] = useState(true);
	const [refreshing, setRefreshing] = useState(false);

	// View mode: 'grid' vs 'list'
	const [viewMode, setViewMode] = useState<SkillViewMode>("grid");

	// Active tab & filters
	const [activeTab, setActiveTab] = useState<SkillTab>("all");
	const [query, setQuery] = useState("");
	const [sourceFilter, setSourceFilter] = useState(ALL_FILTER);
	const [categoryFilter, setCategoryFilter] = useState(ALL_FILTER);
	const [apiKeyFilter, setApiKeyFilter] = useState(ALL_FILTER);

	// Selected skill for detail drawer
	const [selected, setSelected] = useState<SkillInfo | null>(null);

	// Modals
	const [installModalOpen, setInstallModalOpen] = useState(false);
	const [skillToUninstall, setSkillToUninstall] = useState<SkillInfo | null>(
		null,
	);

	// Scroll container ref for @tanstack/react-virtual
	const scrollContainerRef = useRef<HTMLElement>(null);

	const load = useCallback(async (force: boolean) => {
		const data = await fetchSkillsOverview(force);
		setOverview(data);
		setLoading(false);
		setRefreshing(false);
	}, []);

	useEffect(() => {
		load(false);
	}, [load]);

	// Handle deep link
	const initialHandledRef = useRef(false);
	useEffect(() => {
		if (initialHandledRef.current || !initialSkillPath || !overview) return;
		const target = overview.skills.find((s) => s.dirPath === initialSkillPath);
		if (target) {
			initialHandledRef.current = true;
			setSelected(target);
		}
	}, [initialSkillPath, overview]);

	// Compute available categories from loaded skills
	const availableCategories = useMemo(() => {
		if (!overview) return [];
		const catSet = new Set<string>();
		for (const s of overview.skills) {
			if (s.category) catSet.add(s.category);
		}
		return Array.from(catSet);
	}, [overview]);

	// Filter and sort skills
	const filteredSkills = useMemo(() => {
		const skills = overview?.skills ?? [];
		const q = query.trim().toLowerCase();

		let result = skills.filter((skill) => {
			// Source filter

			if (
				sourceFilter !== ALL_FILTER &&
				skill.source !== sourceFilter &&
				skill.rootLabel !== sourceFilter
			) {
				return false;
			}

			// Category filter
			if (categoryFilter !== ALL_FILTER && skill.category !== categoryFilter) {
				return false;
			}

			// API Key filter
			if (apiKeyFilter === "needs_key" && !skill.needsApiKey) return false;
			if (apiKeyFilter === "no_key" && skill.needsApiKey) return false;

			// Search query
			if (!q) return true;
			return (
				skill.name.toLowerCase().includes(q) ||
				skill.description.toLowerCase().includes(q) ||
				skill.dirName.toLowerCase().includes(q) ||
				skill.category?.toLowerCase().includes(q)
			);
		});

		// Tab-based sorting
		if (activeTab === "latest") {
			result = [...result].sort((a, b) => b.modifiedAt - a.modifiedAt);
		} else if (activeTab === "alphabetical") {
			result = [...result].sort((a, b) =>
				a.name.localeCompare(b.name, "zh-CN"),
			);
		}

		return result;
	}, [overview, activeTab, query, sourceFilter, categoryFilter, apiKeyFilter]);

	// Chunk skills into rows of 3 for virtualized grid
	const chunkedGridRows = useMemo(() => {
		const rows: SkillInfo[][] = [];
		for (let i = 0; i < filteredSkills.length; i += 3) {
			rows.push(filteredSkills.slice(i, i + 3));
		}
		return rows;
	}, [filteredSkills]);

	// Virtualizer for Grid View (row-based)
	const gridVirtualizer = useVirtualizer({
		count: chunkedGridRows.length,
		getScrollElement: () => scrollContainerRef.current,
		estimateSize: () => 200,
		overscan: 3,
	});

	// Virtualizer for List View (item-based)
	const listVirtualizer = useVirtualizer({
		count: filteredSkills.length,
		getScrollElement: () => scrollContainerRef.current,
		estimateSize: () => 88,
		overscan: 5,
	});

	const handleRequestUninstall = (skill: SkillInfo, e: React.MouseEvent) => {
		e.stopPropagation();
		setSkillToUninstall(skill);
	};

	return (
		<div className="h-screen bg-[#fcfcfd] dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 flex flex-col overflow-hidden">
			<WorkbenchHeader
				unclassifiedCount={unclassifiedCount}
				navLayout={navLayout}
				{...actionProps}
			/>

			{/* Main Scroll Container */}
			<main ref={scrollContainerRef} className="flex-1 overflow-y-auto">
				<div className="max-w-6xl mx-auto px-6 py-4">
					{/* Header Control Bar */}
					<SkillsHeaderBar
						activeTab={activeTab}
						onTabChange={setActiveTab}
						viewMode={viewMode}
						onViewModeChange={setViewMode}
						query={query}
						onQueryChange={setQuery}
						sourceFilter={sourceFilter}
						onSourceFilterChange={setSourceFilter}
						categoryFilter={categoryFilter}
						onCategoryFilterChange={setCategoryFilter}
						apiKeyFilter={apiKeyFilter}
						onApiKeyFilterChange={setApiKeyFilter}
						availableRoots={overview?.roots ?? []}
						availableCategories={availableCategories}
						onOpenInstallModal={() => setInstallModalOpen(true)}
						onRefresh={() => {
							setRefreshing(true);
							load(true);
						}}
						refreshing={refreshing}
						totalCount={filteredSkills.length}
					/>

					{/* Loading Skeletons */}
					{loading ? (
						<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
							{["sk-1", "sk-2", "sk-3", "sk-4", "sk-5", "sk-6"].map((key) => (
								<div
									key={key}
									className="h-44 rounded-2xl border border-zinc-200/60 dark:border-zinc-800/60 bg-white/60 dark:bg-zinc-900/40 animate-pulse"
								/>
							))}
						</div>
					) : filteredSkills.length === 0 ? (
						/* Empty State */
						<div className="flex flex-col items-center justify-center py-20 text-center">
							<div className="w-14 h-14 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-400 mb-3">
								{query ? (
									<Search className="w-6 h-6" />
								) : (
									<FolderOpen className="w-6 h-6" />
								)}
							</div>
							<h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
								{query ? "没有匹配的 Skill" : "暂未发现技能"}
							</h3>
							<p className="mt-1 text-xs text-zinc-400 max-w-sm">
								{query
									? "尝试缩短搜索词或重置筛选条件"
									: "点击右上角「安装技能」即可添加新的 Agent Skill"}
							</p>
						</div>
					) : viewMode === "grid" ? (
						/* Virtualized Grid View */
						<div
							className="relative w-full"
							style={{ height: `${gridVirtualizer.getTotalSize()}px` }}
						>
							{gridVirtualizer.getVirtualItems().map((virtualRow) => {
								const rowSkills = chunkedGridRows[virtualRow.index] || [];
								return (
									<div
										key={virtualRow.key}
										data-index={virtualRow.index}
										ref={gridVirtualizer.measureElement}
										className="absolute top-0 left-0 w-full grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-4"
										style={{ transform: `translateY(${virtualRow.start}px)` }}
									>
										{rowSkills.map((skill) => (
											<SkillGridCard
												key={skill.dirPath || skill.id || skill.name}
												skill={skill}
												onOpen={setSelected}
												onRequestUninstall={handleRequestUninstall}
											/>
										))}
									</div>
								);
							})}
						</div>
					) : (
						/* Virtualized List View */
						<div
							className="relative w-full"
							style={{ height: `${listVirtualizer.getTotalSize()}px` }}
						>
							{listVirtualizer.getVirtualItems().map((virtualRow) => {
								const skill = filteredSkills[virtualRow.index];
								if (!skill) return null;
								return (
									<div
										key={virtualRow.key}
										data-index={virtualRow.index}
										ref={listVirtualizer.measureElement}
										className="absolute top-0 left-0 w-full pb-3"
										style={{ transform: `translateY(${virtualRow.start}px)` }}
									>
										<SkillListItem
											skill={skill}
											onOpen={setSelected}
											onRequestUninstall={handleRequestUninstall}
										/>
									</div>
								);
							})}
						</div>
					)}
				</div>
			</main>

			{/* Detail Drawer Panel */}
			{selected && (
				<SkillDetailPanel skill={selected} onClose={() => setSelected(null)} />
			)}

			{/* Install Skill Modal */}
			<InstallSkillModal
				isOpen={installModalOpen}
				onClose={() => setInstallModalOpen(false)}
				onSuccess={() => load(true)}
				availableRoots={overview?.roots ?? []}
			/>

			{/* Uninstall Skill Modal */}
			<UninstallConfirmModal
				isOpen={Boolean(skillToUninstall)}
				skill={skillToUninstall}
				onClose={() => setSkillToUninstall(null)}
				onSuccess={() => load(true)}
			/>

			{modals}
		</div>
	);
}
