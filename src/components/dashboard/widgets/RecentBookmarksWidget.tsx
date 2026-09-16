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
		<ul className="divide-y divide-border/60">
			{recent.map((item) => (
				<li key={item.id} className="py-1.5 first:pt-0 last:pb-0">
					<a
						href={item.url}
						target="_blank"
						rel="noreferrer"
						className="flex items-center gap-2 group min-w-0"
					>
						{item.favicon ? (
							<img
								src={item.favicon}
								alt=""
								className="w-3.5 h-3.5 rounded-sm shrink-0"
							/>
						) : (
							<span className="w-3.5 h-3.5 rounded-sm bg-accent-soft text-accent text-[9px] font-bold flex items-center justify-center shrink-0">
								{item.title.slice(0, 1)}
							</span>
						)}
						<span className="text-xs text-foreground truncate group-hover:text-accent transition-colors">
							{item.title}
						</span>
						<span className="ml-auto text-[10px] text-muted shrink-0 font-mono">
							{hostOf(item.url)} · {formatRelativeTime(item.createdAt)}
						</span>
					</a>
				</li>
			))}
		</ul>
	);
}
