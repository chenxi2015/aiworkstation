import {
	AlertCircle,
	ArrowUpDown,
	ChartBar,
	ChevronDown,
	ChevronRight,
	Code2,
	FolderArchive,
	FolderInput,
	FolderMinus,
	FolderPlus,
	FolderTree,
	Loader2,
	type LucideIcon,
	Pencil,
	Search,
	Sparkles,
	Tag,
	Tags,
	Trash2,
	Wrench,
} from "lucide-react";
import { memo, useMemo, useState } from "react";
import type { AgentStep } from "../../../../types/agent.ts";
import { formatDurationMs } from "../../../../lib/utils.ts";
import { AiMarkdownRenderer } from "../shared/AiMarkdownRenderer.tsx";

export interface AgentStepTimelineProps {
	steps?: AgentStep[];
	isStreaming?: boolean;
	className?: string;
}

interface StepActionMeta {
	Icon: LucideIcon;
	iconColor: string;
	title: string;
}

/**
 * Formats a raw tool invocation step into a human-friendly action phrase with Lucide icon
 */
function formatStepAction(step: AgentStep): StepActionMeta {
	const args = (step.args || {}) as Record<string, unknown>;
	switch (step.toolName) {
		case "get_stats":
			return {
				Icon: ChartBar,
				iconColor: "text-indigo-500 dark:text-indigo-400",
				title: "分析知识库架构与分类全貌",
			};
		case "query_bookmarks": {
			const kw = args.keyword ? `「${String(args.keyword)}」` : "";
			const cat = args.category ? `「${String(args.category)}」` : "";
			const time = args.timeRange ? ` (${String(args.timeRange)})` : "";
			let title = "检索知识库中的书签与收藏条目";
			if (kw) {
				title = `检索包含 ${kw} 的书签条目${time}`;
			} else if (cat) {
				title = `检索 ${cat} 分类下的收藏`;
			}
			return {
				Icon: Search,
				iconColor: "text-blue-500 dark:text-blue-400",
				title,
			};
		}
		case "create_folder": {
			if (Array.isArray(args.folders) && args.folders.length > 0) {
				return {
					Icon: FolderPlus,
					iconColor: "text-amber-500 dark:text-amber-400",
					title: `批量创建 ${args.folders.length} 个文件夹`,
				};
			}
			const name = args.name || args.folderName ? `「${String(args.name || args.folderName)}」` : "新文件夹";
			const cat = args.category ? `在「${String(args.category)}」下` : "";
			return {
				Icon: FolderPlus,
				iconColor: "text-amber-500 dark:text-amber-400",
				title: `${cat}创建文件夹 ${name}`.trim(),
			};
		}
		case "merge_folders": {
			const count = Array.isArray(args.sourceFolderNames)
				? `${args.sourceFolderNames.length} 个`
				: "";
			const target = args.targetFolderName
				? `至「${String(args.targetFolderName)}」`
				: "";
			return {
				Icon: FolderArchive,
				iconColor: "text-purple-500 dark:text-purple-400",
				title: `合并归集 ${count}文件夹 ${target}`.trim(),
			};
		}
		case "update_folder": {
			const name = args.folderName
				? `「${String(args.folderName)}」`
				: "文件夹";
			return {
				Icon: Pencil,
				iconColor: "text-teal-500 dark:text-teal-400",
				title: `修改文件夹 ${name} 属性`,
			};
		}
		case "move_bookmarks_to_folder": {
			if (Array.isArray(args.batchPlans) && args.batchPlans.length > 0) {
				return {
					Icon: FolderInput,
					iconColor: "text-emerald-500 dark:text-emerald-400",
					title: `多目标批量归类整理 ${args.batchPlans.length} 组书签`,
				};
			}
			const target = args.targetFolderName
				? `至「${String(args.targetFolderName)}」`
				: "";
			const count = Array.isArray(args.bookmarkIds) || Array.isArray(args.itemIds) || Array.isArray(args.itemNamesOrUrls)
				? `${((args.bookmarkIds || args.itemIds || args.itemNamesOrUrls) as unknown[]).length} 个`
				: "";
			return {
				Icon: FolderInput,
				iconColor: "text-emerald-500 dark:text-emerald-400",
				title: `归类整理 ${count}书签 ${target}`.trim(),
			};
		}
		case "move_folder": {
			if (Array.isArray(args.folderNames) && args.folderNames.length > 0) {
				const target = args.targetParentFolderName
					? `至「${String(args.targetParentFolderName)}」`
					: args.targetCategory
						? `至分类「${String(args.targetCategory)}」`
						: "层级";
				return {
					Icon: FolderTree,
					iconColor: "text-violet-500 dark:text-violet-400",
					title: `批量调整 ${args.folderNames.length} 个文件夹 ${target}`.trim(),
				};
			}
			const name = args.folderName
				? `「${String(args.folderName)}」`
				: "文件夹";
			return {
				Icon: FolderTree,
				iconColor: "text-violet-500 dark:text-violet-400",
				title: `调整文件夹 ${name} 层级位置`,
			};
		}
		case "reorder_folders":
			return {
				Icon: ArrowUpDown,
				iconColor: "text-sky-500 dark:text-sky-400",
				title: "保存并更新文件夹展示排列",
			};
		case "remove_bookmarks_from_folder":
			return {
				Icon: FolderMinus,
				iconColor: "text-orange-500 dark:text-orange-400",
				title: "从文件夹中移出书签",
			};
		case "delete_folder": {
			if (Array.isArray(args.folderNames) && args.folderNames.length > 0) {
				return {
					Icon: Trash2,
					iconColor: "text-rose-500 dark:text-rose-400",
					title: `批量删除 ${args.folderNames.length} 个文件夹`,
				};
			}
			const name = args.folderName
				? `「${String(args.folderName)}」`
				: "文件夹";
			return {
				Icon: Trash2,
				iconColor: "text-rose-500 dark:text-rose-400",
				title: `删除指定文件夹 ${name}`,
			};
		}
		case "create_tags": {
			if (Array.isArray(args.tags) && args.tags.length > 0) {
				return {
					Icon: Tags,
					iconColor: "text-amber-500 dark:text-amber-400",
					title: `批量创建 ${args.tags.length} 个标签`,
				};
			}
			const name = args.name ? `「${String(args.name)}」` : "新标签";
			return {
				Icon: Tag,
				iconColor: "text-amber-500 dark:text-amber-400",
				title: `创建标签 ${name}`,
			};
		}
		case "add_tags_to_bookmarks": {
			if (Array.isArray(args.plans) && args.plans.length > 0) {
				return {
					Icon: Tags,
					iconColor: "text-indigo-500 dark:text-indigo-400",
					title: `批量为 ${args.plans.length} 组书签规划打标`,
				};
			}
			const tagsList = Array.isArray(args.tags)
				? ` [${args.tags.join("、")}]`
				: "";
			const count =
				Array.isArray(args.bookmarkIds) || Array.isArray(args.itemNamesOrUrls)
					? `${((args.bookmarkIds || args.itemNamesOrUrls) as unknown[]).length} 个目标`
					: "书签";
			return {
				Icon: Tag,
				iconColor: "text-indigo-500 dark:text-indigo-400",
				title: `为 ${count}添加标签${tagsList}`,
			};
		}
		case "remove_tags": {
			const tagsList = Array.isArray(args.tags)
				? ` [${args.tags.join("、")}]`
				: "";
			const isGlobal = Boolean(args.deleteGlobal);
			return {
				Icon: isGlobal ? Trash2 : Tag,
				iconColor: "text-rose-500 dark:text-rose-400",
				title: isGlobal
					? `全库彻底删除标签${tagsList}`
					: `从指定书签摘除标签${tagsList}`,
			};
		}
		case "rename_or_merge_tags": {
			const target = args.targetTag ? `为「${String(args.targetTag)}」` : "";
			const count = Array.isArray(args.sourceTags)
				? `${args.sourceTags.length} 个源标签`
				: "源标签";
			return {
				Icon: Tags,
				iconColor: "text-purple-500 dark:text-purple-400",
				title: `合并治理 ${count} ${target}`.trim(),
			};
		}
		default:
			return {
				Icon: Wrench,
				iconColor: "text-neutral-500 dark:text-neutral-400",
				title: `执行工具: ${step.toolName}`,
			};
	}
}

/**
 * Extracts a clean one-liner summary for timeline preview
 */
function cleanSummaryPreview(summary?: string): string {
	if (!summary) return "";
	const clean = summary
		.replace(/^[#\s*\->]+/, "")
		.replace(/[*_`]/g, "")
		.split("\n")[0]
		?.trim();
	return clean || summary.slice(0, 100);
}

/**
 * Lightweight, continuous vertical timeline for Agent reasoning and tool actions
 * Inspired by modern AI Agent thinking indicators (Cursor / Claude / Perplexity)
 */
export const AgentStepTimeline = memo(function AgentStepTimeline({
	steps = [],
	isStreaming = false,
	className = "",
}: AgentStepTimelineProps) {
	// Default collapsed when finished, or expanded while streaming
	const [isOpen, setIsOpen] = useState<boolean>(false);
	const [expandedStepIds, setExpandedStepIds] = useState<Set<string>>(
		new Set(),
	);

	const totalDurationMs = useMemo(
		() =>
			(steps || []).reduce(
				(acc, curr) =>
					acc + (typeof curr.durationMs === "number" ? curr.durationMs : 0),
				0,
			),
		[steps],
	);

	// Count search keywords if applicable (like in reference image)
	const searchKeywordsCount = useMemo(() => {
		const searches = (steps || []).filter(
			(s) => s.toolName === "query_bookmarks",
		);
		return searches.length;
	}, [steps]);

	const runningStep = useMemo(
		() => (steps || []).find((s) => s.status === "running"),
		[steps],
	);
	const runningAction = runningStep ? formatStepAction(runningStep) : null;

	// Construct concise reference-style summary text
	const summaryText = useMemo(() => {
		if (isStreaming && runningAction) {
			return `正在执行: ${runningAction.title}...`;
		}
		if (isStreaming) {
			return "思考完成，正在生成回答...";
		}
		if (searchKeywordsCount > 0) {
			return `检索 ${searchKeywordsCount} 次数据库，执行 ${steps.length} 步思考推演 · 耗时 ${formatDurationMs(totalDurationMs)}`;
		}
		return `已完成 ${steps.length} 步思考与工具执行 · 耗时 ${formatDurationMs(totalDurationMs)}`;
	}, [
		isStreaming,
		runningAction,
		searchKeywordsCount,
		steps.length,
		totalDurationMs,
	]);

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

	return (
		<div className={`mb-2 text-xs transition-all ${className}`}>
			{/* Minimalist Inline Trigger (Reference Fig. 2 style) */}
			<button
				type="button"
				onClick={() => setIsOpen((prev) => !prev)}
				className="inline-flex items-center gap-1.5 py-1 px-2 -ml-2 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800/60 text-neutral-500 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200 transition-colors text-left font-sans select-none cursor-pointer"
			>
				{isStreaming ? (
					<Loader2 className="w-3.5 h-3.5 animate-spin text-accent shrink-0" />
				) : (
					<Sparkles className="w-3 h-3 text-accent shrink-0" />
				)}

				<span className="text-[11.5px] font-normal leading-none">
					{summaryText}
				</span>

				<ChevronRight
					className={`w-3 h-3 text-neutral-400 transition-transform duration-150 ${
						isOpen ? "rotate-90" : ""
					}`}
				/>
			</button>

			{/* Continuous Vertical Timeline Stream */}
			{isOpen && (
				<div className="relative pl-5 pr-2 pt-2.5 pb-2 mt-1 space-y-2.5">
					{/* Vertical Continuous Rail Line */}
					<div className="absolute left-2.5 top-3.5 bottom-3.5 w-px bg-neutral-200/80 dark:bg-neutral-800" />

					{steps.map((step, idx) => {
						const action = formatStepAction(step);
						const isExpanded = expandedStepIds.has(step.id);
						const previewText = cleanSummaryPreview(step.summary);

						return (
							<div key={step.id || idx} className="relative group/step">
								{/* Step Timeline Node Dot */}
								<div className="absolute -left-2.5 top-1.5 -translate-x-1/2 flex items-center justify-center">
									{step.status === "running" ? (
										<span className="relative flex h-2.5 w-2.5">
											<span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75" />
											<span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-accent" />
										</span>
									) : step.status === "failed" ? (
										<span className="w-2 h-2 rounded-full bg-rose-500 ring-2 ring-neutral-50 dark:ring-neutral-900" />
									) : (
										<span className="w-2 h-2 rounded-full bg-emerald-500/90 ring-2 ring-neutral-50 dark:ring-neutral-900" />
									)}
								</div>

								{/* Step Content Flow */}
								<div className="pl-2">
									{/* Action Title & Metrics Header */}
									<button
										type="button"
										onClick={(e) => toggleStepExpand(step.id, e)}
										className="w-full flex items-center justify-between text-left cursor-pointer select-none group/title py-0.5"
									>
										<div className="flex items-center gap-1.5 min-w-0">
											<action.Icon
												className={`w-3.5 h-3.5 shrink-0 ${action.iconColor}`}
											/>
											<span className="font-medium text-neutral-800 dark:text-neutral-200 group-hover/title:text-accent transition-colors truncate">
												{action.title}
											</span>
											{step.status === "failed" && (
												<AlertCircle className="w-3 h-3 text-rose-500 shrink-0" />
											)}
										</div>

										<div className="flex items-center gap-1.5 text-neutral-400 shrink-0 ml-2">
											{step.durationMs != null && (
												<span className="text-[10px] text-neutral-400 font-mono">
													{formatDurationMs(step.durationMs)}
												</span>
											)}
											<span className="text-[10px] text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 flex items-center gap-0.5">
												<Code2 className="w-3 h-3" />
												{isExpanded ? (
													<ChevronDown className="w-2.5 h-2.5" />
												) : (
													<ChevronRight className="w-2.5 h-2.5" />
												)}
											</span>
										</div>
									</button>

									{/* Single-line Result Preview (When not deeply expanded) */}
									{!isExpanded && previewText && (
										<p className="text-[11px] text-neutral-500 dark:text-neutral-400 line-clamp-1 pl-5 font-sans leading-relaxed">
											{previewText}
										</p>
									)}

									{/* Expanded Technical Inspection Details */}
									{isExpanded && (
										<div className="mt-1.5 ml-5 p-2 rounded-lg bg-white dark:bg-neutral-950/80 border border-neutral-200/70 dark:border-neutral-800 space-y-2 text-[11px]">
											{/* Technical Metadata Bar */}
											<div className="flex items-center justify-between text-[10px] text-neutral-400 border-b border-neutral-100 dark:border-neutral-900 pb-1">
												<span className="font-mono">
													工具标识: {step.toolName}
												</span>
												{step.timestamp && (
													<span className="font-mono">{step.timestamp}</span>
												)}
											</div>

											{/* Arguments */}
											{step.args && Object.keys(step.args).length > 0 && (
												<div>
													<span className="text-neutral-400 font-sans text-[10px]">
														入参调用参数:
													</span>
													<pre className="mt-0.5 p-1.5 rounded bg-neutral-50 dark:bg-neutral-900 text-neutral-800 dark:text-neutral-200 overflow-x-auto text-[10px] font-mono border border-neutral-100 dark:border-neutral-800">
														{JSON.stringify(step.args, null, 2)}
													</pre>
												</div>
											)}

											{/* Full Markdown Execution Result */}
											{step.summary && (
												<div>
													<span className="text-neutral-400 font-sans text-[10px]">
														产出与执行响应:
													</span>
													<div className="mt-0.5 p-2 rounded bg-neutral-50/80 dark:bg-neutral-900/60 text-neutral-700 dark:text-neutral-300 font-sans text-[11px] overflow-x-auto border border-neutral-100 dark:border-neutral-800">
														<AiMarkdownRenderer
															content={step.summary}
															compact={true}
														/>
													</div>
												</div>
											)}
										</div>
									)}
								</div>
							</div>
						);
					})}
				</div>
			)}
		</div>
	);
});
