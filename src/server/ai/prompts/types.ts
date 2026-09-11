/**
 * Prompt definition contract for a specific module in AI Workstation
 */
export interface ModulePromptDefinition {
	/** Unique module code matching modules/registry.ts (e.g. 'editor', 'creator', 'bookmarks') */
	code: string;
	/** Professional persona and core mission of this module */
	persona: string;
	/** Specific behavioral rules and interaction principles */
	instructions?: string;
	/** Markdown layout and delivery format contract tailored to this module */
	outputContract?: string;
	/** Guidelines for calling module-specific tools (if any) */
	toolGuidelines?: string;
}

export interface BuildSystemPromptParams {
	/** Current module code (e.g. 'editor', 'creator', 'bookmarks') */
	module?: string;
	/** Formatted current local date (e.g. '2026-09-11 (星期五)') */
	dateStr: string;
	/** Formatted current local time (e.g. '06:45:00') */
	timeStr: string;
	/** Folder scope restriction prompt text */
	folderScopePrompt?: string;
	/** User injected context entities (bookmarks, folders, documents, images) prompt */
	combinedContextPrompt?: string;
	/** Semantic reference snippets retrieved from local vector index */
	contextSnippets?: string;
}
