import { Link } from "@tanstack/react-router";
import { ArrowRight, Sparkles } from "lucide-react";
import type { DashboardWidgetProps } from "./widgetProps";

/** 待整理：未分类缓冲池计数 + 最新条目预览 + 整理入口 */
export function InboxWidget({ unclassified }: DashboardWidgetProps) {
	const count = unclassified.length;
	return (
		<div className="flex flex-col gap-2 h-full">
			<div className="flex items-baseline gap-2">
				<span
					className={`text-3xl font-bold font-mono ${count > 0 ? "text-accent" : "text-foreground"}`}
				>
					{count}
				</span>
				<span className="text-[11px] text-muted">条待归类</span>
			</div>
			{count > 0 ? (
				<ul className="space-y-1 flex-1 min-h-0 overflow-hidden">
					{unclassified.slice(0, 4).map((item) => (
						<li
							key={item.id}
							className="text-[11px] text-muted truncate"
							title={item.name}
						>
							· {item.name}
						</li>
					))}
				</ul>
			) : (
				<p className="text-[11px] text-muted flex items-center gap-1 flex-1">
					<Sparkles className="w-3 h-3" />
					缓冲池已清空，收藏都有归属
				</p>
			)}
			<Link
				to="/bookmarks"
				className="mt-auto inline-flex items-center gap-1 text-[11px] font-medium text-accent hover:underline shrink-0"
			>
				去书签模块整理
				<ArrowRight className="w-3 h-3" />
			</Link>
		</div>
	);
}
