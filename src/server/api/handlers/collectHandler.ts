import type { IncomingMessage, ServerResponse } from 'node:http';
import { readJsonBody, sendJson } from '../utils.ts';
import { CollectPayloadSchema } from '../schemas.ts';

/**
 * Handles /api/collect endpoints with Zod validation
 */
export async function handleCollectRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  // Dynamically import DB so schema edits do not trigger full Vite server reloads
  const { workbenchDb } = await import('../../db/sqlite.ts');

  if (req.method === 'POST') {
    try {
      const rawBody = await readJsonBody(req);
      const parsed = CollectPayloadSchema.safeParse(rawBody);
      if (!parsed.success) {
        sendJson(res, { success: false, error: parsed.error.issues[0]?.message || '采集数据格式校验未通过' }, 400);
        return;
      }

      let items: any[] = [];
      if ('items' in parsed.data && Array.isArray(parsed.data.items)) {
        items = parsed.data.items;
      } else if ('url' in parsed.data && parsed.data.url) {
        items = [parsed.data];
      }

      const count = workbenchDb.insertBookmarksBatch(items);
      sendJson(res, {
        success: true,
        count,
        message: `成功保存 ${count} 个书签至 SQLite 数据库`,
      });
    } catch (err: any) {
      sendJson(res, { success: false, error: err?.message || '处理数据失败' }, 400);
    }
    return;
  }

  if (req.method === 'GET') {
    const unclassified = workbenchDb.getUnclassifiedItems();
    sendJson(res, {
      success: true,
      count: unclassified.length,
      items: unclassified,
    });
    return;
  }

  sendJson(res, { success: false, error: 'Method not allowed' }, 405);
}
