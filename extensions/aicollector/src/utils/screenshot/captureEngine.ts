/**
 * Slice Queue Acquisition Engine (步进录制采集引擎)
 *
 * Implements multi-step scroll trajectory planning, floating element concealment,
 * viewport rendering settlement, and guaranteed seamless slice collection.
 * Supports intelligent detection of nested scrollable containers.
 *
 * Coordinate model (unified for window scroll and nested containers):
 * every slice records a virtual `scrollX/scrollY` such that for any client
 * point (cx, cy) in the captured frame: pageX = cx + scrollX, pageY = cy + scrollY.
 * Additionally each slice records the client-space rect (offsetX/offsetY/width/height)
 * of the area that actually contains scrolled target content — for nested
 * containers this is the container's visible box, which is smaller than the
 * full viewport. Coverage, gap detection and stitching all operate on that
 * effective region, so static page chrome around a nested container is never
 * mistaken for scrolled content.
 */

import type { AreaPageRect, CapturedSlice, ScreenshotOptions, ScreenshotProgress } from './types';
import {
  createFloatingElementController,
  findScrollContainer,
  getMaxScroll,
  getScrollPosition,
  injectScreenshotStyles,
  nextFrame,
  robustScrollTo,
  sleep,
  waitForScrollSettled,
  waitForViewportImages,
} from './domUtils';

/**
 * chrome.tabs.captureVisibleTab is quota-limited (MAX 2 calls per second).
 * Track the last finished capture so calls are paced, and retry with
 * progressive backoff instead of aborting the whole run on a quota error.
 */
async function captureTabFrame(): Promise<string | undefined> {
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response: { success: boolean; dataUrl?: string; error?: string } =
        await chrome.runtime.sendMessage({ type: 'CAPTURE_VISIBLE_TAB' });
      if (response?.success && response.dataUrl) {
        return response.dataUrl;
      }
      console.warn(`[AI Collector] captureVisibleTab attempt #${attempt} warning:`, response?.error);
    } catch (err) {
      console.warn(`[AI Collector] captureVisibleTab messaging attempt #${attempt} failed:`, err);
    }

    if (attempt < maxAttempts) {
      await sleep(300 * attempt);
    }
  }
  return undefined;
}


/**
 * Acquire in-memory slice queue with guaranteed coverage and seamless overlap
 */
export async function acquireSlicesQueue(
  pageRect: AreaPageRect,
  onProgress?: (progress: ScreenshotProgress) => void,
  options: ScreenshotOptions = {},
): Promise<{
  slices: CapturedSlice[];
  viewportW: number;
  viewportH: number;
  targetEndY: number;
  cleanup: () => void;
}> {
  const { overlapRatio = 0.45, maxSlices = 60 } = options;

  let restoreFloating: (() => void) | null = null;
  let restoreStyles: (() => void) | null = null;

  const viewportW = window.innerWidth || document.documentElement.clientWidth || 1;
  const viewportH = window.innerHeight || document.documentElement.clientHeight || 1;

  // 1. Intelligent Scroll Container Detection (before any scrolling on our side,
  // so the probe still sees the page exactly as the user left it)
  const scrollContainer = findScrollContainer(pageRect);
  const isGlobalScroll = scrollContainer === window;

  const isFullPage =
    pageRect.left <= 10 &&
    pageRect.top <= 80 &&
    pageRect.width >= Math.floor(viewportW * 0.85);

  // Track initial state of both global window and the chosen container
  const initialGlobalX = window.scrollX || 0;
  const initialGlobalY = window.scrollY || 0;
  const { x: initialScrollX, y: initialScrollY } = getScrollPosition(scrollContainer);

  // 2. Effective content viewport inside each captured frame.
  // Global scroll OR Full-Page SPA capture: the whole frame is scrolled content.
  // Nested local box selection: only the container's visible client box holds scrolled
  // content; everything around it is static chrome that must be ignored.
  let viewOffsetX = 0;
  let viewOffsetY = 0;
  let viewW = viewportW;
  let viewH = viewportH;
  if (!isGlobalScroll && !isFullPage) {
    const rect = (scrollContainer as Element).getBoundingClientRect();
    viewOffsetX = Math.max(0, Math.round(rect.left));
    viewOffsetY = Math.max(0, Math.round(rect.top));
    viewW = Math.max(1, Math.round(Math.min(rect.right, viewportW)) - viewOffsetX);
    viewH = Math.max(1, Math.round(Math.min(rect.bottom, viewportH)) - viewOffsetY);
  }

  // Cleanup helper ensuring all DOM states and scroll positions are strictly restored
  const cleanup = () => {
    if (restoreFloating) {
      restoreFloating();
      restoreFloating = null;
    }
    robustScrollTo(scrollContainer, initialScrollX, initialScrollY);
    if (restoreStyles) {
      restoreStyles();
      restoreStyles = null;
    }
  };

  // Suppress scrollbars and disable smooth scrolling transitions
  restoreStyles = injectScreenshotStyles();

  // Neutralize sticky elements to static and handle fixed headers before scrolling begins
  const floatingController = createFloatingElementController(pageRect);
  restoreFloating = floatingController.restore;
  await sleep(30);
  await nextFrame();

  // 3. Compute the starting scroll target so capture begins at the selection's
  // leading edge for BOTH global and nested scrolling.
  // Nested: the container-local content coordinate of the selection top derives
  // from its current displayed position: contentTop = s0 + (pageTop - w0 - containerClientTop).
  let startTargetY: number;
  let effectiveTotalHeight = pageRect.height;
  if (isGlobalScroll) {
    startTargetY = Math.max(0, pageRect.top <= 80 ? 0 : pageRect.top);
  } else {
    const containerEl = scrollContainer as HTMLElement;
    const rect = containerEl.getBoundingClientRect();
    const contentTop = pageRect.top - initialGlobalY - rect.top + initialScrollY;
    const { maxY } = getMaxScroll(scrollContainer);
    startTargetY = isFullPage ? 0 : Math.max(0, Math.min(contentTop, maxY));

    // If the nested container has scrollable content, ensure effectiveTotalHeight covers it
    if (containerEl.scrollHeight > containerEl.clientHeight + 10) {
      effectiveTotalHeight = Math.max(effectiveTotalHeight, containerEl.scrollHeight);
    }
  }

  const totalHeight = Math.min(Math.max(1, effectiveTotalHeight), 32000);

  // The target end Y in the unified page coordinate space (for the stitch engine)
  const targetEndY = pageRect.top + totalHeight;

  // Conservative step size ensuring at least 40% - 45% overlap between frames,
  // based on the EFFECTIVE content viewport height (not the full window height)
  const stepSize = Math.max(120, Math.floor(viewH * (1 - overlapRatio)));
  const estimatedSlices = Math.max(1, Math.ceil(totalHeight / stepSize));
  // Never let the safety cap truncate a legitimately long capture
  const sliceBudget = Math.max(maxSlices, estimatedSlices + 10);

  const slicesQueue: CapturedSlice[] = [];
  let nextScrollTargetY = startTargetY;
  let sliceIndex = 0;

  while (sliceIndex < sliceBudget) {
    // Scroll to planned target position on the specific container
    robustScrollTo(scrollContainer, isGlobalScroll ? pageRect.left : initialScrollX, nextScrollTargetY);
    await waitForScrollSettled(scrollContainer, nextScrollTargetY, 500);

    // Re-enforce sticky neutralization and floating element suppression after scroll event
    floatingController.enforce();

    // Wait for dynamic DOM elements, lazy-loaded images & web fonts
    await waitForViewportImages(400);

    // Re-enforce once more after image/font loading and layout changes
    floatingController.enforce();

    // Pacing delay to ensure GPU render tree commitment
    await sleep(90);
    await nextFrame();

    // Capture visible tab frame (quota-paced with backoff retries)
    const posBefore = getScrollPosition(scrollContainer);
    let dataUrl = await captureTabFrame();
    if (!dataUrl) {
      console.warn('[AI Collector] Capture visible tab failed at slice:', sliceIndex);
      break;
    }

    // Stale-frame guard: if the page shifted while the frame was being captured
    // (scroll anchoring, late layout), settle and retake once so the recorded
    // coordinates always match the pixels.
    let posAfter = getScrollPosition(scrollContainer);
    if (Math.abs(posAfter.y - posBefore.y) > 2 || Math.abs(posAfter.x - posBefore.x) > 2) {
      await waitForScrollSettled(scrollContainer, posAfter.y, 400);
      floatingController.enforce();
      await sleep(80);
      await nextFrame();
      const retaken = await captureTabFrame();
      if (retaken) {
        dataUrl = retaken;
      }
      posAfter = getScrollPosition(scrollContainer);
    }

    // Unified coordinate transformation: for nested containers, map the
    // container's scroll delta onto the global coordinate space so the stitch
    // engine can process all modes universally without modification.
    const virtualScrollX = isGlobalScroll
      ? posAfter.x
      : initialGlobalX + (posAfter.x - initialScrollX);
    const virtualScrollY = isGlobalScroll
      ? posAfter.y
      : initialGlobalY + (posAfter.y - initialScrollY);

    // Gap protection: the effective coverage of the previous slice ends at
    // scrollY + offsetY + height; if this slice starts beyond it, an unexpected
    // scroll jump happened and we fill the gap with an intermediate capture.
    const prevSlice = slicesQueue[slicesQueue.length - 1];
    const prevCoverageBottom = prevSlice
      ? prevSlice.scrollY + prevSlice.offsetY + prevSlice.height
      : 0;
    if (prevSlice && virtualScrollY + viewOffsetY > prevCoverageBottom + 8) {
      console.log('[AI Collector] Detected scroll jump, performing compensating capture at intermediate position');
      const safeIntermediateY = prevSlice.scrollY + Math.floor(viewH * 0.5);

      // Translate the safe virtual Y back to the container's local coordinate
      const localSafeY = isGlobalScroll
        ? safeIntermediateY
        : initialScrollY + (safeIntermediateY - initialGlobalY);

      robustScrollTo(scrollContainer, isGlobalScroll ? pageRect.left : initialScrollX, localSafeY);
      await waitForScrollSettled(scrollContainer, localSafeY, 400);
      floatingController.enforce();
      await waitForViewportImages(250);
      floatingController.enforce();
      await sleep(60);
      const intermediateDataUrl = await captureTabFrame();

      if (intermediateDataUrl) {
        const mid = getScrollPosition(scrollContainer);
        slicesQueue.push({
          dataUrl: intermediateDataUrl,
          scrollX: isGlobalScroll ? mid.x : initialGlobalX + (mid.x - initialScrollX),
          scrollY: isGlobalScroll ? mid.y : initialGlobalY + (mid.y - initialScrollY),
          offsetX: viewOffsetX,
          offsetY: viewOffsetY,
          width: viewW,
          height: viewH,
          viewportW,
          viewportH,
        });
      }

      // Return to the position where the current slice was captured
      robustScrollTo(scrollContainer, isGlobalScroll ? pageRect.left : initialScrollX, posAfter.y);
      await waitForScrollSettled(scrollContainer, posAfter.y, 300);
      floatingController.enforce();
    }


    const currentSlice: CapturedSlice = {
      dataUrl,
      scrollX: virtualScrollX,
      scrollY: virtualScrollY,
      offsetX: viewOffsetX,
      offsetY: viewOffsetY,
      width: viewW,
      height: viewH,
      viewportW,
      viewportH,
    };
    slicesQueue.push(currentSlice);

    // Effective coverage bottom of this slice in unified page coordinates
    const coverageBottom = virtualScrollY + viewOffsetY + viewH;

    // Visual debugging group
    const sliceNum = slicesQueue.length;
    console.groupCollapsed(
      `%c📸 [切片 #${sliceNum}] 容器目标Y: ${Math.round(nextScrollTargetY)}px ➔ 实际虚拟Y: ${Math.round(virtualScrollY)}px`,
      'font-weight: bold; color: #4f46e5; background: #eef2ff; padding: 2px 6px; border-radius: 4px;',
    );
    console.log(
      '%c ',
      `font-size: 1px; padding: 60px 100px; background: url('${dataUrl}') no-repeat center; background-size: contain; border: 1px solid #cbd5e1; border-radius: 6px; margin: 4px 0;`,
    );
    console.log('📊 切片参数:', {
      切片序号: sliceNum,
      容器实际Y: posAfter.y,
      等效虚拟Y: virtualScrollY,
      有效视口: { offsetX: viewOffsetX, offsetY: viewOffsetY, width: viewW, height: viewH },
      覆盖底部Y: coverageBottom,
      目标结束Y: targetEndY,
      已覆盖目标底: coverageBottom >= targetEndY,
      isGlobalScroll,
    });
    console.groupEnd();

    // Report progress using unified coordinates
    if (onProgress) {
      const coveredH = Math.min(totalHeight, Math.max(0, coverageBottom - pageRect.top));
      onProgress({
        slice: slicesQueue.length,
        totalSlices: Math.max(slicesQueue.length, estimatedSlices),
        percent: Math.min(85, Math.round((coveredH / totalHeight) * 85)),
      });
    }

    // Termination condition A: effective coverage reached targetEndY
    if (coverageBottom >= targetEndY) {
      break;
    }

    // Termination condition B: scroll position did not advance (reached container bottom)
    if (prevSlice && virtualScrollY <= prevSlice.scrollY + 1) {
      break;
    }

    // Advance next target position in the local container's coordinate space
    nextScrollTargetY = posAfter.y + stepSize;
    sliceIndex++;
  }

  return {
    slices: slicesQueue,
    viewportW,
    viewportH,
    targetEndY,
    cleanup,
  };
}
