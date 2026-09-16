import {
	draftStatusLabel,
	draftStatusTone,
	formatRelativeTime,
	platformLabel,
	platformTone,
} from "../format";
import type { DashboardWidgetProps } from "./widgetProps";

/** 自媒体管道：素材/待审稿/草稿总量 + 最近草稿动态 */
export function CreatorPipelineWidget({ summary }: DashboardWidgetProps) {
	const { materials, draftsPending, draftsTotal, recentDrafts } =
		summary.creator;
	return (
		<div className="flex flex-col gap-2.5 h-full">
			<div className="grid grid-cols-3 gap-2">
				<div className="rounded-xl bg-violet-50 dark:bg-violet-400/10 px-2.5 py-2">
					<div className="text-lg font-bold font-mono text-violet-600 dark:text-violet-300">
						{materials}
					</div>
					<div className="text-[10px] text-muted">素材</div>
				</div>
				<div className="rounded-xl bg-amber-50 dark:bg-amber-400/10 px-2.5 py-2">
					<div
						className={`text-lg font-bold font-mono ${draftsPending > 0 ? "text-amber-600 dark:text-amber-300" : "text-foreground"}`}
					>
						{draftsPending}
					</div>
					<div className="text-[10px] text-muted">待审稿</div>
				</div>
				<div className="rounded-xl bg-sky-50 dark:bg-sky-400/10 px-2.5 py-2">
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
							<span
								className={`px-1.5 py-0.5 rounded-md text-[9px] font-medium shrink-0 ${platformTone(draft.platform)}`}
							>
								{platformLabel(draft.platform)}
							</span>
							<span
								className="text-foreground truncate"
								title={draft.materialTitle}
							>
								{draft.materialTitle}
							</span>
							<span
								className={`ml-auto px-1.5 py-0.5 rounded-md text-[9px] font-medium shrink-0 ${draftStatusTone(draft.status)}`}
							>
								{draftStatusLabel(draft.status)}
							</span>
							<span className="text-muted shrink-0 text-[10px]">
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
