import { ChevronRight, Loader2 } from "lucide-react";
import { memo, useMemo, useState } from "react";
import { formatDurationMs } from "../../../../../lib/utils.ts";
import { AgentStepItem } from "./AgentStepItem.tsx";
import type { AgentStepTimelineProps } from "./types.ts";

/**
 * Modern minimalist Agent step timeline container
 */
export const AgentStepTimeline = memo(function AgentStepTimeline({
	steps = [],
	isStreaming = false,
	className = "",
	defaultOpen = true,
}: AgentStepTimelineProps) {
	const [isOpen, setIsOpen] = useState<boolean>(() => defaultOpen ?? true);
	const [expandedStepKeys, setExpandedStepKeys] = useState<Set<string>>(
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

	if (!steps || steps.length === 0) return null;

	const handleToggleStepExpand = (stepKey: string, e: React.SyntheticEvent) => {
		e.stopPropagation();
		setExpandedStepKeys((prev) => {
			const next = new Set(prev);
			if (next.has(stepKey)) {
				next.delete(stepKey);
			} else {
				next.add(stepKey);
			}
			return next;
		});
	};

	return (
		<div className={`my-1 text-sm select-none ${className}`}>
			{/* Multi-step collapse/expand toggle header (shown when more than 1 step exists) */}
			{steps.length > 1 && (
				<button
					type="button"
					onClick={() => setIsOpen((prev) => !prev)}
					className="inline-flex items-center gap-1.5 py-0.5 px-1 -ml-1 rounded text-sm text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors cursor-pointer mb-0.5"
				>
					{isStreaming ? (
						<Loader2 className="w-3 h-3 animate-spin text-neutral-400 shrink-0" />
					) : (
						<ChevronRight
							className={`w-3 h-3 text-neutral-400 transition-transform duration-150 ${
								isOpen ? "rotate-90" : ""
							}`}
						/>
					)}
					<span>
						{isStreaming ? "正在执行操作..." : `已运行 ${steps.length} 项操作`}
						{!isStreaming &&
							totalDurationMs > 0 &&
							` · ${formatDurationMs(totalDurationMs)}`}
					</span>
				</button>
			)}

			{/* Tool items stream rendered in a clean flow */}
			{isOpen && (
				<div className="space-y-0.5 py-0.5">
					{steps.map((step, idx) => {
						const stepKey = step.id ? `${step.id}-${idx}` : `step-${idx}`;
						return (
							<AgentStepItem
								key={stepKey}
								stepKey={stepKey}
								step={step}
								isExpanded={expandedStepKeys.has(stepKey)}
								onToggleExpand={handleToggleStepExpand}
							/>
						);
					})}
				</div>
			)}
		</div>
	);
});
