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
  /**
   * Sniffed HLS playlist URL matched to this video element.
   * Set when the element src is an undownloadable blob: URL and a
   * sniffed stream correlates with it (e.g. shared video ID tokens).
   */
  hlsUrl?: string;
}

/**
 * HLS stream sniffed from page network activity (m3u8 playlist URL)
 */
export interface SniffedStream {
  /** Playlist URL, also used as the dedupe key */
  url: string;
  pageUrl: string;
  pageTitle?: string;
  /** Detection channel: fetch / xhr / performance */
  via?: string;
  detectedAt: number;
  /** Playlist kind resolved by fetching/parsing the playlist content */
  role?: 'master' | 'media';
  /** Child playlists (variant / audio rendition URLs) of a master playlist */
  children?: string[];
  /** True when this playlist belongs to a master and should not be listed */
  hidden?: boolean;
  /** Master playlist declares a separate audio track (EXT-X-MEDIA) */
  hasAudio?: boolean;
  /** Best resolution advertised by a master playlist, e.g. "1280x720" */
  bestResolution?: string;
  /** Number of variant streams in a master playlist */
  variantCount?: number;
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
  screenshot?: string;
  pageRect?: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
  /** Window scroll position at grab time, used to restore the exact viewport before re-capture */
  pageScroll?: {
    x: number;
    y: number;
  };
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

export interface FlattenedBookmark {
  id: string;
  title: string;
  url: string;
  parentTitle?: string;
  folderPath?: string;
  dateAdded?: number;
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
  | { type: 'CAPTURE_VISIBLE_TAB' }
  | { type: 'CAPTURE_FULL_PAGE' }
  | {
      type: 'CAPTURE_AREA_SCREENSHOT';
      payload: { pageRect: { left: number; top: number; width: number; height: number } };
    }
  | {
      type: 'SCROLL_TO_AREA';
      payload: {
        pageRect: { left: number; top: number; width: number; height: number };
        pageScroll?: { x: number; y: number };
      };
    }
  | { type: 'SYNC_BOOKMARK_EVENT'; payload: { action: 'create' | 'remove'; item: BookmarkItem } }
  | { type: 'SYNC_LOG_UPDATE'; payload: SyncLogItem }
  | {
      type: 'SCREENSHOT_PROGRESS';
      payload: { slice: number; totalSlices: number; percent: number };
    }
  | { type: 'READ_PAGE_BLOB'; blobUrl: string }
  | { type: 'EXTRACT_IMAGE_CANVAS'; imageUrl: string }
  | {
      type: 'HLS_STREAM_DETECTED';
      payload: { url: string; pageUrl: string; pageTitle?: string; via?: string };
    }
  | { type: 'GET_HLS_STREAMS'; tabId: number }
  | { type: 'CLEAR_HLS_STREAMS'; tabId: number }
  | { type: 'HLS_STREAMS_UPDATE'; payload: { tabId: number; streams: SniffedStream[] } }
  | { type: 'RESCAN_PAGE_VIDEO' };
