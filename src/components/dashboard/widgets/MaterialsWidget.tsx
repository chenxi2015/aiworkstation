import { Link } from "@tanstack/react-router";
import { formatRelativeTime } from "../format";
import type { DashboardWidgetProps } from "./widgetProps";

/** 素材库：active 素材总量 + 最近入库，点击直达素材库 */
export function MaterialsWidget({ summary }: DashboardWidgetProps) {
	const { materials, recentMaterials } = summary.creator;
	if (recentMaterials.length === 0) {
		return (
			<p className="text-[11px] text-muted h-full flex items-center">
				还没有素材，去素材库导入第一批创作素材
			</p>
		);
	}
	return (
		<div className="flex flex-col gap-2 h-full">
			<Link
				to="/creator/materials"
				className="text-[11px] text-muted hover:text-teal-600 dark:hover:text-teal-300 transition-colors w-fit"
			>
				共 <span className="font-mono text-foreground">{materials}</span> 条素材
			</Link>
			<ul className="space-y-1.5 min-h-0 overflow-hidden">
				{recentMaterials.map((material) => (
					<li key={material.id}>
						<Link
							to="/creator/materials"
							title={`打开素材库：${material.title}`}
							className="flex items-center gap-2 text-[11px] rounded-lg px-1.5 -mx-1.5 py-0.5 hover:bg-teal-50 dark:hover:bg-teal-400/10 transition-colors group"
						>
							<span
								className="text-foreground truncate group-hover:text-teal-600 dark:group-hover:text-teal-300 transition-colors"
								title={material.title}
							>
								{material.title}
							</span>
							<span className="ml-auto text-muted shrink-0 text-[10px]">
								{formatRelativeTime(material.createdAt)}
							</span>
						</Link>
					</li>
				))}
			</ul>
		</div>
	);
}
