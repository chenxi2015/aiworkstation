import { useState, useCallback, useEffect, useRef } from 'react';
import type { SniffedStream } from '../../../src/types';
import { hlsDownloadManager } from '../../../src/utils/hlsDownloadManager';

function mergeStreams(
  tabStreams: SniffedStream[],
  persistedStreams: SniffedStream[],
  activeStreams: SniffedStream[],
): SniffedStream[] {
  const map = new Map<string, SniffedStream>();

  // 1. Active/in-progress download tasks first (highest priority)
  for (const s of activeStreams) {
    map.set(s.url, s);
  }

  // 2. Current active tab streams
  for (const s of tabStreams) {
    if (!map.has(s.url)) {
      map.set(s.url, s);
    } else {
      map.set(s.url, { ...map.get(s.url)!, ...s });
    }
  }

  // 3. Persisted streams from recently visited tabs so they don't vanish on tab switch
  for (const s of persistedStreams) {
    if (!map.has(s.url)) {
      map.set(s.url, s);
    }
  }

  return Array.from(map.values());
}

const MAX_PERSISTED_STREAMS = 25;

/**
 * Hook for HLS streams sniffed from the currently active tab and active downloads.
 * Retains sniffed streams and active/paused tasks across tab switches until explicitly cleared.
 */
export function useSniffedStreams() {
  const [streams, setStreams] = useState<SniffedStream[]>([]);
  const [tabId, setTabId] = useState<number | null>(null);
  const tabIdRef = useRef<number | null>(null);
  const tabStreamsRef = useRef<SniffedStream[]>([]);
  const persistedStreamsRef = useRef<SniffedStream[]>([]);

  const syncCombinedStreams = useCallback((current: SniffedStream[]) => {
    // Accumulate into persisted pool
    if (current.length > 0) {
      const mergedPool = [...current, ...persistedStreamsRef.current];
      const poolMap = new Map<string, SniffedStream>();
      for (const s of mergedPool) {
        if (!poolMap.has(s.url)) poolMap.set(s.url, s);
      }
      persistedStreamsRef.current = Array.from(poolMap.values()).slice(0, MAX_PERSISTED_STREAMS);
    }

    const active = hlsDownloadManager.getActiveStreams();
    const combined = mergeStreams(current, persistedStreamsRef.current, active);
    setStreams(combined);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || typeof tab.id !== 'number') {
        tabIdRef.current = null;
        setTabId(null);
        tabStreamsRef.current = [];
        syncCombinedStreams([]);
        return;
      }

      tabIdRef.current = tab.id;
      setTabId(tab.id);

      const response = await chrome.runtime.sendMessage({
        type: 'GET_HLS_STREAMS',
        tabId: tab.id,
      });
      const incoming =
        response?.success && Array.isArray(response.streams)
          ? (response.streams as SniffedStream[])
          : [];
      tabStreamsRef.current = incoming;
      syncCombinedStreams(incoming);
    } catch {
      // Background worker may be restarting; keep existing state
    }
  }, [syncCombinedStreams]);

  const clearStreams = useCallback(async () => {
    const activeTabId = tabIdRef.current;
    tabStreamsRef.current = [];
    persistedStreamsRef.current = [];
    syncCombinedStreams([]);

    if (typeof activeTabId === 'number') {
      try {
        await chrome.runtime.sendMessage({ type: 'CLEAR_HLS_STREAMS', tabId: activeTabId });
      } catch {
        // Background worker may be restarting
      }
    }
  }, [syncCombinedStreams]);

  useEffect(() => {
    refresh();

    const tabListener = () => {
      refresh();
    };
    chrome.tabs.onActivated.addListener(tabListener);
    chrome.tabs.onUpdated.addListener(tabListener);

    const messageListener = (message: any) => {
      if (message?.type !== 'HLS_STREAMS_UPDATE') return;
      const payload = message.payload;
      if (!payload || payload.tabId !== tabIdRef.current) return;
      const incoming = Array.isArray(payload.streams) ? payload.streams : [];
      tabStreamsRef.current = incoming;
      syncCombinedStreams(incoming);
    };
    chrome.runtime.onMessage.addListener(messageListener);

    // Subscribe to download manager updates to refresh active stream persistence
    const unsubscribeDownload = hlsDownloadManager.subscribe(() => {
      syncCombinedStreams(tabStreamsRef.current);
    });

    return () => {
      chrome.tabs.onActivated.removeListener(tabListener);
      chrome.tabs.onUpdated.removeListener(tabListener);
      chrome.runtime.onMessage.removeListener(messageListener);
      unsubscribeDownload();
    };
  }, [refresh, syncCombinedStreams]);

  const [isRescanning, setIsRescanning] = useState(false);

  const rescanStreams = useCallback(async () => {
    setIsRescanning(true);
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab && typeof tab.id === 'number') {
        await Promise.allSettled([
          chrome.tabs.sendMessage(tab.id, { type: 'RESCAN_PAGE_VIDEO' }).catch(() => {}),
          chrome.runtime.sendMessage({ type: 'RESCAN_ALL_FRAMES', tabId: tab.id }).catch(() => {}),
        ]);
      }
    } finally {
      setTimeout(() => {
        refresh();
        setIsRescanning(false);
      }, 500);
    }
  }, [refresh]);

  return {
    streams,
    tabId,
    refreshStreams: refresh,
    clearStreams,
    rescanStreams,
    isRescanning,
  };
}
