import { Link } from "@tanstack/react-router";
import { resolveCategoryLabel } from "../../../modules/registry";
import type { DashboardWidgetProps } from "./widgetProps";

/** 常用文件夹：按内容量排序的文件夹速览，点击去书签模块浏览 */
export function FolderShortcutsWidget({ summary }: DashboardWidgetProps) {
	const top = summary.folders.top;
	if (top.length === 0) {
		return (
			<p className="text-[11px] text-muted h-full flex items-center">
				还没有文件夹，去书签模块创建第一个归集
			</p>
		);
	}
	return (
		<ul className="space-y-1">
			{top.map((folder) => (
				<li key={folder.id}>
					<Link
						to="/bookmarks"
						className="flex items-center gap-2 group min-w-0 py-0.5"
					>
						<span
							className="w-2 h-2 rounded-full shrink-0"
							style={{ backgroundColor: folder.color || "var(--accent)" }}
						/>
						<span className="text-xs text-foreground truncate group-hover:text-accent transition-colors">
							{folder.name}
						</span>
						<span className="text-[10px] text-muted shrink-0">
							{resolveCategoryLabel(folder.category)}
						</span>
						<span className="ml-auto text-[10px] text-muted font-mono shrink-0">
							{folder.itemCount} 条
						</span>
					</Link>
				</li>
			))}
		</ul>
	);
}
