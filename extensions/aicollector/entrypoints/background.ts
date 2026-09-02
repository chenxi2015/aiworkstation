import type { PageTDK, SniffedStream, SyncLogItem } from '../src/types';
import { DEFAULT_WORKBENCH_URL, WORKBENCH_STORAGE_KEY } from '../src/services/workbench';

async function getWorkbenchBaseUrl(): Promise<string> {
  try {
    const result = await chrome.storage.local.get(WORKBENCH_STORAGE_KEY);
    const custom = result[WORKBENCH_STORAGE_KEY];
    if (typeof custom === 'string' && custom.trim()) {
      return custom.trim().replace(/\/+$/, '');
    }
  } catch {
    // Fall back to default
  }
  return DEFAULT_WORKBENCH_URL;
}

/**
 * Per-tab sniffed HLS streams storage.
 * Prefers chrome.storage.session (survives service worker restarts) with an
 * in-memory fallback for environments where it is unavailable.
 */
const HLS_STREAMS_KEY_PREFIX = 'hls_streams_';
const MAX_STREAMS_PER_TAB = 30;
const memoryStreams = new Map<number, SniffedStream[]>();

async function readHlsStreams(tabId: number): Promise<SniffedStream[]> {
  try {
    const result = await chrome.storage.session.get(HLS_STREAMS_KEY_PREFIX + tabId);
    const list = result[HLS_STREAMS_KEY_PREFIX + tabId];
    if (Array.isArray(list)) return list as SniffedStream[];
  } catch {
    // storage.session unavailable, fall back to memory
  }
  return memoryStreams.get(tabId) || [];
}

async function writeHlsStreams(tabId: number, streams: SniffedStream[]): Promise<void> {
  try {
    await chrome.storage.session.set({ [HLS_STREAMS_KEY_PREFIX + tabId]: streams });
    memoryStreams.delete(tabId);
    return;
  } catch {
    // storage.session unavailable, fall back to memory
  }
  memoryStreams.set(tabId, streams);
}

function broadcastHlsStreams(tabId: number, streams: SniffedStream[]): void {
  chrome.runtime
    .sendMessage({
      type: 'HLS_STREAMS_UPDATE',
      payload: { tabId, streams },
    })
    .catch(() => {
      // Sidepanel might not be open, safe to ignore
    });
}

interface HlsPlaylistInfo {
  role: 'master' | 'media';
  /** Absolute URLs of variant + rendition playlists referenced by a master */
  children: string[];
  hasAudio?: boolean;
  bestResolution?: string;
  variantCount?: number;
}

/**
 * Fetches and classifies an m3u8 playlist. Master playlists list their
 * variant/audio child playlists, which lets us group one video's multiple
 * network entries (e.g. Twitter splits video and audio tracks) into a
 * single downloadable stream.
 */
async function classifyHlsPlaylist(url: string): Promise<HlsPlaylistInfo | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    let res: Response;
    try {
      res = await fetch(url, { credentials: 'omit', signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) return null;
    const text = await res.text();
    if (!text.includes('#EXTM3U')) return null;

    if (text.includes('#EXT-X-STREAM-INF')) {
      const children: string[] = [];
      const lines = text.split('\n').map((l) => l.trim());
      let bestResolution: string | undefined;
      let bestArea = 0;
      let variantCount = 0;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i] ?? '';

        if (line.startsWith('#EXT-X-MEDIA')) {
          const uriMatch = line.match(/URI="([^"]+)"/);
          if (uriMatch?.[1]) {
            try {
              children.push(new URL(uriMatch[1], url).href);
            } catch {
              // Skip unresolvable rendition URI
            }
          }
          continue;
        }

        if (line.startsWith('#EXT-X-STREAM-INF')) {
          variantCount++;
          const resMatch = line.match(/RESOLUTION=(\d+)x(\d+)/);
          if (resMatch) {
            const area = Number(resMatch[1]) * Number(resMatch[2]);
            if (area > bestArea) {
              bestArea = area;
              bestResolution = `${resMatch[1]}x${resMatch[2]}`;
            }
          }
          // Variant URI sits on the next non-empty, non-comment line
          for (let j = i + 1; j < lines.length; j++) {
            const uri = lines[j];
            if (!uri) continue;
            if (uri.startsWith('#')) break;
            try {
              children.push(new URL(uri, url).href);
            } catch {
              // Skip unresolvable variant URI
            }
            break;
          }
        }
      }

      return {
        role: 'master',
        children,
        hasAudio: /#EXT-X-MEDIA:[^\n]*TYPE=AUDIO[^\n]*URI="/.test(text),
        bestResolution,
        variantCount,
      };
    }

    if (text.includes('#EXTINF')) {
      return { role: 'media', children: [] };
    }

    return null;
  } catch {
    // Network/CORS/abort failure: keep the stream listed as-is
    return null;
  }
}

/**
 * Registers a sniffed playlist for a tab, classifying it so that variant and
 * audio-track playlists collapse into their master playlist entry.
 */
async function registerHlsStream(
  tabId: number,
  payload: { url: string; pageUrl: string; pageTitle?: string; via?: string },
): Promise<void> {
  const streams = await readHlsStreams(tabId);
  if (streams.some((s) => s.url === payload.url)) return;

  const stream: SniffedStream = {
    url: payload.url,
    via: payload.via,
    pageUrl: payload.pageUrl,
    pageTitle: payload.pageTitle,
    detectedAt: Date.now(),
  };

  const info = await classifyHlsPlaylist(payload.url);
  if (info) {
    stream.role = info.role;
    if (info.role === 'master') {
      stream.children = info.children;
      stream.hasAudio = info.hasAudio;
      stream.bestResolution = info.bestResolution;
      stream.variantCount = info.variantCount;
      // Hide child playlists that were sniffed before this master arrived
      for (const existing of streams) {
        if (info.children.includes(existing.url)) {
          existing.hidden = true;
        }
      }
    } else {
      // Hide this media playlist when an existing master already claims it
      const parent = streams.find(
        (s) => s.role === 'master' && s.children?.includes(stream.url),
      );
      if (parent) stream.hidden = true;
    }
  }

  const next = [stream, ...streams].slice(0, MAX_STREAMS_PER_TAB);
  await writeHlsStreams(tabId, next);
  broadcastHlsStreams(tabId, next);
}

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
    const baseUrl = await getWorkbenchBaseUrl();
    const response = await fetch(`${baseUrl}/api/collect`, {
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

  // 4. Sniffed HLS stream housekeeping: reset a tab's stream list when it
  // navigates to a new document, and drop it entirely when the tab closes.
  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.status === 'loading' && changeInfo.url) {
      memoryStreams.delete(tabId);
      chrome.storage.session.remove(HLS_STREAMS_KEY_PREFIX + tabId).catch(() => {});
      broadcastHlsStreams(tabId, []);
    }
  });

  chrome.tabs.onRemoved.addListener((tabId) => {
    memoryStreams.delete(tabId);
    chrome.storage.session.remove(HLS_STREAMS_KEY_PREFIX + tabId).catch(() => {});
  });

// 5. Background image fetch proxy with no-referrer bypass & Tab capture proxy with Rate Limiter
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
    if (message.type === 'HLS_STREAM_DETECTED' && message.payload?.url) {
      const tabId = sender.tab?.id;
      if (typeof tabId !== 'number') return;

      registerHlsStream(tabId, {
        url: message.payload.url,
        via: message.payload.via,
        pageUrl: message.payload.pageUrl || sender.tab?.url || '',
        pageTitle: message.payload.pageTitle || sender.tab?.title || '',
      });
      return;
    }

    if (message.type === 'GET_HLS_STREAMS' && typeof message.tabId === 'number') {
      readHlsStreams(message.tabId)
        .then((streams) => sendResponse({ success: true, streams }))
        .catch(() => sendResponse({ success: false, streams: [] }));
      return true; // Keep async response channel open
    }

    if (message.type === 'CLEAR_HLS_STREAMS' && typeof message.tabId === 'number') {
      (async () => {
        memoryStreams.delete(message.tabId);
        try {
          await chrome.storage.session.remove(HLS_STREAMS_KEY_PREFIX + message.tabId);
        } catch {
          // storage.session unavailable
        }
        broadcastHlsStreams(message.tabId, []);
        sendResponse({ success: true });
      })();
      return true; // Keep async response channel open
    }

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
      const { url, pageUrl } = message;

      const fetchWithTimeout = async (targetUrl: string, options: RequestInit, timeoutMs = 8000) => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
          return await fetch(targetUrl, { ...options, signal: controller.signal });
        } finally {
          clearTimeout(timer);
        }
      };

      const executeSmartFetch = async (): Promise<Blob> => {
        // Attempt 1: If pageUrl provided, try with pageUrl as referer (helps with strict hotlink-protected sites)
        if (pageUrl && pageUrl.startsWith('http')) {
          try {
            const res = await fetchWithTimeout(url, {
              headers: { Referer: pageUrl },
              credentials: 'omit',
            });
            if (res.ok) {
              const blob = await res.blob();
              if (blob.size > 0) return blob;
            }
          } catch {
            // Fallback to next attempt
          }
        }

        // Attempt 2: Try no-referrer policy (helps with sites that only allow empty referer)
        try {
          const res = await fetchWithTimeout(url, {
            referrerPolicy: 'no-referrer',
            credentials: 'omit',
          });
          if (res.ok) {
            const blob = await res.blob();
            if (blob.size > 0) return blob;
          }
        } catch {
          // Fallback to direct fetch
        }

        // Attempt 3: Standard direct fetch
        const res = await fetchWithTimeout(url, { credentials: 'omit' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.blob();
      };

      executeSmartFetch()
        .then((blob) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            sendResponse({ success: true, dataUrl: reader.result });
          };
          reader.onerror = () => sendResponse({ success: false, error: 'FileReader failed' });
          reader.readAsDataURL(blob);
        })
        .catch((err) => {
          console.warn('[AI Collector] Background smart image fetch failed:', err?.message || err);
          sendResponse({ success: false, error: String(err?.message || err) });
        });

      return true; // Keep async response channel open
    }
  });
});
