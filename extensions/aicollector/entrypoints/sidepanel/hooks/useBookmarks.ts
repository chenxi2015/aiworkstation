import { useState, useCallback, useMemo, useEffect } from 'react';

export interface FlattenedBookmark {
  id: string;
  title: string;
  url: string;
  parentTitle?: string;
  folderPath?: string;
  dateAdded?: number;
}

/**
 * Hook for loading, flattening, and searching Chrome bookmarks
 */
export function useBookmarks() {
  const [bookmarkTree, setBookmarkTree] = useState<chrome.bookmarks.BookmarkTreeNode[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  const loadBookmarks = useCallback(async () => {
    try {
      const tree = await chrome.bookmarks.getTree();
      setBookmarkTree(tree);
    } catch (err) {
      console.error('Failed to load bookmarks:', err);
    }
  }, []);

  useEffect(() => {
    loadBookmarks();
  }, [loadBookmarks]);

  const flattenedBookmarks = useMemo(() => {
    const result: FlattenedBookmark[] = [];

    function traverse(nodes: chrome.bookmarks.BookmarkTreeNode[], pathSegments: string[] = []) {
      for (const node of nodes) {
        if (node.url) {
          result.push({
            id: node.id,
            title: node.title || node.url,
            url: node.url,
            parentTitle: pathSegments[pathSegments.length - 1] || '',
            folderPath: pathSegments.join(' / '),
            dateAdded: node.dateAdded,
          });
        }
        if (node.children && node.children.length > 0) {
          const nextSegments = node.title ? [...pathSegments, node.title] : pathSegments;
          traverse(node.children, nextSegments);
        }
      }
    }

    traverse(bookmarkTree);
    // Sort chronologically descending (newest bookmarks first)
    return result.sort((a, b) => (b.dateAdded || 0) - (a.dateAdded || 0));
  }, [bookmarkTree]);

  const filteredBookmarks = useMemo(() => {
    if (!searchQuery.trim()) return flattenedBookmarks;
    const q = searchQuery.toLowerCase();
    return flattenedBookmarks.filter(
      (b) =>
        b.title.toLowerCase().includes(q) ||
        b.url.toLowerCase().includes(q) ||
        (b.parentTitle && b.parentTitle.toLowerCase().includes(q)) ||
        (b.folderPath && b.folderPath.toLowerCase().includes(q))
    );
  }, [flattenedBookmarks, searchQuery]);

  return {
    searchQuery,
    setSearchQuery,
    loadBookmarks,
    flattenedBookmarks,
    filteredBookmarks,
  };
}
