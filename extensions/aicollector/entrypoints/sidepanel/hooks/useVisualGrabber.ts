import { useState, useCallback, useEffect } from 'react';
import type { GrabbedContent, ExtensionMessage } from '../../../src/types';

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
        onGrabbed?.(message.payload);
      } else if (message.type === 'VISUAL_GRAB_CANCELLED') {
        setIsGrabbing(false);
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
    cancelGrab,
  };
}
