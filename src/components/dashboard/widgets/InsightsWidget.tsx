import { Link } from "@tanstack/react-router";
import { UNCLASSIFIED_CATEGORY } from "../../../modules/registry";
import type { BookmarksSearch } from "../../../routes/bookmarks";
import { formatRelativeTime } from "../format";
import type { DashboardWidgetProps } from "./widgetProps";

/** 资产与健康：知识库规模、向量覆盖率、死链巡检 */
export function InsightsWidget({ summary }: DashboardWidgetProps) {
	const { bookmarks, folders, health } = summary;
	const coverage =
		bookmarks.total > 0
			? Math.round((bookmarks.embedded / bookmarks.total) * 100)
			: 0;
	const stats: Array<{
		label: string;
		value: string;
		tone: string;
		warn?: boolean;
		search?: BookmarksSearch;
		title: string;
	}> = [
		{
			label: "书签总数",
			value: String(bookmarks.total),
			tone: "bg-sky-50 dark:bg-sky-400/10 text-sky-600 dark:text-sky-300",
			title: "打开书签模块",
		},
		{
			label: "文件夹",
			value: String(folders.total),
			tone: "bg-indigo-50 dark:bg-indigo-400/10 text-indigo-600 dark:text-indigo-300",
			title: "打开书签模块浏览文件夹",
		},
		{
			label: "向量覆盖",
			value: `${coverage}%`,
			tone: "bg-teal-50 dark:bg-teal-400/10 text-teal-600 dark:text-teal-300",
			title: "打开书签模块",
		},
		{
			label: "待整理",
			value: String(bookmarks.unclassified),
			tone: bookmarks.unclassified
				? "bg-amber-50 dark:bg-amber-400/10 text-amber-600 dark:text-amber-300"
				: "bg-surface-secondary/60 text-foreground",
			warn: bookmarks.unclassified > 0,
			search: { category: UNCLASSIFIED_CATEGORY },
			title: "打开未分类缓冲池",
		},
		{
			label: "疑似死链",
			value: health.deadLinks === null ? "未巡检" : String(health.deadLinks),
			tone:
				(health.deadLinks ?? 0) > 0
					? "bg-rose-50 dark:bg-rose-400/10 text-rose-600 dark:text-rose-300"
					: "bg-surface-secondary/60 text-foreground",
			warn: (health.deadLinks ?? 0) > 0,
			search: { deadlinks: true },
			title: "打开死链巡检",
		},
	];
	return (
		<div className="flex flex-col gap-2 h-full">
			<div className="grid grid-cols-5 gap-2">
				{stats.map((stat) => (
					<Link
						key={stat.label}
						to="/bookmarks"
						search={stat.search ?? {}}
						title={stat.title}
						className={`rounded-xl px-2 py-2.5 text-center transition-transform hover:scale-[1.04] ${stat.tone}`}
					>
						<div className="text-base font-bold font-mono">{stat.value}</div>
						<div className="text-[10px] text-muted mt-0.5">{stat.label}</div>
					</Link>
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
