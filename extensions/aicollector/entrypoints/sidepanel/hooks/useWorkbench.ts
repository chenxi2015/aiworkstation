import { useState, useCallback, useEffect } from 'react';
import { toast } from '@heroui/react';
import { WorkbenchService, type CollectPayload } from '../../../src/services/workbench';

/**
 * Hook for managing workbench connection status and content pushing
 */
export function useWorkbench() {
  const [isOnline, setIsOnline] = useState(false);

  const checkWorkbenchStatus = useCallback(async (showFeedback = false) => {
    const online = await WorkbenchService.checkHealth();
    setIsOnline(online);
    if (showFeedback) {
      if (online) {
        toast.success('工作台连接正常', {
          description: '已成功连通本地 AI 工作台 (localhost:3000)',
          timeout: 2500,
        });
      } else {
        toast.warning('未检测到工作台', {
          description: '本地工作台未启动，内容将暂存至离线队列',
          timeout: 3000,
        });
      }
    }
  }, []);

  const pushToWorkbench = useCallback(async (payload: CollectPayload) => {
    const displayTitle = payload.title
      ? (payload.title.length > 28 ? payload.title.slice(0, 28) + '...' : payload.title)
      : '选区内容';

    try {
      const result = await WorkbenchService.pushContent(payload);
      if (result.success) {
        toast.success('已归集到工作台', {
          description: displayTitle,
          timeout: 2500,
        });
      } else if (result.offline) {
        toast.warning('工作台未启动', {
          description: `「${displayTitle}」已暂存至本地离线队列`,
          timeout: 3200,
        });
      } else {
        toast.danger('归集失败', {
          description: result.message || '服务响应异常，请重试',
          timeout: 3500,
        });
      }
    } catch (err) {
      toast.danger('归集异常', {
        description: String(err),
        timeout: 3500,
      });
    }
  }, []);

  useEffect(() => {
    checkWorkbenchStatus(false);
  }, [checkWorkbenchStatus]);

  return {
    isOnline,
    checkWorkbenchStatus,
    pushToWorkbench,
  };
}
