import { useState, useCallback, useEffect } from 'react';
import { toast } from '@heroui/react';
import type { GrabbedContent, ExtensionMessage } from '../../../src/types';

/**
 * Hook for initiating visual selector in webpage and capturing target content
 */
export function useVisualGrabber(onGrabbed?: (content: GrabbedContent) => void) {
  const [isGrabbing, setIsGrabbing] = useState(false);
  const [isCapturingFullPage, setIsCapturingFullPage] = useState(false);
  const [captureProgress, setCaptureProgress] = useState<{ slice: number; totalSlices: number; percent: number } | null>(null);
  const [grabbedContent, setGrabbedContent] = useState<GrabbedContent | null>(null);

  const startGrab = useCallback(async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;

    setIsGrabbing(true);
    try {
      await chrome.tabs.sendMessage(tab.id, { type: 'START_VISUAL_GRAB' });
    } catch {
      toast.danger('无法在当前页面启动选区拾取', {
        description: '请刷新目标页面或检查是否为浏览器受限页面',
        timeout: 3000,
      });
      setIsGrabbing(false);
    }
  }, []);

  const cancelGrab = useCallback(async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      try {
        await chrome.tabs.sendMessage(tab.id, { type: 'CANCEL_VISUAL_GRAB' });
      } catch {
        // Tab might be closed or refreshed
      }
    }
    setIsGrabbing(false);
  }, []);

  /**
   * One-click Full Page Screenshot & Content Grab
   */
  const captureFullPage = useCallback(async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      toast.danger('未找到活动标签页', { timeout: 2500 });
      return;
    }

    setIsCapturingFullPage(true);
    setCaptureProgress({ slice: 1, totalSlices: 1, percent: 5 });

    try {
      const response: { success: boolean; content?: GrabbedContent; error?: string } =
        await chrome.tabs.sendMessage(tab.id, { type: 'CAPTURE_FULL_PAGE' });

      if (response?.success && response.content) {
        setGrabbedContent(response.content);
        onGrabbed?.(response.content);
        toast.success('整页截图采集完成', {
          description: `页面尺寸: ${response.content.dimensions.width} × ${response.content.dimensions.height}`,
          timeout: 2500,
        });
      } else {
        toast.danger('整页截图失败', {
          description: response?.error || '页面未能正常响应截屏请求，请刷新后重试',
          timeout: 3000,
        });
      }
    } catch (err) {
      console.error('[AI Collector] Full page grab request error:', err);
      toast.danger('整页截图请求失败', {
        description: '请刷新目标网页后重试（部分浏览器内置页面受权限限制）',
        timeout: 3500,
      });
    } finally {
      setIsCapturingFullPage(false);
      setCaptureProgress(null);
    }
  }, [onGrabbed]);

  // Listen for global Escape key inside the sidepanel while grab is active
  useEffect(() => {
    if (!isGrabbing) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Esc') {
        e.preventDefault();
        e.stopPropagation();
        cancelGrab();
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [isGrabbing, cancelGrab]);

  // Listen for messages from content script
  useEffect(() => {
    const messageListener = (message: ExtensionMessage) => {
      if (message.type === 'ELEMENT_GRABBED' && message.payload) {
        setGrabbedContent(message.payload);
        setIsGrabbing(false);
        setIsCapturingFullPage(false);
        setCaptureProgress(null);
        onGrabbed?.(message.payload);
      } else if (message.type === 'VISUAL_GRAB_CANCELLED') {
        setIsGrabbing(false);
      } else if (message.type === 'SCREENSHOT_PROGRESS' && message.payload) {
        setCaptureProgress(message.payload);
      }
    };

    chrome.runtime.onMessage.addListener(messageListener);
    return () => {
      chrome.runtime.onMessage.removeListener(messageListener);
    };
  }, [onGrabbed]);

  const clearGrabbedContent = useCallback(() => {
    setGrabbedContent(null);
  }, []);

  return {
    isGrabbing,
    isCapturingFullPage,
    captureProgress,
    grabbedContent,
    setGrabbedContent,
    clearGrabbedContent,
    startGrab,
    cancelGrab,
    captureFullPage,
  };
}

