/**
 * Page TDK and metadata structure
 */
export interface PageTDK {
  title: string;
  description: string;
  keywords: string;
  url: string;
  favicon?: string;
  ogImage?: string;
  ogTitle?: string;
  ogDescription?: string;
  canonical?: string;
  siteName?: string;
}

/**
 * Extracted video item metadata
 */
export interface GrabbedVideo {
  src: string;
  poster?: string;
  title?: string;
}

/**
 * Visual DOM element grab payload
 */
export interface GrabbedContent {
  id: string;
  url: string;
  tdk: PageTDK;
  selectedHtml: string;
  selectedText: string;
  selector: string;
  tag: string;
  dimensions: {
    width: number;
    height: number;
  };
  images: string[];
  videos?: GrabbedVideo[];
  links: string[];
  createdAt: number;
}

/**
 * Bookmark structure with enrichment state
 */
export interface BookmarkItem {
  id: string;
  title: string;
  url?: string;
  parentId?: string;
  dateAdded?: number;
  children?: BookmarkItem[];
  tdk?: Partial<PageTDK>;
  status?: 'pending' | 'synced' | 'failed';
}

/**
 * Sync log item for real-time monitoring
 */
export interface SyncLogItem {
  id: string;
  type: 'bookmark_created' | 'bookmark_removed' | 'page_grabbed' | 'manual_sync';
  title: string;
  url: string;
  status: 'synced' | 'queued' | 'failed';
  timestamp: number;
  details?: string;
}

/**
 * Chrome message action types
 */
export type ExtensionMessage =
  | { type: 'START_VISUAL_GRAB' }
  | { type: 'CANCEL_VISUAL_GRAB' }
  | { type: 'VISUAL_GRAB_CANCELLED' }
  | { type: 'GET_PAGE_TDK' }
  | { type: 'PAGE_TDK_RESULT'; payload: PageTDK }
  | { type: 'ELEMENT_GRABBED'; payload: GrabbedContent }
  | { type: 'SYNC_BOOKMARK_EVENT'; payload: { action: 'create' | 'remove'; item: BookmarkItem } }
  | { type: 'SYNC_LOG_UPDATE'; payload: SyncLogItem };
