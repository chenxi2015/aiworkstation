import type {
	SearchResultItem,
	WorkbenchItem,
} from "../../../components/workbench/types.ts";

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
 * Navigation payload attached to a tool result, rendered by the chat UI as a
 * clickable result card that routes the user to the produced artifact.
 */
export interface ToolNavigation {
	/** Target app route (e.g. "/obsidian") */
	route: string;
	/** Route search params (e.g. { note: "path/to/file.excalidraw" }) */
	searchParams?: Record<string, string>;
	/** CTA label on the card (e.g. "打开画板") */
	label: string;
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
	navigation?: ToolNavigation;
}

/**
 * Execution dependency classification for an Agent tool.
 * - global-headless: atomic file/DB operation, no page view required
 * - content-generating: writes content into a target file; view-optional
 * - context-dependent: operates on the currently open view state, module-locked
 */
export type ToolExecutionClass =
	| "global-headless"
	| "content-generating"
	| "context-dependent";

/**
 * Lifecycle hooks for server tool execution
 */
export interface BookmarkToolHooks {
	onMutated?: () => void;
	onReferencesFound?: (references: SearchResultItem[]) => void;
	onToolStart?: (toolName: string, args: Record<string, unknown>) => string | void;
	onToolEnd?: (
		toolName: string,
		summary: string,
		ok: boolean,
		durationMs: number,
		navigation?: ToolNavigation,
		stepId?: string,
	) => void;
}
