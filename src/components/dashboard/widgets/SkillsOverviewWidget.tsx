import { Link } from "@tanstack/react-router";
import type { DashboardWidgetProps } from "./widgetProps";

/** Skills 概览：本机 skills 总量、根目录与最近变更 */
export function SkillsOverviewWidget({ summary }: DashboardWidgetProps) {
	const skills = summary.skills;
	if (!skills.available) {
		return (
			<p className="text-[11px] text-muted h-full flex items-center">
				Skills 目录暂不可扫描
			</p>
		);
	}
	return (
		<div className="flex flex-col gap-2 h-full">
			<Link
				to="/skills"
				title="打开 Skills 模块"
				className="flex items-baseline gap-2 rounded-xl bg-cyan-50 dark:bg-cyan-400/10 px-3 py-2 transition-transform hover:scale-[1.01]"
			>
				<span className="text-3xl font-bold font-mono text-cyan-600 dark:text-cyan-300">
					{skills.total}
				</span>
				<span className="text-[11px] text-muted">
					个 skill · {skills.rootCount} 个根目录
				</span>
			</Link>
			{skills.recent.length > 0 && (
				<div className="min-h-0 overflow-hidden">
					<div className="text-[10px] text-muted mb-1">最近变更</div>
					<ul className="flex flex-wrap gap-1">
						{skills.recent.map((skill) => (
							<li key={skill.dirPath}>
								<Link
									to="/skills"
									search={{ skill: skill.dirPath }}
									title={`打开 skill 详情：${skill.name}`}
									className="inline-block px-1.5 py-0.5 rounded-md bg-surface-secondary text-[10px] text-foreground font-mono hover:bg-cyan-100 hover:text-cyan-700 dark:hover:bg-cyan-400/20 dark:hover:text-cyan-200 transition-colors"
								>
									{skill.name}
								</Link>
							</li>
						))}
					</ul>
				</div>
			)}
		</div>
	);
}
