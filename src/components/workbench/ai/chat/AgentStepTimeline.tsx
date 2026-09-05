import {
	AlertCircle,
	CheckCircle2,
	ChevronDown,
	ChevronRight,
	Clock,
	Loader2,
	Wrench,
} from "lucide-react";
import { memo, useMemo, useState } from "react";
import type { AgentStep } from "../../../../server/ai/agentTypes.ts";

export interface AgentStepTimelineProps {
	steps?: AgentStep[];
	isStreaming?: boolean;
	className?: string;
}

const TOOL_META: Record<string, { label: string; icon: string; desc: string }> =
	{
		get_stats: {
			label: "统计库架构与分类",
			icon: "📊",
			desc: "分析主分类分布与文件夹总量",
		},
		query_bookmarks: {
			label: "检索书签数据库",
			icon: "🔍",
			desc: "查询匹配的书签与收藏条目",
		},
		create_folder: {
			label: "创建新文件夹",
			icon: "📁",
			desc: "新建知识库文件夹目录",
		},
		update_folder: {
			label: "修改文件夹属性",
			icon: "✏️",
			desc: "更新文件夹名称或所属分类",
		},
		move_bookmarks_to_folder: {
			label: "批量规整与归类书签",
			icon: "📦",
			desc: "将书签移入或链接至指定文件夹",
		},
		move_folder: {
			label: "调整文件夹层级",
			icon: "📂",
			desc: "移动文件夹父子归属或移至顶层",
		},
		reorder_folders: {
			label: "重排文件夹顺序",
			icon: "↕️",
			desc: "保存并更新文件夹展示排列",
		},
		remove_bookmarks_from_folder: {
			label: "移出书签条目",
			icon: "📤",
			desc: "将书签从文件夹剥离回未分类",
		},
		delete_folder: {
			label: "删除指定文件夹",
			icon: "🗑️",
			desc: "移除文件夹并回收条目",
		},
	};

/**
 * Visual timeline tracking the execution trajectory of Agent tool calls
 */
export const AgentStepTimeline = memo(function AgentStepTimeline({
	steps = [],
	isStreaming = false,
	className = "",
}: AgentStepTimelineProps) {
	const [isOpen, setIsOpen] = useState<boolean>(isStreaming);
	const [expandedStepIds, setExpandedStepIds] = useState<Set<string>>(
		new Set(),
	);

	const completedCount = useMemo(
		() => (steps || []).filter((s) => s.status === "completed").length,
		[steps],
	);

	if (!steps || steps.length === 0) return null;

	const toggleStepExpand = (id: string, e: React.MouseEvent) => {
		e.stopPropagation();
		setExpandedStepIds((prev) => {
			const next = new Set(prev);
			if (next.has(id)) {
				next.delete(id);
			} else {
				next.add(id);
			}
			return next;
		});
	};

	const runningStep = steps.find((s) => s.status === "running");

	return (
		<div
			className={`mb-3 rounded-lg border border-neutral-200/80 dark:border-neutral-800 bg-neutral-50/60 dark:bg-neutral-900/50 text-xs overflow-hidden transition-all ${className}`}
		>
			{/* Header Trigger */}
			<button
				type="button"
				onClick={() => setIsOpen((prev) => !prev)}
				className="w-full px-3 py-2 flex items-center justify-between text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100/60 dark:hover:bg-neutral-800/40 transition-colors text-left font-sans"
			>
				<div className="flex items-center gap-2">
					<div className="flex items-center justify-center w-5 h-5 rounded bg-primary-100 dark:bg-primary-950/40 text-primary-600 dark:text-primary-400">
						<Wrench className="w-3 h-3" />
					</div>
					<span className="font-medium text-neutral-800 dark:text-neutral-200">
						{isStreaming && runningStep
							? `正在执行: ${TOOL_META[runningStep.toolName]?.label || runningStep.toolName}...`
							: `已完成 ${steps.length} 步思考与工具调用`}
					</span>
					{completedCount > 0 && !isStreaming && (
						<span className="text-[11px] text-neutral-400 dark:text-neutral-500">
							({completedCount}/{steps.length} 成功)
						</span>
					)}
				</div>

				<div className="flex items-center gap-1.5 text-neutral-400">
					{isStreaming && (
						<Loader2 className="w-3.5 h-3.5 animate-spin text-primary-500" />
					)}
					{isOpen ? (
						<ChevronDown className="w-3.5 h-3.5" />
					) : (
						<ChevronRight className="w-3.5 h-3.5" />
					)}
				</div>
			</button>

			{/* Expandable Step List */}
			{isOpen && (
				<div className="px-3 pb-2.5 pt-1 space-y-2 border-t border-neutral-200/60 dark:border-neutral-800/60">
					{steps.map((step, idx) => {
						const meta = TOOL_META[step.toolName] || {
							label: step.toolName,
							icon: "⚙️",
							desc: "自定义工具执行",
						};
						const isExpanded = expandedStepIds.has(step.id);

						return (
							<div
								key={step.id || idx}
								className="rounded bg-white dark:bg-neutral-950/70 border border-neutral-200/60 dark:border-neutral-800/60 p-2 text-neutral-700 dark:text-neutral-300"
							>
								{/* Step title bar */}
								<button
									type="button"
									onClick={(e) => toggleStepExpand(step.id, e)}
									className="w-full flex items-center justify-between text-left cursor-pointer select-none"
								>
									<div className="flex items-center gap-2">
										{step.status === "running" && (
											<Loader2 className="w-3.5 h-3.5 animate-spin text-primary-500" />
										)}
										{step.status === "completed" && (
											<CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
										)}
										{step.status === "failed" && (
											<AlertCircle className="w-3.5 h-3.5 text-rose-500" />
										)}

										<span className="font-medium text-neutral-800 dark:text-neutral-200">
											{meta.icon} {meta.label}
										</span>
										<span className="text-[11px] font-mono text-neutral-400 dark:text-neutral-500">
											({step.toolName})
										</span>
									</div>

									<div className="flex items-center gap-2">
										{step.durationMs != null && (
											<span className="flex items-center gap-0.5 text-[10px] text-neutral-400">
												<Clock className="w-2.5 h-2.5" />
												{step.durationMs}ms
											</span>
										)}
										{isExpanded ? (
											<ChevronDown className="w-3 h-3 text-neutral-400" />
										) : (
											<ChevronRight className="w-3 h-3 text-neutral-400" />
										)}
									</div>
								</button>

								{/* Step result summary */}
								{step.summary && (
									<p className="mt-1 text-[11px] text-neutral-600 dark:text-neutral-400 line-clamp-2">
										{step.summary}
									</p>
								)}

								{/* Collapsed Details: Arguments & Full result */}
								{isExpanded && (
									<div className="mt-2 pt-2 border-t border-neutral-100 dark:border-neutral-800/80 space-y-1.5 font-mono text-[11px]">
										{step.args && Object.keys(step.args).length > 0 && (
											<div>
												<span className="text-neutral-400 font-sans">
													入参:
												</span>
												<pre className="mt-0.5 p-1.5 rounded bg-neutral-100 dark:bg-neutral-900 text-neutral-800 dark:text-neutral-200 overflow-x-auto text-[10px]">
													{JSON.stringify(step.args, null, 2)}
												</pre>
											</div>
										)}
										{step.summary && (
											<div>
												<span className="text-neutral-400 font-sans">
													执行结果:
												</span>
												<div className="mt-0.5 p-1.5 rounded bg-neutral-100 dark:bg-neutral-900 text-neutral-700 dark:text-neutral-300 font-sans text-[11px]">
													{step.summary}
												</div>
											</div>
										)}
									</div>
								)}
							</div>
						);
					})}
				</div>
			)}
		</div>
	);
});
