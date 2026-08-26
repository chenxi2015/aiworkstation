import { useState, useCallback, useEffect } from 'react';
import type { PageTDK } from '../../../src/types';

/**
 * Hook for extracting and listening to active Chrome tab's TDK metadata
 */
export function useCurrentTdk() {
  const [currentTdk, setCurrentTdk] = useState<PageTDK | null>(null);

  const refreshCurrentPageTDK = useCallback(async () => {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const tab = tabs[0];
      if (tab && typeof tab.id === 'number') {
        const response = await chrome.tabs.sendMessage(tab.id, { type: 'GET_PAGE_TDK' });
        if (response?.tdk) {
          setCurrentTdk(response.tdk);
          return;
        }
      }
    } catch {
      // Content script may not be injected on restricted pages
    }

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      setCurrentTdk({
        title: tab.title || '',
        description: '',
        keywords: '',
        url: tab.url || '',
        favicon: tab.favIconUrl,
        siteName: tab.url ? new URL(tab.url).hostname : '',
      });
    }
  }, []);

  useEffect(() => {
    refreshCurrentPageTDK();

    const tabListener = () => {
      refreshCurrentPageTDK();
    };
    chrome.tabs.onActivated.addListener(tabListener);
    chrome.tabs.onUpdated.addListener(tabListener);

    return () => {
      chrome.tabs.onActivated.removeListener(tabListener);
      chrome.tabs.onUpdated.removeListener(tabListener);
    };
  }, [refreshCurrentPageTDK]);

  return {
    currentTdk,
    refreshCurrentPageTDK,
  };
}
