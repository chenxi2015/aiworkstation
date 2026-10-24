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
	/** Optional draft metadata for content delivery decoupling */
	draftId?: string;
	draftKind?: "article" | "excalidraw" | "canvas";
	title?: string;
	wordCount?: number;
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
	/**
	 * Server-resolved payload for clientAction dispatch (e.g. Excalidraw
	 * library items expanded to real elements). Attached to the step_end
	 * event so the client bridge acts on this instead of the raw tool args.
	 */
	actionPayload?: Record<string, unknown>;
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
 * View prerequisite for a tool. The registry (`createAgentTools`) only
 * registers a tool when the matching view state is active:
 * - "canvas": an Obsidian .canvas board is currently open
 * - "excalidraw": an .excalidraw board is currently open
 * - "editor-document": an editor document is currently active
 * - "obsidian-note": a plain (non-board) note is currently open
 * - "rewrite-target": an editor document OR a plain note is active (the
 *   paragraph-rewrite pipeline can drive either surface)
 */
export type ToolRequiredView =
	| "canvas"
	| "excalidraw"
	| "editor-document"
	| "obsidian-note"
	| "rewrite-target";

/**
 * Client-side dispatch directive attached to a tool. Emitted on step.action so
 * the chat client can route live bridge actions (canvas rendering, rewrite
 * pipeline, draft delivery card) without name-prefix guessing.
 */
export type ToolClientAction = "canvas" | "rewrite" | "draft";

/**
 * Static metadata declared on each toolDefinition's `metadata` field.
 * Drives precise tool provisioning (requiresView) and client dispatch
 * (clientAction). executionClass is documentary.
 */
export interface AgentToolMetadata {
	executionClass: ToolExecutionClass;
	requiresView?: ToolRequiredView;
	clientAction?: ToolClientAction;
}

/** Read the AgentToolMetadata of a tool definition or instantiated tool. */
export function getAgentToolMetadata(
	tool: unknown,
): AgentToolMetadata | undefined {
	const meta = (tool as { metadata?: Record<string, unknown> } | null)
		?.metadata;
	return meta as AgentToolMetadata | undefined;
}

/**
 * Lifecycle hooks for server tool execution
 */
export interface AgentToolHooks {
	onMutated?: () => void;
	onReferencesFound?: (references: SearchResultItem[]) => void;
	onToolStart?: (
		toolName: string,
		args: Record<string, unknown>,
	) => string | undefined;
	onToolEnd?: (
		toolName: string,
		summary: string,
		ok: boolean,
		durationMs: number,
		navigation?: ToolNavigation,
		stepId?: string,
		actionPayload?: Record<string, unknown>,
	) => void;
}
