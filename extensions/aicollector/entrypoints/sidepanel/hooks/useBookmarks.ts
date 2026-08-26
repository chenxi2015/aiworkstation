import { useState, useCallback, useMemo, useEffect } from 'react';

export interface FlattenedBookmark {
  id: string;
  title: string;
  url: string;
  parentTitle?: string;
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

    function traverse(nodes: chrome.bookmarks.BookmarkTreeNode[], parentName = '') {
      for (const node of nodes) {
        if (node.url) {
          result.push({
            id: node.id,
            title: node.title || node.url,
            url: node.url,
            parentTitle: parentName,
          });
        }
        if (node.children && node.children.length > 0) {
          traverse(node.children, node.title || parentName);
        }
      }
    }

    traverse(bookmarkTree);
    return result;
  }, [bookmarkTree]);

  const filteredBookmarks = useMemo(() => {
    if (!searchQuery.trim()) return flattenedBookmarks;
    const q = searchQuery.toLowerCase();
    return flattenedBookmarks.filter(
      (b) => b.title.toLowerCase().includes(q) || b.url.toLowerCase().includes(q)
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
