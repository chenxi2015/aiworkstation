import { useState, useCallback, useEffect, useRef } from 'react';
import type { SniffedStream } from '../../../src/types';

/**
 * Hook for HLS streams sniffed from the currently active tab.
 * Loads the initial list from the background worker and follows live
 * HLS_STREAMS_UPDATE broadcasts.
 */
export function useSniffedStreams() {
  const [streams, setStreams] = useState<SniffedStream[]>([]);
  const [tabId, setTabId] = useState<number | null>(null);
  const tabIdRef = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || typeof tab.id !== 'number') {
        tabIdRef.current = null;
        setTabId(null);
        setStreams([]);
        return;
      }

      tabIdRef.current = tab.id;
      setTabId(tab.id);

      const response = await chrome.runtime.sendMessage({
        type: 'GET_HLS_STREAMS',
        tabId: tab.id,
      });
      setStreams(
        response?.success && Array.isArray(response.streams)
          ? (response.streams as SniffedStream[])
          : [],
      );
    } catch {
      // Background worker may be restarting; keep existing state
    }
  }, []);

  const clearStreams = useCallback(async () => {
    const activeTabId = tabIdRef.current;
    if (typeof activeTabId !== 'number') return;
    setStreams([]);
    try {
      await chrome.runtime.sendMessage({ type: 'CLEAR_HLS_STREAMS', tabId: activeTabId });
    } catch {
      // Background worker may be restarting
    }
  }, []);

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
      setStreams(Array.isArray(payload.streams) ? payload.streams : []);
    };
    chrome.runtime.onMessage.addListener(messageListener);

    return () => {
      chrome.tabs.onActivated.removeListener(tabListener);
      chrome.tabs.onUpdated.removeListener(tabListener);
      chrome.runtime.onMessage.removeListener(messageListener);
    };
  }, [refresh]);

  return {
    streams,
    tabId,
    refreshStreams: refresh,
    clearStreams,
  };
}
