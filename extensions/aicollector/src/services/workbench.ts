import type { FlattenedBookmark } from '../types';

export const DEFAULT_WORKBENCH_URL = 'http://localhost:3888';
export const WORKBENCH_STORAGE_KEY = 'custom_workbench_url';

export interface CollectPayload {
  title: string;
  url: string;
  content?: string;
  meta?: Record<string, any>;
}

/**
 * Service for communicating with local AI Workstation backend
 */
export class WorkbenchService {
  /**
   * Get currently configured workbench URL
   */
  static async getWorkbenchUrl(): Promise<string> {
    try {
      const result = await chrome.storage.local.get(WORKBENCH_STORAGE_KEY);
      const customUrl = result[WORKBENCH_STORAGE_KEY];
      if (typeof customUrl === 'string' && customUrl.trim()) {
        return customUrl.trim().replace(/\/+$/, '');
      }
    } catch {
      // Fall back to default
    }
    return DEFAULT_WORKBENCH_URL;
  }

  /**
   * Set custom workbench URL
   */
  static async setWorkbenchUrl(url: string): Promise<void> {
    const cleanUrl = url.trim().replace(/\/+$/, '');
    await chrome.storage.local.set({ [WORKBENCH_STORAGE_KEY]: cleanUrl });
  }

  /**
   * Check if backend service is available
   */
  static async checkHealth(baseUrl?: string): Promise<boolean> {
    const targetUrl = baseUrl || (await this.getWorkbenchUrl());
    try {
      await fetch(targetUrl, { method: 'HEAD', mode: 'no-cors' });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Push collected article/link/selection to workbench
   */
  static async pushContent(payload: CollectPayload): Promise<{ success: boolean; offline?: boolean; message: string }> {
    const baseUrl = await this.getWorkbenchUrl();
    try {
      const response = await fetch(`${baseUrl}/api/collect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: payload.title,
          url: payload.url,
          content: payload.content || '',
          type: payload.content ? 'article' : 'link',
          siteMeta: payload.meta || {},
          createdAt: Date.now(),
        }),
      });

      if (response.ok) {
        return { success: true, message: '已成功归集到本地工作台' };
      }
      return { success: false, message: '同步失败，服务返回异常' };
    } catch {
      return { success: false, offline: true, message: '工作台未启动，已存入本地离线队列' };
    }
  }

  /**
   * Push a batch of bookmarks with full TDK and hierarchy to workbench
   */
  static async pushBookmarksBatch(
    bookmarks: FlattenedBookmark[],
  ): Promise<{ success: boolean; count: number; offline?: boolean; message: string }> {
    if (!bookmarks || bookmarks.length === 0) {
      return { success: false, count: 0, message: '没有选中的书签' };
    }

    const payload = bookmarks.map((bm) => ({
      id: bm.id,
      title: bm.title,
      url: bm.url,
      description: bm.parentTitle ? `位于目录: ${bm.folderPath || bm.parentTitle}` : '',
      keywords: bm.parentTitle || '',
      folderPath: bm.folderPath || '',
      parentTitle: bm.parentTitle || '',
      dateAdded: bm.dateAdded,
      source: 'bookmark_sync',
    }));

    const baseUrl = await this.getWorkbenchUrl();

    try {
      const response = await fetch(`${baseUrl}/api/collect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: payload,
          count: payload.length,
          type: 'bookmark_batch',
          createdAt: Date.now(),
        }),
      });

      if (response.ok) {
        return {
          success: true,
          count: bookmarks.length,
          message: `已成功将 ${bookmarks.length} 个书签同步到 AI 工作台`,
        };
      }
      return {
        success: false,
        count: bookmarks.length,
        message: '工作台服务异常响应',
      };
    } catch {
      // Save to chrome.storage offline queue
      try {
        const key = 'offline_bookmark_queue';
        const result = await chrome.storage.local.get(key);
        const existing = Array.isArray(result[key]) ? result[key] : [];
        const merged = [...existing, ...payload];
        await chrome.storage.local.set({ [key]: merged });
      } catch (err) {
        console.error('Failed to save to offline storage:', err);
      }

      return {
        success: false,
        offline: true,
        count: bookmarks.length,
        message: 'AI 工作台未开启，已暂存入离线同步队列',
      };
    }
  }
}
