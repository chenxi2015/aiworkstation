import {
	ChevronDown,
	ChevronRight,
	Loader2,
} from "lucide-react";
import { memo } from "react";
import { formatDurationMs } from "../../../../../lib/utils.ts";
import { AiMarkdownRenderer } from "../../shared/AiMarkdownRenderer.tsx";
import { extractDiffStat, formatStepAction } from "./toolStrategies.ts";
import type { AgentStepItemProps } from "./types.ts";

/**
 * Individual step row rendering tool icon, verb phrase, diff stats, and inspection drawer
 */
export const AgentStepItem = memo(function AgentStepItem({
	step,
	isExpanded,
	onToggleExpand,
}: AgentStepItemProps) {
	const meta = formatStepAction(step);
	const diffStat = extractDiffStat(step.args, step.summary);

	return (
		<div className="group/item">
			{/* Step action line button */}
			<button
				type="button"
				onClick={(e) => onToggleExpand(step.id, e)}
				className="w-full flex items-center justify-between text-left py-1 px-1.5 -ml-1.5 rounded-md hover:bg-neutral-100/70 dark:hover:bg-neutral-800/40 transition-colors cursor-pointer select-none"
			>
				<div className="flex items-center gap-2 min-w-0 flex-1">
					{/* Icon in calm, neutral tone */}
					<meta.Icon className="w-4 h-4 text-neutral-500 dark:text-neutral-400 shrink-0" />

					{/* Action phrase, target entity, and diff stats */}
					<div className="flex items-center gap-1.5 min-w-0 text-[13px] text-neutral-600 dark:text-neutral-300 truncate">
						<span className="font-normal truncate">{meta.actionText}</span>
						{meta.targetText && (
							<span className="font-mono text-[12.5px] text-neutral-800 dark:text-neutral-200 underline decoration-neutral-300 dark:decoration-neutral-700 underline-offset-2 truncate">
								{meta.targetText}
							</span>
						)}
						{diffStat && (
							<span className="font-mono text-[11.5px] text-neutral-400 dark:text-neutral-500 shrink-0">
								{diffStat}
							</span>
						)}
						{/* Status indicator dot */}
						{step.status === "running" ? (
							<Loader2 className="w-3 h-3 animate-spin text-neutral-400 shrink-0" />
						) : step.status === "failed" ? (
							<span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
						) : (
							<span className="w-1.5 h-1.5 rounded-full bg-sky-500/80 shrink-0" />
						)}
					</div>
				</div>

				{/* Duration and inspect toggle */}
				<div className="flex items-center gap-1.5 text-neutral-400 shrink-0 ml-2 opacity-50 group-hover/item:opacity-100 transition-opacity">
					{step.durationMs != null && step.durationMs > 0 && (
						<span className="text-[11px] font-mono">
							{formatDurationMs(step.durationMs)}
						</span>
					)}
					{isExpanded ? (
						<ChevronDown className="w-3 h-3" />
					) : (
						<ChevronRight className="w-3 h-3" />
					)}
				</div>
			</button>

			{/* Expanded Technical Inspection Details */}
			{isExpanded && (
				<div className="mt-1 mb-2 ml-6 p-2 rounded-lg bg-neutral-50/90 dark:bg-neutral-900/60 border border-neutral-200/60 dark:border-neutral-800 space-y-2 text-xs">
					{/* Tool identifier & execution time */}
					<div className="flex items-center justify-between text-[11px] text-neutral-400 border-b border-neutral-200/50 dark:border-neutral-800/80 pb-1">
						<span className="font-mono">工具: {step.toolName}</span>
						{step.timestamp && (
							<span className="font-mono">{step.timestamp}</span>
						)}
					</div>

					{/* Invocation arguments */}
					{step.args && Object.keys(step.args).length > 0 && (
						<div>
							<span className="text-neutral-400 text-[10.5px]">入参:</span>
							<pre className="mt-0.5 p-1.5 rounded bg-white dark:bg-neutral-950 text-neutral-800 dark:text-neutral-200 overflow-x-auto text-[11px] font-mono border border-neutral-200/60 dark:border-neutral-800">
								{JSON.stringify(step.args, null, 2)}
							</pre>
						</div>
					)}

					{/* Execution output summary */}
					{step.summary && (
						<div>
							<span className="text-neutral-400 text-[10.5px]">结果响应:</span>
							<div className="mt-0.5 p-2 rounded bg-white/80 dark:bg-neutral-950/60 text-neutral-700 dark:text-neutral-300 text-xs overflow-x-auto border border-neutral-200/60 dark:border-neutral-800">
								<AiMarkdownRenderer content={step.summary} compact={true} />
							</div>
						</div>
					)}
				</div>
			)}
		</div>
	);
});
