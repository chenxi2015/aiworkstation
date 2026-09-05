import type { IncomingMessage, ServerResponse } from 'node:http';
import { readJsonBody, sendJson } from '../utils.ts';
import { CreateVideoTaskSchema, CancelVideoTaskSchema, RevealVideoTaskSchema } from '../schemas.ts';

/**
 * Handles /api/video-tasks endpoints with Zod validation
 */
export async function handleVideoTasksRequest(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
): Promise<void> {
  const { videoDownloadManager } = await import('../../services/videoDownloadManager.ts');

  if (req.method === 'GET') {
    const tasks = videoDownloadManager.getAllTasks();
    sendJson(res, { success: true, tasks });
    return;
  }

  if (req.method === 'POST') {
    try {
      const rawBody = await readJsonBody(req);

      // Handle file reveal endpoint in OS file manager
      if (pathname === '/api/video-tasks/reveal') {
        const parsed = RevealVideoTaskSchema.safeParse(rawBody);
        if (!parsed.success) {
          sendJson(res, { success: false, error: parsed.error.issues[0]?.message || '查看文件参数校验失败' }, 400);
          return;
        }
        const ok = videoDownloadManager.revealTaskFile(parsed.data);
        sendJson(res, { success: ok, error: ok ? undefined : '未找到已完成的视频文件或文件已被移动' });
        return;
      }

      // Handle cancellation endpoint
      if (pathname === '/api/video-tasks/cancel') {
        const parsed = CancelVideoTaskSchema.safeParse(rawBody);
        if (!parsed.success) {
          sendJson(res, { success: false, error: parsed.error.issues[0]?.message || '取消任务参数校验失败' }, 400);
          return;
        }
        const ok = videoDownloadManager.cancelTask(parsed.data.id);
        sendJson(res, { success: ok });
        return;
      }

      // Handle creation endpoint
      const parsed = CreateVideoTaskSchema.safeParse(rawBody);
      if (!parsed.success) {
        sendJson(res, { success: false, error: parsed.error.issues[0]?.message || '创建任务参数校验失败' }, 400);
        return;
      }

      const task = videoDownloadManager.createTask({
        url: parsed.data.url,
        pageTitle: parsed.data.pageTitle,
        pageUrl: parsed.data.pageUrl,
      });

      sendJson(res, { success: true, task });
    } catch (err: any) {
      sendJson(res, { success: false, error: err?.message || '服务器内部处理异常' }, 500);
    }
    return;
  }

  sendJson(res, { success: false, error: 'Method not allowed' }, 405);
}
