/**
 * Screenshot Engine Module Facade
 *
 * Provides high-level coordinated area screenshots and modular access to acquisition
 * and stitching engines.
 */

import type { AreaPageRect, ScreenshotOptions, ScreenshotProgress } from './types';
import { getScrollPosition } from './domUtils';
import { acquireSlicesQueue } from './captureEngine';
import { cropSingleViewport, stitchSlicesToDataUrl } from './stitchEngine';

export * from './types';
export * from './domUtils';
export * from './captureEngine';
export * from './stitchEngine';

/**
 * Capture full-length area screenshot using seamless slice queue & post-stitching.
 *
 * Automatically chooses between instant single-viewport crop and multi-step scrolling capture.
 */
export async function captureAndCropArea(
  pageRect: AreaPageRect,
  onProgress?: (progress: ScreenshotProgress) => void,
  options: ScreenshotOptions = {},
): Promise<string | undefined> {
  if (!pageRect || pageRect.width <= 0 || pageRect.height <= 0) {
    return undefined;
  }

  const { x: initialScrollX, y: initialScrollY } = getScrollPosition(window);
  const viewportW = window.innerWidth || document.documentElement.clientWidth || 1;
  const viewportH = window.innerHeight || document.documentElement.clientHeight || 1;

  // Check if target area is already completely within the current viewport
  const isFullyVisibleInCurrentViewport =
    pageRect.height <= viewportH &&
    pageRect.width <= viewportW &&
    pageRect.top >= initialScrollY &&
    pageRect.top + pageRect.height <= initialScrollY + viewportH &&
    pageRect.left >= initialScrollX &&
    pageRect.left + pageRect.width <= initialScrollX + viewportW;

  if (isFullyVisibleInCurrentViewport) {
    console.log('[AI Collector] 选区已完全处于当前视口内，执行快速单视口捕获');
    try {
      const response: { success: boolean; dataUrl?: string; error?: string } =
        await chrome.runtime.sendMessage({ type: 'CAPTURE_VISIBLE_TAB' });
      if (response?.success && response.dataUrl) {
        return await cropSingleViewport(
          response.dataUrl,
          pageRect,
          viewportW,
          viewportH,
          options.backgroundColor,
        );
      }
    } catch (err) {
      console.warn('[AI Collector] Single viewport capture message failed:', err);
    }
    return undefined;
  }

  console.group(
    '%c🚀 [AI Collector 滚动截图开始]',
    'font-weight: bold; color: #4338ca; background: #e0e7ff; padding: 4px 8px; border-radius: 4px;',
  );
  console.log('🎯 目标区域 (pageRect):', pageRect);

  let cleanup: (() => void) | undefined;

  try {
    // 1. Acquire all captured slices
    const acquisition = await acquireSlicesQueue(pageRect, onProgress, options);
    cleanup = acquisition.cleanup;

    if (!acquisition.slices.length) {
      console.warn('[AI Collector] 切片队列为空，截屏终止');
      console.groupEnd();
      return undefined;
    }

    if (onProgress) {
      onProgress({
        slice: acquisition.slices.length,
        totalSlices: acquisition.slices.length,
        percent: 90,
      });
    }

    // 2. Seamlessly stitch slices
    const finalScreenshotUrl = await stitchSlicesToDataUrl(
      acquisition.slices,
      pageRect,
      acquisition.targetEndY,
      acquisition.viewportW,
      acquisition.viewportH,
      options,
    );

    if (onProgress) {
      onProgress({
        slice: acquisition.slices.length,
        totalSlices: acquisition.slices.length,
        percent: 100,
      });
    }

    // Attach debugging artifact to window for developer inspection
    (window as any).__AI_COLLECTOR_DEBUG__ = {
      pageRect,
      slices: acquisition.slices,
      finalScreenshot: finalScreenshotUrl,
      timestamp: new Date().toISOString(),
    };

    console.log(
      '%c🎉 [AI Collector 滚动长截图完成]',
      'font-weight: bold; color: #16a34a; background: #dcfce7; padding: 2px 8px; border-radius: 4px;',
    );
    console.groupEnd();

    return finalScreenshotUrl;
  } catch (error) {
    console.warn('[AI Collector] Long screenshot capture failed:', error);
    console.groupEnd();
    return undefined;
  } finally {
    if (cleanup) {
      cleanup();
    }
  }
}
