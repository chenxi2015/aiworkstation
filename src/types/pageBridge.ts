import type { ComponentType } from "react";

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
	/** Execution handler receiving the AI message content */
	onAction: (content: string) => Promise<void> | void;
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
	/** Optional callback to flush unsaved editor changes to backend before querying AI */
	flushSave?: () => Promise<void>;
}
