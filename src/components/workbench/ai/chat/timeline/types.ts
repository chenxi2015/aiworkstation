import type { LucideIcon } from "lucide-react";
import type { AgentStep } from "../../../../../types/agent.ts";

/**
 * Formatted presentation data for a single tool execution step
 */
export interface FormattedStepAction {
	Icon: LucideIcon;
	actionText: string;
	targetText?: string;
}

/**
 * Strategy signature for formatting tool invocations
 */
export type ToolStrategy = (
	args: Record<string, unknown>,
	toolName: string,
) => FormattedStepAction;

/**
 * Properties for rendering an individual step item row
 */
export interface AgentStepItemProps {
	step: AgentStep;
	isExpanded: boolean;
	onToggleExpand: (stepId: string, e: React.MouseEvent) => void;
}

/**
 * Properties for rendering the overall step timeline container
 */
export interface AgentStepTimelineProps {
	steps?: AgentStep[];
	isStreaming?: boolean;
	className?: string;
	defaultOpen?: boolean;
}
