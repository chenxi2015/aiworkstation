/**
 * Screenshot Helper Utility
 *
 * Provides viewport screenshot capturing via background proxy and
 * pixel-accurate canvas cropping / multi-screen scroll stitching for
 * full-height long pages and selected DOM elements.
 *
 * Implements mainstream browser extension anti-floating algorithms:
 * - Automatically detects & hides `position: fixed` and `position: sticky` elements during scrolling
 * - Prevents sticky headers and floating sidebars from repeating / stamping across stitched slices
 * - Temporarily suppresses scrollbars during capture and safely restores all DOM states in finally
 */

export interface AreaPageRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface HiddenElementState {
  element: HTMLElement;
  originalVisibility: string;
}

/**
 * Load image from Data URL
 */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(err);
    img.src = src;
  });
}

/**
 * Detect all fixed and sticky floating elements on page and hide them
 * to prevent duplicate stamping across multi-screen stitched screenshots.
 */
function hideFloatingElements(hideSticky = true): () => void {
  const hiddenElements: HiddenElementState[] = [];
  const allElements = document.querySelectorAll<HTMLElement>('body *');

  allElements.forEach((el) => {
    // Ignore AI Collector internal overlay containers
    if (el.closest('#ai-workstation-grabber-container')) return;

    try {
      const style = window.getComputedStyle(el);
      const pos = style.position;

      const isFixed = pos === 'fixed';
      const isSticky = pos === 'sticky' || (pos as string) === '-webkit-sticky';

      if (isFixed || (hideSticky && isSticky)) {
        hiddenElements.push({
          element: el,
          originalVisibility: el.style.visibility,
        });
        el.style.setProperty('visibility', 'hidden', 'important');
      }
    } catch {
      // Ignore security or frame access restrictions
    }
  });

  return () => {
    for (const item of hiddenElements) {
      if (item.originalVisibility) {
        item.element.style.visibility = item.originalVisibility;
      } else {
        item.element.style.removeProperty('visibility');
      }
    }
  };
}

/**
 * Single shot capture for areas already visible within current viewport
 */
async function captureSingleViewport(
  pageRect: AreaPageRect,
  viewportW: number,
  viewportH: number,
): Promise<string | undefined> {
  try {
    const response: { success: boolean; dataUrl?: string; error?: string } =
      await chrome.runtime.sendMessage({ type: 'CAPTURE_VISIBLE_TAB' });

    if (!response?.success || !response.dataUrl) {
      return undefined;
    }

    const img = await loadImage(response.dataUrl);
    const scaleX = img.naturalWidth / viewportW;
    const scaleY = img.naturalHeight / viewportH;

    const clientLeft = pageRect.left - window.scrollX;
    const clientTop = pageRect.top - window.scrollY;

    const sx = Math.max(0, Math.round(clientLeft * scaleX));
    const sy = Math.max(0, Math.round(clientTop * scaleY));
    const sw = Math.min(img.naturalWidth - sx, Math.round(pageRect.width * scaleX));
    const sh = Math.min(img.naturalHeight - sy, Math.round(pageRect.height * scaleY));

    if (sw <= 0 || sh <= 0) return undefined;

    const canvas = document.createElement('canvas');
    canvas.width = sw;
    canvas.height = sh;

    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;

    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
    return canvas.toDataURL('image/png');
  } catch (err) {
    console.warn('[AI Collector] Single viewport screenshot error:', err);
    return undefined;
  }
}

/**
 * Capture full-length area screenshot.
 *
 * If the target area spans multiple viewports (long page / tall element),
 * it programmatically scrolls down, captures slices, and stitches them
 * seamlessly onto a master canvas without missing any content.
 *
 * Incorporates industry-standard anti-floating algorithms to hide sticky headers
 * and fixed floating sidebars during subsequent scroll slices.
 */
export async function captureAndCropArea(
  pageRect: AreaPageRect,
): Promise<string | undefined> {
  let restoreFloating: (() => void) | null = null;
  const initialScrollX = window.scrollX;
  const initialScrollY = window.scrollY;

  const origDocOverflow = document.documentElement.style.overflow;
  const origBodyOverflow = document.body.style.overflow;

  try {
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
      return await captureSingleViewport(pageRect, viewportW, viewportH);
    }

    // Suppress scrollbars during multi-slice capture
    document.documentElement.style.setProperty('overflow', 'hidden', 'important');
    document.body.style.setProperty('overflow', 'hidden', 'important');

    // Multi-viewport scroll & stitch capture for long content
    const totalHeight = Math.min(Math.max(1, pageRect.height), 16000);
    const sliceStep = Math.max(200, Math.min(viewportH - 60, 700));

    let masterCanvas: HTMLCanvasElement | null = null;
    let masterCtx: CanvasRenderingContext2D | null = null;
    let renderedY = 0;
    let scaleX = 1;
    let scaleY = 1;
    let sliceIndex = 0;

    while (renderedY < totalHeight) {
      const remainingH = totalHeight - renderedY;
      const currentChunkH = Math.min(sliceStep, remainingH);
      const chunkPageY = pageRect.top + renderedY;

      // Position viewport slightly above chunk (20px headroom)
      const targetScrollY = Math.max(0, chunkPageY - 20);
      const targetScrollX = Math.max(0, pageRect.left);

      window.scrollTo({
        left: targetScrollX,
        top: targetScrollY,
        behavior: 'instant' as ScrollBehavior,
      });

      // Repaint wait interval for smooth rendering of scrolled content
      await new Promise((resolve) => setTimeout(resolve, 70));

      // After first slice (or if target selection starts below top of page),
      // hide sticky headers & fixed floating sidebars to prevent repeating/covering content
      if (sliceIndex === 1 || (sliceIndex === 0 && pageRect.top > 120)) {
        if (!restoreFloating) {
          restoreFloating = hideFloatingElements(true);
          // Wait a tick for hidden styles to apply
          await new Promise((resolve) => setTimeout(resolve, 30));
        }
      }

      const response: { success: boolean; dataUrl?: string; error?: string } =
        await chrome.runtime.sendMessage({ type: 'CAPTURE_VISIBLE_TAB' });

      if (!response?.success || !response.dataUrl) {
        console.warn('[AI Collector] Capture visible tab failed on chunk at Y:', renderedY);
        break;
      }

      const img = await loadImage(response.dataUrl);
      scaleX = img.naturalWidth / viewportW;
      scaleY = img.naturalHeight / viewportH;

      if (!masterCanvas) {
        masterCanvas = document.createElement('canvas');
        masterCanvas.width = Math.max(1, Math.round(pageRect.width * scaleX));
        masterCanvas.height = Math.max(1, Math.round(totalHeight * scaleY));
        masterCtx = masterCanvas.getContext('2d');
      }

      // Relative client coordinates in current viewport
      const clientLeft = pageRect.left - window.scrollX;
      const clientTop = chunkPageY - window.scrollY;

      const sx = Math.max(0, Math.round(clientLeft * scaleX));
      const sy = Math.max(0, Math.round(clientTop * scaleY));
      const sw = Math.min(img.naturalWidth - sx, Math.round(pageRect.width * scaleX));
      const sh = Math.min(img.naturalHeight - sy, Math.round(currentChunkH * scaleY));

      if (sw > 0 && sh > 0 && masterCtx) {
        const dx = 0;
        const dy = Math.round(renderedY * scaleY);
        masterCtx.drawImage(img, sx, sy, sw, sh, dx, dy, sw, sh);
      }

      renderedY += currentChunkH;
      sliceIndex++;
    }

    if (masterCanvas) {
      return masterCanvas.toDataURL('image/png');
    }

    return undefined;
  } catch (error) {
    console.warn('[AI Collector] Long screenshot capture failed:', error);
    return undefined;
  } finally {
    // 1. Restore all hidden floating elements (headers, sidebars, widgets)
    if (restoreFloating) {
      restoreFloating();
    }

    // 2. Restore document scrollbars
    if (origDocOverflow) {
      document.documentElement.style.overflow = origDocOverflow;
    } else {
      document.documentElement.style.removeProperty('overflow');
    }

    if (origBodyOverflow) {
      document.body.style.overflow = origBodyOverflow;
    } else {
      document.body.style.removeProperty('overflow');
    }

    // 3. Restore user's original scroll position
    window.scrollTo({
      left: initialScrollX,
      top: initialScrollY,
      behavior: 'instant' as ScrollBehavior,
    });
  }
}
