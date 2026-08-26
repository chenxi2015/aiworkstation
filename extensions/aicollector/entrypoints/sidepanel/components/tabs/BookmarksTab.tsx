import React from 'react';
import { Button, InputGroup } from '@heroui/react';
import { Search, RefreshCw, Send, Calendar } from 'lucide-react';
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
 * Format timestamp to YYYY-MM-DD
 */
const formatDate = (timestamp?: number): string => {
  if (!timestamp) return '';
  const d = new Date(timestamp);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

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
      meta: {
        source: 'bookmark_explorer',
        folder: bm.parentTitle || '',
        folderPath: bm.folderPath || '',
        dateAdded: bm.dateAdded,
        bookmarkedAt: bm.dateAdded ? new Date(bm.dateAdded).toISOString() : undefined,
      },
    });
  };

  return (
    <div className="p-0 outline-none flex flex-col gap-2.5">
      {/* Sticky Header with downward gradient fade */}
      <div className="sticky top-0 z-20 -mx-3 px-3 pt-1 pb-3 bg-gradient-to-b from-background via-background via-80% to-transparent flex flex-col gap-2">
        {/* Search Bar */}
        <InputGroup className="w-full h-8 text-xs">
          <InputGroup.Prefix className="pl-2">
            <Search className="w-3 h-3 text-muted" />
          </InputGroup.Prefix>
          <InputGroup.Input
            type="text"
            placeholder="搜索书签标题、URL 或目录名称..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="text-xs h-7"
          />
          {searchQuery && (
            <InputGroup.Suffix className="pr-1.5">
              <button
                type="button"
                onClick={() => onSearchChange('')}
                className="w-3.5 h-3.5 rounded-full flex items-center justify-center text-[10px] text-muted hover:text-foreground cursor-pointer"
              >
                ✕
              </button>
            </InputGroup.Suffix>
          )}
        </InputGroup>

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
      </div>

      {/* Bookmarks List */}
      <div className="flex flex-col gap-1.5">
        {bookmarks.slice(0, 100).map((bm) => (
          <div
            key={bm.id}
            onClick={() => handleOpenBookmark(bm.url)}
            className="flex items-center justify-between p-2 rounded-lg bg-surface hover:bg-surface-secondary border border-border transition-colors cursor-pointer"
            title={`点击打开: ${bm.url}\n路径: ${bm.folderPath || '根目录'}`}
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
              <div className="overflow-hidden flex-1">
                <div className="text-xs font-medium text-foreground truncate">{bm.title}</div>
                <div className="flex items-center gap-1.5 text-[10px] text-muted truncate mt-0.5">
                  {bm.dateAdded && (
                    <span className="shrink-0 font-mono text-[10px] text-muted bg-surface-secondary px-1 py-0.5 rounded border border-border flex items-center gap-0.5">
                      <Calendar className="w-2.5 h-2.5 opacity-70" />
                      {formatDate(bm.dateAdded)}
                    </span>
                  )}
                  {bm.parentTitle && (
                    <span
                      className="shrink-0 text-muted/80 truncate max-w-[90px]"
                      title={`完整路径: ${bm.folderPath || bm.parentTitle}`}
                    >
                      📁 {bm.parentTitle}
                    </span>
                  )}
                  <span className="truncate opacity-75">{bm.url}</span>
                </div>
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
