import React from 'react';
import { Button } from '@heroui/react';
import { Search, RefreshCw, Send } from 'lucide-react';
import type { FlattenedBookmark } from '../../hooks/useBookmarks';
import type { CollectPayload } from '../../../../src/services/workbench';

interface BookmarksTabProps {
  searchQuery: string;
  bookmarks: FlattenedBookmark[];
  onSearchChange: (query: string) => void;
  onRefresh: () => void;
  onPushToWorkbench: (payload: CollectPayload) => void;
}

/**
 * Tab panel for searching, browsing, and collecting Chrome bookmarks
 */
export const BookmarksTab: React.FC<BookmarksTabProps> = ({
  searchQuery,
  bookmarks,
  onSearchChange,
  onRefresh,
  onPushToWorkbench,
}) => {
  const handleOpenBookmark = (url: string) => {
    chrome.tabs.create({ url });
  };

  const handleCollectBookmark = (e: React.MouseEvent, bm: FlattenedBookmark) => {
    e.stopPropagation();
    onPushToWorkbench({
      title: bm.title,
      url: bm.url,
      meta: { source: 'bookmark_explorer' },
    });
  };

  return (
    <div className="p-0 outline-none flex flex-col gap-2.5">
      {/* Search Bar */}
      <div className="relative">
        <input
          type="text"
          placeholder="搜索全量书签标题或 URL..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full bg-surface-secondary border border-border rounded-lg px-8 py-1.5 text-xs text-foreground placeholder:text-muted focus:outline-none focus:border-accent"
        />
        <Search className="w-3.5 h-3.5 text-muted absolute left-2.5 top-2.5" />
        {searchQuery && (
          <button
            onClick={() => onSearchChange('')}
            className="absolute right-2.5 top-2 text-xs text-muted hover:text-foreground cursor-pointer"
          >
            ✕
          </button>
        )}
      </div>

      {/* Header toolbar */}
      <div className="flex justify-between items-center px-0.5">
        <span className="text-[11px] text-muted">
          共找到 {bookmarks.length} 个书签
        </span>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 text-[11px] px-2 cursor-pointer"
          onClick={onRefresh}
        >
          <RefreshCw className="w-3 h-3 mr-1" />
          刷新
        </Button>
      </div>

      {/* Bookmarks List */}
      <div className="flex flex-col gap-1.5 max-h-[calc(100vh-170px)] overflow-y-auto">
        {bookmarks.slice(0, 100).map((bm) => (
          <div
            key={bm.id}
            onClick={() => handleOpenBookmark(bm.url)}
            className="flex items-center justify-between p-2 rounded-lg bg-surface hover:bg-surface-secondary border border-border transition-colors cursor-pointer"
            title={`点击打开: ${bm.url}`}
          >
            <div className="flex items-center gap-2 overflow-hidden flex-1">
              <img
                src={`https://www.google.com/s2/favicons?domain=${new URL(bm.url).hostname}&sz=32`}
                alt="fav"
                className="w-4 h-4 rounded shrink-0"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
              <div className="overflow-hidden">
                <div className="text-xs font-medium text-foreground truncate">{bm.title}</div>
                <div className="text-[11px] text-muted truncate">{bm.url}</div>
              </div>
            </div>

            <div title="归集到 AI 工作台">
              <Button
                size="sm"
                variant="ghost"
                className="shrink-0 ml-1 h-7 w-7 p-0 cursor-pointer"
                onClick={(e) => handleCollectBookmark(e, bm)}
              >
                <Send className="w-3 h-3 text-accent" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
