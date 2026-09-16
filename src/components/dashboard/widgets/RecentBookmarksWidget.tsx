import { Link } from "@tanstack/react-router";
import { formatRelativeTime, hostOf } from "../format";
import type { DashboardWidgetProps } from "./widgetProps";

/** 最近收藏：全库最新入库的书签列表，点击直达原文 */
export function RecentBookmarksWidget({ summary }: DashboardWidgetProps) {
	const recent = summary.bookmarks.recent;
	if (recent.length === 0) {
		return (
			<div className="h-full flex flex-col items-start justify-center gap-2">
				<p className="text-[11px] text-muted">
					还没有收藏，用 AI Collector 插件或同步浏览器书签开始归集
				</p>
				<Link
					to="/bookmarks"
					className="text-[11px] font-medium text-accent hover:underline"
				>
					打开书签模块 →
				</Link>
			</div>
		);
	}
	return (
		<ul className="-mx-2">
			{recent.map((item) => (
				<li key={item.id}>
					<a
						href={item.url}
						target="_blank"
						rel="noreferrer"
						className="flex items-center gap-2.5 group min-w-0 px-2 py-1.5 rounded-lg hover:bg-sky-50 dark:hover:bg-sky-400/10 transition-colors"
					>
						{item.favicon ? (
							<img
								src={item.favicon}
								alt=""
								className="w-6 h-6 rounded-md bg-surface-secondary p-1 shrink-0"
							/>
						) : (
							<span className="w-6 h-6 rounded-md bg-sky-100 text-sky-600 dark:bg-sky-400/15 dark:text-sky-300 text-[11px] font-bold flex items-center justify-center shrink-0">
								{item.title.slice(0, 1)}
							</span>
						)}
						<span className="min-w-0 flex-1">
							<span className="block text-xs text-foreground truncate group-hover:text-sky-600 dark:group-hover:text-sky-300 transition-colors">
								{item.title}
							</span>
							<span className="block text-[10px] text-muted truncate font-mono">
								{hostOf(item.url)}
							</span>
						</span>
						<span className="text-[10px] text-muted shrink-0">
							{formatRelativeTime(item.createdAt)}
						</span>
					</a>
				</li>
			))}
		</ul>
	);
}
