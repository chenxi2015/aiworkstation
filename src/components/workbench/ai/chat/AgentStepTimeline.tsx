/**
 * AgentStepTimeline entry point re-exporting from the modular timeline package
 */
export { AgentStepTimeline } from "./timeline/AgentStepTimeline.tsx";
export type {
	AgentStepItemProps,
	AgentStepTimelineProps,
	FormattedStepAction,
	ToolStrategy,
} from "./timeline/types.ts";
export {
	extractDiffStat,
	extractTargetText,
	formatStepAction,
	getFileName,
	TOOL_STRATEGIES,
} from "./timeline/toolStrategies.ts";
