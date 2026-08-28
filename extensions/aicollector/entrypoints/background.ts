import type { PageTDK, SyncLogItem } from '../src/types';

const WORKBENCH_API_URL = 'http://localhost:3000/api/collect';

/**
 * Append sync log item to chrome.storage
 */
async function appendSyncLog(log: SyncLogItem): Promise<void> {
  try {
    const result = await chrome.storage.local.get('sync_logs');
    const logs: SyncLogItem[] = Array.isArray(result.sync_logs) ? result.sync_logs : [];
    logs.unshift(log);
    // Keep last 100 logs
    await chrome.storage.local.set({ sync_logs: logs.slice(0, 100) });

    // Broadcast log update to sidepanel if open
    chrome.runtime.sendMessage({
      type: 'SYNC_LOG_UPDATE',
      payload: log,
    }).catch(() => {
      // Sidepanel might not be open, safe to ignore
    });
  } catch (err) {
    console.error('Failed to append sync log:', err);
  }
}

/**
 * Push collected bookmark / page to AI Workstation backend
 */
async function pushToWorkbench(data: {
  title: string;
  url: string;
  tdk: PageTDK;
  source: 'bookmark_created' | 'manual_grab';
}): Promise<boolean> {
  try {
    const response = await fetch(WORKBENCH_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: data.url,
        title: data.title,
        type: 'link',
        siteMeta: data.tdk,
        source: data.source,
        createdAt: Date.now(),
      }),
    });
    return response.ok;
  } catch (error) {
    console.warn('AI Workstation backend unreachable, item queued locally:', error);
    return false;
  }
}

/**
 * Extract TDK from matching tab or fallback to basic URL metadata
 */
async function resolveTabTDK(url: string, title?: string): Promise<PageTDK> {
  try {
    const tabs = await chrome.tabs.query({ url });
    const tab = tabs[0];
    if (tab && typeof tab.id === 'number') {
      const response = await chrome.tabs.sendMessage(tab.id, { type: 'GET_PAGE_TDK' });
      if (response?.tdk) {
        return response.tdk;
      }
    }
  } catch {
    // Tab message may fail if content script not loaded
  }

  // Fallback metadata
  return {
    title: title || url,
    description: '',
    keywords: '',
    url,
    siteName: new URL(url).hostname,
  };
}

export default defineBackground(() => {
  // 1. Configure Side Panel default behavior to open on action click
  if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
    chrome.sidePanel
      .setPanelBehavior({ openPanelOnActionClick: true })
      .catch((err: unknown) => console.warn('Failed to set panel behavior:', err));
  }

  // 2. Monitor bookmark creation
  chrome.bookmarks.onCreated.addListener(async (id: string, bookmark: chrome.bookmarks.BookmarkTreeNode) => {
    if (!bookmark.url) return; // Skip folder creation

    console.log('[AI Collector] New bookmark created:', bookmark.title, bookmark.url);

    const tdk = await resolveTabTDK(bookmark.url, bookmark.title);
    const synced = await pushToWorkbench({
      title: bookmark.title || tdk.title,
      url: bookmark.url,
      tdk,
      source: 'bookmark_created',
    });

    const log: SyncLogItem = {
      id: `log_${Date.now()}_${id}`,
      type: 'bookmark_created',
      title: bookmark.title || tdk.title,
      url: bookmark.url,
      status: synced ? 'synced' : 'queued',
      timestamp: Date.now(),
      details: synced
        ? '已成功同步至 AI 工作台'
        : '工作台离线，已在本地暂存 (等待自动同步)',
    };

    await appendSyncLog(log);
  });

  // 3. Monitor bookmark removal
  chrome.bookmarks.onRemoved.addListener(async (id: string, removeInfo: { parentId: string; index: number; node?: chrome.bookmarks.BookmarkTreeNode }) => {
    console.log('[AI Collector] Bookmark removed:', id, removeInfo);

    const log: SyncLogItem = {
      id: `log_${Date.now()}_${id}`,
      type: 'bookmark_removed',
      title: removeInfo.node?.title || '已删除书签',
      url: removeInfo.node?.url || '',
      status: 'synced',
      timestamp: Date.now(),
      details: `从文件夹 (ID: ${removeInfo.parentId}) 中移除`,
    };

    await appendSyncLog(log);
  });

// 4. Background image fetch proxy with no-referrer bypass & Tab capture proxy with Rate Limiter
  let lastCaptureCallTimestamp = 0;
  let captureQueuePromise = Promise.resolve();

  /**
   * Serialized rate-limited captureVisibleTab executor
   * Guarantees at least 650ms between successive chrome.tabs.captureVisibleTab calls
   */
  function rateLimitedCaptureVisibleTab(
    windowId: number,
    options: chrome.extensionTypes.ImageDetails = { format: 'png' },
  ): Promise<string> {
    const execute = async (): Promise<string> => {
      const minInterval = 650;
      const elapsed = Date.now() - lastCaptureCallTimestamp;
      if (elapsed < minInterval) {
        await new Promise((resolve) => setTimeout(resolve, minInterval - elapsed));
      }

      const backoffRetries = [0, 700, 1400];
      let lastErr: Error | null = null;

      for (const delay of backoffRetries) {
        if (delay > 0) {
          await new Promise((resolve) => setTimeout(resolve, delay));
        }

        try {
          const dataUrl = await new Promise<string>((resolve, reject) => {
            lastCaptureCallTimestamp = Date.now();
            chrome.tabs.captureVisibleTab(windowId, options, (res) => {
              if (chrome.runtime.lastError || !res) {
                reject(new Error(chrome.runtime.lastError?.message || 'Failed to capture visible tab'));
              } else {
                resolve(res);
              }
            });
          });

          return dataUrl;
        } catch (err: any) {
          lastErr = err;
          console.warn('[AI Collector Background] captureVisibleTab attempt warning:', err?.message);
        }
      }

      throw lastErr || new Error('Failed to capture visible tab after retries');
    };

    // Chain onto sequential promise queue
    const queuedPromise = captureQueuePromise.then(execute, execute);
    captureQueuePromise = queuedPromise.then(() => {}, () => {});
    return queuedPromise;
  }

  chrome.runtime.onMessage.addListener((message: any, sender: chrome.runtime.MessageSender, sendResponse: (response?: any) => void) => {
    if (message.type === 'CAPTURE_VISIBLE_TAB') {
      const windowId = sender.tab?.windowId ?? chrome.windows?.WINDOW_ID_CURRENT;
      rateLimitedCaptureVisibleTab(windowId, { format: 'png' })
        .then((dataUrl) => {
          sendResponse({ success: true, dataUrl });
        })
        .catch((err) => {
          console.warn('[AI Collector] Capture visible tab error:', err);
          sendResponse({
            success: false,
            error: String(err?.message || err),
          });
        });
      return true; // Keep async response channel open
    }

    if (message.type === 'FETCH_IMAGE_DATA' && message.url) {
      const { url } = message;

      fetch(url, {
        referrerPolicy: 'no-referrer',
      })
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.blob();
        })
        .then((blob) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            sendResponse({ success: true, dataUrl: reader.result });
          };
          reader.onerror = () => sendResponse({ success: false });
          reader.readAsDataURL(blob);
        })
        .catch((err) => {
          console.warn('[AI Collector] Background image fetch error:', err);
          sendResponse({ success: false, error: String(err) });
        });

      return true; // Keep async response channel open
    }
  });
});

