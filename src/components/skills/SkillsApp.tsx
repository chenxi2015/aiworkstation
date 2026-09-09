import { Blocks, FolderOpen, RefreshCw, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { NavLayoutEntry } from "../../modules/registry";
import { fetchSkillsOverview } from "../../services/api/skillsClient";
import { WorkbenchHeader } from "../workbench/layout/WorkbenchHeader";
import { SkillCard } from "./SkillCard";
import { SkillDetailPanel } from "./SkillDetailPanel";
import type { SkillInfo, SkillsOverview } from "./types";

export interface SkillsAppProps {
	unclassifiedCount: number;
	navLayout?: NavLayoutEntry[];
}

const ALL_ROOTS = "__all__";

const SKELETON_KEYS = ["sk-1", "sk-2", "sk-3", "sk-4", "sk-5", "sk-6"];

/**
 * Skills 模块主页：扫描本机散落的 skills 目录，统一查看与检索
 */
export function SkillsApp({ unclassifiedCount, navLayout }: SkillsAppProps) {
	const [overview, setOverview] = useState<SkillsOverview | null>(null);
	const [loading, setLoading] = useState(true);
	const [refreshing, setRefreshing] = useState(false);
	const [query, setQuery] = useState("");
	const [rootFilter, setRootFilter] = useState<string>(ALL_ROOTS);
	const [selected, setSelected] = useState<SkillInfo | null>(null);

	const load = useCallback(async (force: boolean) => {
		const data = await fetchSkillsOverview(force);
		setOverview(data);
		setLoading(false);
		setRefreshing(false);
	}, []);

	useEffect(() => {
		load(false);
	}, [load]);

	const filtered = useMemo(() => {
		const skills = overview?.skills ?? [];
		const q = query.trim().toLowerCase();
		return skills.filter((skill) => {
			if (rootFilter !== ALL_ROOTS && skill.rootPath !== rootFilter) {
				return false;
			}
			if (!q) return true;
			return (
				skill.name.toLowerCase().includes(q) ||
				skill.description.toLowerCase().includes(q) ||
				skill.dirName.toLowerCase().includes(q)
			);
		});
	}, [overview, query, rootFilter]);

	return (
		<div className="h-screen bg-surface dark:bg-background text-foreground flex flex-col overflow-hidden">
			<WorkbenchHeader
				unclassifiedCount={unclassifiedCount}
				navLayout={navLayout}
			/>
			<main className="flex-1 overflow-y-auto">
				<div className="max-w-6xl mx-auto px-6 py-6">
					<div className="flex flex-wrap items-center gap-3 mb-5">
						<div className="relative flex-1 min-w-56">
							<Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted pointer-events-none" />
							<input
								type="text"
								value={query}
								onChange={(e) => setQuery(e.target.value)}
								placeholder="搜索 skill 名称或描述…"
								className="w-full pl-8 pr-3 py-2 rounded-xl border border-border bg-surface-secondary/40 text-xs text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/40"
							/>
						</div>
						<button
							type="button"
							onClick={() => {
								setRefreshing(true);
								load(true);
							}}
							disabled={refreshing}
							className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border bg-surface-secondary/40 text-xs text-foreground/80 hover:bg-surface-secondary/70 transition-colors disabled:opacity-50"
						>
							<RefreshCw
								className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`}
							/>
							重新扫描
						</button>
					</div>

					{overview && overview.roots.length > 0 && (
						<div className="flex flex-wrap items-center gap-2 mb-5">
							<button
								type="button"
								onClick={() => setRootFilter(ALL_ROOTS)}
								className={`px-3 py-1.5 rounded-full text-[11px] font-medium border transition-colors ${
									rootFilter === ALL_ROOTS
										? "bg-accent text-accent-foreground border-accent"
										: "bg-surface-secondary/40 text-foreground/70 border-border hover:bg-surface-secondary/70"
								}`}
							>
								全部（{overview.skills.length}）
							</button>
							{overview.roots.map((root) => (
								<button
									key={root.path}
									type="button"
									onClick={() => setRootFilter(root.path)}
									disabled={!root.exists}
									title={root.path}
									className={`px-3 py-1.5 rounded-full text-[11px] font-medium border transition-colors disabled:opacity-40 ${
										rootFilter === root.path
											? "bg-accent text-accent-foreground border-accent"
											: "bg-surface-secondary/40 text-foreground/70 border-border hover:bg-surface-secondary/70"
									}`}
								>
									{root.label}（{root.skillCount}）
								</button>
							))}
							{overview.scannedAt > 0 && (
								<span className="ml-auto text-[10px] text-muted">
									扫描于 {new Date(overview.scannedAt).toLocaleTimeString()}
								</span>
							)}
						</div>
					)}

					{loading ? (
						<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
							{SKELETON_KEYS.map((key) => (
								<div
									key={key}
									className="h-36 rounded-2xl border border-border bg-surface-secondary/30 animate-pulse"
								/>
							))}
						</div>
					) : filtered.length > 0 ? (
						<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
							{filtered.map((skill) => (
								<SkillCard
									key={skill.dirPath}
									skill={skill}
									onOpen={setSelected}
								/>
							))}
						</div>
					) : (
						<div className="flex flex-col items-center justify-center py-24 text-center">
							<div className="w-14 h-14 rounded-2xl bg-accent-soft text-accent flex items-center justify-center mb-4">
								{query || rootFilter !== ALL_ROOTS ? (
									<Search className="w-6 h-6" />
								) : (
									<FolderOpen className="w-6 h-6" />
								)}
							</div>
							<h2 className="text-sm font-semibold text-foreground">
								{query || rootFilter !== ALL_ROOTS
									? "没有匹配的 skill"
									: "未发现任何 skills 目录"}
							</h2>
							<p className="mt-2 text-xs text-muted max-w-sm leading-relaxed">
								{query || rootFilter !== ALL_ROOTS
									? "换个关键词或来源试试"
									: "默认扫描 ~/.codex/skills、~/.agents/skills、~/.claude/skills，在这些目录下放置含 SKILL.md 的文件夹即可被收录"}
							</p>
							{overview && !overview.roots.some((r) => r.exists) && (
								<p className="mt-1 text-[10px] text-muted font-mono flex items-center gap-1">
									<Blocks className="w-3 h-3" /> 所有默认根目录均不存在
								</p>
							)}
						</div>
					)}
				</div>
			</main>

			{selected && (
				<SkillDetailPanel skill={selected} onClose={() => setSelected(null)} />
			)}
		</div>
	);
}
