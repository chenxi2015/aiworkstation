import { ScrollShadow } from "@heroui/react";
import { ChevronRight, Loader2 } from "lucide-react";
import { memo, useMemo, useState } from "react";
import { formatDurationMs } from "../../../../../lib/utils.ts";
import { AgentStepItem } from "./AgentStepItem.tsx";
import type { AgentStepTimelineProps } from "./types.ts";

/**
 * Modern minimalist Agent step timeline container wrapped in ScrollShadow
 */
export const AgentStepTimeline = memo(function AgentStepTimeline({
	steps = [],
	isStreaming = false,
	className = "",
	defaultOpen = true,
}: AgentStepTimelineProps) {
	const [isOpen, setIsOpen] = useState<boolean>(() => defaultOpen ?? true);
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

	if (!steps || steps.length === 0) return null;

	const handleToggleStepExpand = (id: string, e: React.MouseEvent) => {
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
		<div className={`my-1 text-sm select-none ${className}`}>
			{/* Multi-step collapse/expand toggle header (shown when more than 1 step exists) */}
			{steps.length > 1 && (
				<button
					type="button"
					onClick={() => setIsOpen((prev) => !prev)}
					className="inline-flex items-center gap-1.5 py-0.5 px-1 -ml-1 rounded text-xs text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors cursor-pointer mb-0.5"
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

			{/* Tool items stream wrapped in bounded ScrollShadow */}
			{isOpen && (
				<ScrollShadow
					className="max-h-[200px] overflow-y-auto space-y-0.5 pr-1 py-0.5"
					size={16}
				>
					{steps.map((step, idx) => (
						<AgentStepItem
							key={step.id || idx}
							step={step}
							isExpanded={expandedStepIds.has(step.id)}
							onToggleExpand={handleToggleStepExpand}
						/>
					))}
				</ScrollShadow>
			)}
		</div>
	);
});
