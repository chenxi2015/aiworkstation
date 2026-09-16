import { formatRelativeTime } from "../format";
import type { DashboardWidgetProps } from "./widgetProps";

/** 资产与健康：知识库规模、向量覆盖率、死链巡检 */
export function InsightsWidget({ summary }: DashboardWidgetProps) {
	const { bookmarks, folders, health } = summary;
	const coverage =
		bookmarks.total > 0
			? Math.round((bookmarks.embedded / bookmarks.total) * 100)
			: 0;
	const stats = [
		{ label: "书签总数", value: String(bookmarks.total) },
		{ label: "文件夹", value: String(folders.total) },
		{ label: "向量覆盖", value: `${coverage}%` },
		{
			label: "待整理",
			value: String(bookmarks.unclassified),
			warn: bookmarks.unclassified > 0,
		},
		{
			label: "疑似死链",
			value: health.deadLinks === null ? "未巡检" : String(health.deadLinks),
			warn: (health.deadLinks ?? 0) > 0,
		},
	];
	return (
		<div className="flex flex-col gap-2 h-full">
			<div className="grid grid-cols-5 gap-2">
				{stats.map((stat) => (
					<div
						key={stat.label}
						className="rounded-lg bg-surface px-2.5 py-2 text-center"
					>
						<div
							className={`text-base font-bold font-mono ${stat.warn ? "text-warning" : "text-foreground"}`}
						>
							{stat.value}
						</div>
						<div className="text-[10px] text-muted">{stat.label}</div>
					</div>
				))}
			</div>
			<p className="text-[10px] text-muted mt-auto">
				{health.lastScanAt
					? `上次巡检：${formatRelativeTime(health.lastScanAt)}`
					: "在书签模块「死链清理」中发起首次巡检"}
				{bookmarks.total > 0 && coverage < 100
					? " · 向量未全覆盖，语义检索精度可继续提升"
					: ""}
			</p>
		</div>
	);
}
