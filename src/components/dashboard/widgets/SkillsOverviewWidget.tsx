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
			<div className="flex items-baseline gap-2">
				<span className="text-3xl font-bold font-mono text-foreground">
					{skills.total}
				</span>
				<span className="text-[11px] text-muted">
					个 skill · {skills.rootCount} 个根目录
				</span>
			</div>
			{skills.recentNames.length > 0 && (
				<div className="min-h-0 overflow-hidden">
					<div className="text-[10px] text-muted mb-1">最近变更</div>
					<ul className="flex flex-wrap gap-1">
						{skills.recentNames.map((name) => (
							<li
								key={name}
								className="px-1.5 py-0.5 rounded bg-surface text-[10px] text-foreground font-mono"
							>
								{name}
							</li>
						))}
					</ul>
				</div>
			)}
		</div>
	);
}
