import type { PageTDK } from '../types';

export const DEFAULT_WORKBENCH_URL = 'http://localhost:3000';
export const WORKBENCH_COLLECT_API = `${DEFAULT_WORKBENCH_URL}/api/collect`;

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
   * Check if backend service is available
   */
  static async checkHealth(baseUrl: string = DEFAULT_WORKBENCH_URL): Promise<boolean> {
    try {
      await fetch(baseUrl, { method: 'HEAD', mode: 'no-cors' });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Push collected article/link/selection to workbench
   */
  static async pushContent(payload: CollectPayload): Promise<{ success: boolean; offline?: boolean; message: string }> {
    try {
      const response = await fetch(WORKBENCH_COLLECT_API, {
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
}
