import { useState, useCallback, useEffect } from 'react';
import type { GrabbedContent } from '../../../src/types';

/**
 * Hook for initiating visual selector in webpage and capturing target content
 */
export function useVisualGrabber(onGrabbed?: (content: GrabbedContent) => void) {
  const [isGrabbing, setIsGrabbing] = useState(false);
  const [grabbedContent, setGrabbedContent] = useState<GrabbedContent | null>(null);

  const startGrab = useCallback(async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;

    setIsGrabbing(true);
    try {
      await chrome.tabs.sendMessage(tab.id, { type: 'START_VISUAL_GRAB' });
    } catch {
      alert('无法在当前页面启动选区拾取（请刷新目标页面或检查是否为浏览器受限页面）');
      setIsGrabbing(false);
    }
  }, []);

  useEffect(() => {
    const messageListener = (message: any) => {
      if (message.type === 'ELEMENT_GRABBED' && message.payload) {
        setGrabbedContent(message.payload);
        setIsGrabbing(false);
        onGrabbed?.(message.payload);
      }
    };

    chrome.runtime.onMessage.addListener(messageListener);
    return () => {
      chrome.runtime.onMessage.removeListener(messageListener);
    };
  }, [onGrabbed]);

  return {
    isGrabbing,
    grabbedContent,
    setGrabbedContent,
    startGrab,
  };
}
