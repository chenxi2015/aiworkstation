/**
 * Types representing contextual attachments injected into the AI chat input
 */
export type ChatContextType = "bookmark" | "folder" | "tag" | "image" | "file";

export interface ChatContextItem {
	/** Unique identifier for keying in UI and state */
	id: string;
	/** Context item type category */
	type: ChatContextType;
	/** Primary display label */
	title: string;
	/** Secondary hint (e.g. host domain, item count) */
	subtitle?: string;
	/** Optional link target for bookmarks */
	url?: string;
	/** Optional folder id if type === 'folder' */
	folderId?: number;
	/** Optional tag name if type === 'tag' */
	tag?: string;
	/** Optional favicon or custom icon identifier */
	icon?: string;
	/** Base64 preview data or URL for images/files */
	thumbnail?: string;
	/** Extra payload storage for future agent tools */
	data?: Record<string, unknown>;
}
