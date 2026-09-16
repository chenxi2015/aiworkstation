import { Link } from "@tanstack/react-router";
import { ArrowRight, Sparkles } from "lucide-react";
import { UNCLASSIFIED_CATEGORY } from "../../../modules/registry";
import type { DashboardWidgetProps } from "./widgetProps";

/** 待整理：未分类缓冲池计数 + 最新条目预览 + 整理入口 */
export function InboxWidget({ unclassified }: DashboardWidgetProps) {
	const count = unclassified.length;
	return (
		<div className="flex flex-col gap-2 h-full">
			<Link
				to="/bookmarks"
				search={{ category: UNCLASSIFIED_CATEGORY }}
				title="打开未分类缓冲池"
				className={`flex items-baseline gap-2 rounded-xl px-3 py-2 transition-transform hover:scale-[1.01] ${
					count > 0
						? "bg-amber-50 dark:bg-amber-400/10"
						: "bg-emerald-50 dark:bg-emerald-400/10"
				}`}
			>
				<span
					className={`text-3xl font-bold font-mono ${
						count > 0
							? "text-amber-600 dark:text-amber-300"
							: "text-emerald-600 dark:text-emerald-300"
					}`}
				>
					{count}
				</span>
				<span className="text-[11px] text-muted">条待归类</span>
			</Link>
			{count > 0 ? (
				<ul className="space-y-1 flex-1 min-h-0 overflow-hidden">
					{unclassified.slice(0, 4).map((item) => (
						<li key={item.id}>
							<Link
								to="/bookmarks"
								search={{
									category: UNCLASSIFIED_CATEGORY,
									item: String(item.id ?? item.url ?? ""),
								}}
								className="block text-[11px] text-muted truncate rounded-md px-1.5 -mx-1.5 py-0.5 hover:bg-amber-50 hover:text-amber-700 dark:hover:bg-amber-400/10 dark:hover:text-amber-200 transition-colors"
								title={`定位到「${item.name}」`}
							>
								· {item.name}
							</Link>
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
				search={{ category: UNCLASSIFIED_CATEGORY }}
				className="mt-auto inline-flex items-center gap-1 text-[11px] font-medium text-amber-600 hover:text-amber-700 dark:text-amber-300 dark:hover:text-amber-200 shrink-0"
			>
				去书签模块整理
				<ArrowRight className="w-3 h-3" />
			</Link>
		</div>
	);
}
