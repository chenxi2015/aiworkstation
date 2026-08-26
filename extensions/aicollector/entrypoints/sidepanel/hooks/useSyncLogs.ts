import { useState, useCallback, useEffect } from 'react';
import type { SyncLogItem } from '../../../src/types';

/**
 * Hook for loading, clearing, and receiving sync log items in real-time
 */
export function useSyncLogs() {
  const [syncLogs, setSyncLogs] = useState<SyncLogItem[]>([]);

  const loadSyncLogs = useCallback(async () => {
    try {
      const res = await chrome.storage.local.get('sync_logs');
      setSyncLogs(Array.isArray(res.sync_logs) ? (res.sync_logs as SyncLogItem[]) : []);
    } catch (err) {
      console.error('Failed to load sync logs:', err);
    }
  }, []);

  const clearSyncLogs = useCallback(async () => {
    try {
      await chrome.storage.local.set({ sync_logs: [] });
      setSyncLogs([]);
    } catch (err) {
      console.error('Failed to clear sync logs:', err);
    }
  }, []);

  useEffect(() => {
    loadSyncLogs();

    const messageListener = (message: any) => {
      if (message.type === 'SYNC_LOG_UPDATE' && message.payload) {
        setSyncLogs((prev) => [message.payload, ...prev.slice(0, 99)]);
      }
    };

    chrome.runtime.onMessage.addListener(messageListener);
    return () => {
      chrome.runtime.onMessage.removeListener(messageListener);
    };
  }, [loadSyncLogs]);

  return {
    syncLogs,
    loadSyncLogs,
    clearSyncLogs,
  };
}
