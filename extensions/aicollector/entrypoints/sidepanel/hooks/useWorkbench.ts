import { useState, useCallback, useEffect } from 'react';
import { WorkbenchService, type CollectPayload } from '../../../src/services/workbench';

/**
 * Hook for managing workbench connection status and content pushing
 */
export function useWorkbench() {
  const [isOnline, setIsOnline] = useState(false);
  const [pushStatus, setPushStatus] = useState<string | null>(null);

  const checkWorkbenchStatus = useCallback(async () => {
    const online = await WorkbenchService.checkHealth();
    setIsOnline(online);
  }, []);

  const pushToWorkbench = useCallback(async (payload: CollectPayload) => {
    setPushStatus('正在同步...');
    const result = await WorkbenchService.pushContent(payload);
    setPushStatus(result.message);
    setTimeout(() => {
      setPushStatus(null);
    }, 2800);
  }, []);

  useEffect(() => {
    checkWorkbenchStatus();
  }, [checkWorkbenchStatus]);

  return {
    isOnline,
    pushStatus,
    checkWorkbenchStatus,
    pushToWorkbench,
  };
}
