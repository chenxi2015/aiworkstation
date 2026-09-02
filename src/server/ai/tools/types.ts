import type {
	SearchResultItem,
	WorkbenchItem,
} from "../../../components/workbench/types";

/**
 * Resolved time boundary range
 */
export interface ResolvedTimeRange {
	startTimeMs?: number;
	endTimeMs?: number;
	startDateStr?: string;
	endDateStr?: string;
	description: string;
}

/**
 * Result of tool execution
 */
export interface ToolExecutionResult {
	toolName: string;
	summary: string;
	items: WorkbenchItem[];
	references: SearchResultItem[];
	isMutation?: boolean;
}

/**
 * Lifecycle hooks for server tool execution
 */
export interface BookmarkToolHooks {
	onMutated?: () => void;
	onReferencesFound?: (references: SearchResultItem[]) => void;
}
