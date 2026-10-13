import type { ComponentType } from "react";

/**
 * Declarative metadata describing which writable object an action operates on.
 * The action-proposal resolution layer reads these declarations instead of
 * module heuristics, so new modules only need to declare their targets here.
 */
export interface PageActionTarget {
	/** Object kind the action writes to */
	kind: "document" | "note";
	/** Module code owning the object (e.g. 'creator', 'obsidian') */
	module: string;
	/** Execution form shown to the user (e.g. '双栏比对改写') */
	executionForm: string;
}

/**
 * Single actionable operation exposed by the active page to the AI message bubble
 */
export interface PageAction {
	/** Unique action identifier */
	id: string;
	/** User-facing display label on the button */
	label: string;
	/** Optional Lucide icon component */
	icon?: ComponentType<{ className?: string }>;
	/** Tooltip text explaining what this action does */
	tooltip?: string;
	/** Primary visual highlight (e.g. 'primary', 'secondary') */
	variant?: "default" | "accent";
	/** 在聊天空态作为快捷入口展示（缺省不展示，仅供编程触发） */
	emptyState?: {
		title: string;
		subtitle: string;
		badge?: string;
		actionText?: string;
	};
	/** 在 AI 回复消息操作条上展示（onAction 收到该消息全文） */
	showOnMessages?: boolean;
	/** Optional target-object declaration for the action-proposal resolver */
	target?: PageActionTarget;
	/** Execution handler receiving the AI message content; may optionally
	 * return a result payload (e.g. the created document id) to the caller. */
	onAction: (content: string) => Promise<unknown> | unknown;
}

/**
 * Capability bridge registered by the active route page to the AI side panel
 */
export interface PageBridge {
	/** Module code of the active page (e.g. 'editor', 'creator') */
	module: string;
	/** List of available actions to render on AI response cards */
	actions: PageAction[];
	/** ID of the document currently active in the page */
	activeDocumentId?: number | null;
	/** Title of the document currently active in the page */
	activeDocumentTitle?: string | null;
	/** Relative path of the obsidian note currently active in the page */
	activeNotePath?: string | null;
	/** Optional callback to flush unsaved editor changes to backend before querying AI */
	flushSave?: () => Promise<void>;
}
