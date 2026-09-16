import { draftStatusLabel, formatRelativeTime, platformLabel } from "../format";
import type { DashboardWidgetProps } from "./widgetProps";

/** 自媒体管道：素材/待审稿/草稿总量 + 最近草稿动态 */
export function CreatorPipelineWidget({ summary }: DashboardWidgetProps) {
	const { materials, draftsPending, draftsTotal, recentDrafts } =
		summary.creator;
	return (
		<div className="flex flex-col gap-2.5 h-full">
			<div className="grid grid-cols-3 gap-2">
				<div className="rounded-lg bg-surface px-2.5 py-2">
					<div className="text-lg font-bold font-mono text-foreground">
						{materials}
					</div>
					<div className="text-[10px] text-muted">素材</div>
				</div>
				<div className="rounded-lg bg-surface px-2.5 py-2">
					<div
						className={`text-lg font-bold font-mono ${draftsPending > 0 ? "text-warning" : "text-foreground"}`}
					>
						{draftsPending}
					</div>
					<div className="text-[10px] text-muted">待审稿</div>
				</div>
				<div className="rounded-lg bg-surface px-2.5 py-2">
					<div className="text-lg font-bold font-mono text-foreground">
						{draftsTotal}
					</div>
					<div className="text-[10px] text-muted">草稿总数</div>
				</div>
			</div>
			{recentDrafts.length > 0 ? (
				<ul className="space-y-1.5 min-h-0 overflow-hidden">
					{recentDrafts.map((draft) => (
						<li
							key={draft.id}
							className="flex items-center gap-2 text-[11px] min-w-0"
						>
							<span className="px-1.5 py-0.5 rounded bg-accent-soft text-accent text-[9px] font-medium shrink-0">
								{platformLabel(draft.platform)}
							</span>
							<span
								className="text-foreground truncate"
								title={draft.materialTitle}
							>
								{draft.materialTitle}
							</span>
							<span className="ml-auto text-muted shrink-0">
								{draftStatusLabel(draft.status)} ·{" "}
								{formatRelativeTime(draft.updatedAt)}
							</span>
						</li>
					))}
				</ul>
			) : (
				<p className="text-[11px] text-muted">
					还没有草稿，去自媒体模块导入素材并生成二创
				</p>
			)}
		</div>
	);
}
