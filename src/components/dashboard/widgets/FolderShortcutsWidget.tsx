import { Link } from "@tanstack/react-router";
import { resolveCategoryLabel } from "../../../modules/registry";
import type { DashboardWidgetProps } from "./widgetProps";

/** 常用文件夹：按内容量排序的文件夹速览，点击直达书签模块对应文件夹 */
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
		<ul className="-mx-2">
			{top.map((folder) => (
				<li key={folder.id}>
					<Link
						to="/bookmarks"
						search={{ folder: folder.id }}
						title={`打开文件夹「${folder.name}」`}
						className="flex items-center gap-2 group min-w-0 px-2 py-1.5 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-400/10 transition-colors"
					>
						<span
							className="w-2.5 h-2.5 rounded-full shrink-0 ring-2 ring-surface"
							style={{ backgroundColor: folder.color || "var(--accent)" }}
						/>
						<span className="text-xs text-foreground truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-300 transition-colors">
							{folder.name}
						</span>
						<span className="text-[10px] text-muted shrink-0">
							{resolveCategoryLabel(folder.category)}
						</span>
						<span className="ml-auto px-1.5 py-0.5 rounded-md bg-surface-secondary text-[10px] text-muted font-mono shrink-0">
							{folder.itemCount} 条
						</span>
					</Link>
				</li>
			))}
		</ul>
	);
}
