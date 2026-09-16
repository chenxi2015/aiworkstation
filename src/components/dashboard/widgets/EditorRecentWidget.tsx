import {
	documentStatusLabel,
	documentStatusTone,
	formatRelativeTime,
} from "../format";
import type { DashboardWidgetProps } from "./widgetProps";

/** 创作文档：最近编辑的创作台文档 */
export function EditorRecentWidget({ summary }: DashboardWidgetProps) {
	const { total, recent } = summary.editor;
	if (recent.length === 0) {
		return (
			<p className="text-[11px] text-muted h-full flex items-center">
				还没有文档，去创作模块开始第一篇深度加工
			</p>
		);
	}
	return (
		<div className="flex flex-col gap-2 h-full">
			<div className="text-[11px] text-muted">
				共 <span className="font-mono text-foreground">{total}</span> 篇文档
			</div>
			<ul className="space-y-1.5 min-h-0 overflow-hidden">
				{recent.map((doc) => (
					<li key={doc.id} className="flex items-center gap-2 text-[11px]">
						<span className="text-foreground truncate" title={doc.title}>
							{doc.title}
						</span>
						<span
							className={`ml-auto px-1.5 py-0.5 rounded-md text-[9px] font-medium shrink-0 ${documentStatusTone(doc.status)}`}
						>
							{documentStatusLabel(doc.status)}
						</span>
						<span className="text-muted shrink-0 text-[10px]">
							{formatRelativeTime(doc.updatedAt)}
						</span>
					</li>
				))}
			</ul>
		</div>
	);
}
