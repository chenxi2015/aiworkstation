/**
 * DOM and Viewport Utility Functions for Screenshot Capture
 */

import type { AreaPageRect, HiddenElementState } from './types';

/**
 * Sleep helper for deliberate pacing and GPU buffer stability
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wait for browser render pipeline and GPU compositor commit
 */
export function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        resolve();
      });
    });
  });
}

/**
 * Load image from Data URL or URI
 */
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(img);
    img.src = src;
  });
}

/**
 * Inject non-intrusive scrollbar suppression and force instant scrolling styles
 */
export function injectScreenshotStyles(): () => void {
  const styleEl = document.createElement('style');
  styleEl.id = 'ai-collector-screenshot-style';
  styleEl.textContent = `
    html, body, *, *::before, *::after {
      scroll-behavior: auto !important;
      scrollbar-width: none !important;
      -ms-overflow-style: none !important;
    }
    *::-webkit-scrollbar {
      display: none !important;
      width: 0 !important;
      height: 0 !important;
    }
    /* Force sticky elements and smart sticky containers to stay static in document flow */
    [style*="position: sticky" i],
    [style*="position:sticky" i],
    [style*="position: -webkit-sticky" i],
    [style*="position:-webkit-sticky" i],
    [data-smart-sticky-anchor] {
      position: static !important;
      top: auto !important;
      transform: none !important;
    }
    /* Hide third-party extension overlay containers and shadow roots (e.g. Plasmo, CodeBox) */
    plasmo-csui,
    [id*="plasmo" i],
    [class*="plasmo" i],
    [id*="codebox" i],
    [class*="codebox" i],
    #ws_cmbm,
    .ws_cmbmc {
      display: none !important;
      visibility: hidden !important;
    }
  `;
  (document.head || document.documentElement).appendChild(styleEl);

  return () => {
    styleEl.remove();
  };
}

/**
 * Controller interface to neutralize sticky elements and hide floating widgets
 * throughout the entire multi-slice screenshot lifecycle.
 */
export interface FloatingElementController {
  enforce: () => void;
  restore: () => void;
}

/**
 * Detect fixed and sticky floating elements on page and handle them before & during multi-slice capture:
 * 1. Neutralize sticky elements by forcing 'position: static' so they remain at their natural
 *    document flow coordinate and do NOT stick to the viewport during successive scroll slices.
 * 2. Neutralize fixed header bars to 'position: absolute' (if starting from page top) so they
 *    are captured only once at the top, or hide floating widgets (back-to-top buttons, chat heads, #ws_cmbm).
 * 3. Suppress all third-party extension UI (e.g. <plasmo-csui>, shadow-roots, floating toolbars).
 * 4. Supports re-enforcement after scroll events to counter dynamic JS page sticky scripts.
 */
export function createFloatingElementController(targetRect?: AreaPageRect): FloatingElementController {
  interface RestorableElement {
    element: HTMLElement;
    originalPosition: string;
    originalVisibility: string;
    originalTop: string;
    originalTransform: string;
    originalOpacity: string;
    originalDisplay: string;
  }

  const modifiedMap = new Map<HTMLElement, RestorableElement>();

  const winH = window.innerHeight || 800;
  const winW = window.innerWidth || 1200;
  const globalScrollY = window.scrollY || 0;
  const isCaptureFromTop = !targetRect || targetRect.top <= 80;

  const enforce = () => {
    try {
      // 1. First explicitly suppress all third-party extension host tags & shadow-containers
      const extensionHosts = document.querySelectorAll<HTMLElement>(
        'plasmo-csui, [id*="plasmo" i], [class*="plasmo" i], [id*="codebox" i], [class*="codebox" i], #ws_cmbm, .ws_cmbmc',
      );
      extensionHosts.forEach((host) => {
        if (host.closest('#ai-workstation-grabber-container') || host.id?.startsWith('ai-collector-')) return;
        if (!modifiedMap.has(host)) {
          modifiedMap.set(host, {
            element: host,
            originalPosition: host.style.position,
            originalVisibility: host.style.visibility,
            originalTop: host.style.top,
            originalTransform: host.style.transform,
            originalOpacity: host.style.opacity,
            originalDisplay: host.style.display,
          });
        }
        host.style.setProperty('display', 'none', 'important');
        host.style.setProperty('visibility', 'hidden', 'important');
      });

      // 2. Scan all page elements for fixed/sticky/shadow-root artifacts
      const allElements = document.querySelectorAll<HTMLElement>('*');

      allElements.forEach((el) => {
        if (
          el.id === 'ai-workstation-grabber-container' ||
          el.closest('#ai-workstation-grabber-container') ||
          el.id?.startsWith('ai-collector-') ||
          el.tagName === 'HTML' ||
          el.tagName === 'BODY'
        ) {
          return;
        }

        try {
          // Hide third-party Shadow DOM hosts (custom extension elements)
          if (el.shadowRoot && !el.id?.startsWith('ai-collector-')) {
            if (!modifiedMap.has(el)) {
              modifiedMap.set(el, {
                element: el,
                originalPosition: el.style.position,
                originalVisibility: el.style.visibility,
                originalTop: el.style.top,
                originalTransform: el.style.transform,
                originalOpacity: el.style.opacity,
                originalDisplay: el.style.display,
              });
            }
            el.style.setProperty('display', 'none', 'important');
            el.style.setProperty('visibility', 'hidden', 'important');
            return;
          }

          const style = window.getComputedStyle(el);
          const pos = style.position;
          const rawStyle = el.getAttribute('style') || '';
          const isSticky =
            pos === 'sticky' ||
            (pos as string) === '-webkit-sticky' ||
            el.hasAttribute('data-smart-sticky-anchor') ||
            rawStyle.includes('position: sticky') ||
            rawStyle.includes('position:sticky') ||
            rawStyle.includes('position: -webkit-sticky') ||
            rawStyle.includes('position:-webkit-sticky');
          const isFixed =
            pos === 'fixed' ||
            rawStyle.includes('position: fixed') ||
            rawStyle.includes('position:fixed');

          if (!isSticky && !isFixed) return;

          const rect = el.getBoundingClientRect();

          // Skip invisible elements or massive structural wrappers
          if (rect.width <= 0 && rect.height <= 0) return;
          if (rect.height > winH * 0.9 && rect.width > winW * 0.9) return;

          if (!modifiedMap.has(el)) {
            modifiedMap.set(el, {
              element: el,
              originalPosition: el.style.position,
              originalVisibility: el.style.visibility,
              originalTop: el.style.top,
              originalTransform: el.style.transform,
              originalOpacity: el.style.opacity,
              originalDisplay: el.style.display,
            });
          }

          if (isSticky) {
            // Sticky elements must be converted to static to prevent repeated capture at every slice
            el.style.setProperty('position', 'static', 'important');
            el.style.setProperty('top', 'auto', 'important');
            el.style.setProperty('transform', 'none', 'important');
          } else if (isFixed) {
            const isTopHeader = rect.top <= 15 && rect.height < winH * 0.45;
            if (isCaptureFromTop && isTopHeader) {
              // If starting from top, pin header to absolute top so it scrolls away naturally
              const absoluteTop = rect.top + globalScrollY;
              el.style.setProperty('position', 'absolute', 'important');
              el.style.setProperty('top', `${absoluteTop}px`, 'important');
            } else {
              // Otherwise hide floating elements (floating buttons, toolbars, sidebars, third-party widgets)
              el.style.setProperty('visibility', 'hidden', 'important');
              el.style.setProperty('opacity', '0', 'important');
            }
          }
        } catch {}
      });
    } catch {}
  };

  // Initial enforcement
  enforce();

  const restore = () => {
    modifiedMap.forEach((item) => {
      const el = item.element;
      if (item.originalPosition) {
        el.style.position = item.originalPosition;
      } else {
        el.style.removeProperty('position');
      }

      if (item.originalVisibility) {
        el.style.visibility = item.originalVisibility;
      } else {
        el.style.removeProperty('visibility');
      }

      if (item.originalTop) {
        el.style.top = item.originalTop;
      } else {
        el.style.removeProperty('top');
      }

      if (item.originalTransform) {
        el.style.transform = item.originalTransform;
      } else {
        el.style.removeProperty('transform');
      }

      if (item.originalOpacity) {
        el.style.opacity = item.originalOpacity;
      } else {
        el.style.removeProperty('opacity');
      }

      if (item.originalDisplay) {
        el.style.display = item.originalDisplay;
      } else {
        el.style.removeProperty('display');
      }
    });
    modifiedMap.clear();
  };

  return { enforce, restore };
}


/**
 * Legacy compatibility wrapper for hiding floating elements
 */
export function hideFloatingElements(targetRect?: AreaPageRect): () => void {
  const controller = createFloatingElementController(targetRect);
  return controller.restore;
}


/**
 * Smart Scroll Container Detection
 *
 * Probes the target element / coordinates, collects scrollable ancestors,
 * and returns the best matching scrollable container element (or window).
 */
export function findScrollContainer(
  targetRect: AreaPageRect,
  targetEl?: HTMLElement | null,
): Element | Window {
  try {
    const winW = window.innerWidth || 1;
    const winH = window.innerHeight || 1;
    const scrollX = window.scrollX || 0;
    const scrollY = window.scrollY || 0;

    const minContainerHeight = Math.min(180, Math.floor(winH * 0.25));

    const isUsableContainer = (el: Element): boolean => {
      try {
        if (el === document.body || el === document.documentElement) return false;
        const style = window.getComputedStyle(el);
        const overflowY = style.overflowY;
        const isScrollableStyle =
          overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay';
        if (!isScrollableStyle) return false;
        if (el.scrollHeight <= el.clientHeight + 2) return false;
        if (el.clientHeight < minContainerHeight) return false;

        const rect = el.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return false;

        // Reversible test scroll proving this element actually scrolls.
        const before = el.scrollTop;
        el.scrollTop = before + 1;
        let moved = el.scrollTop !== before;
        if (!moved && before > 0) {
          el.scrollTop = before - 1;
          moved = el.scrollTop !== before;
        }
        if (el.scrollTop !== before) {
          el.scrollTop = before;
        }
        return moved;
      } catch {
        return false;
      }
    };

    // 1. If a target element is provided directly, walk up its ancestor chain first
    if (targetEl) {
      let curr: HTMLElement | null = targetEl;
      while (curr && curr !== document.body && curr !== document.documentElement) {
        if (isUsableContainer(curr)) {
          return curr;
        }
        curr = curr.parentElement;
      }

      // Also probe direct children if the container itself was picked
      const scrollableChild = targetEl.querySelector(
        '[style*="overflow"], [class*="scroll"], [class*="overflow"]',
      );
      if (scrollableChild && isUsableContainer(scrollableChild)) {
        return scrollableChild;
      }
    }

    // 2. Coordinate-based probing at target area visible center
    const probeX = Math.max(
      1,
      Math.min(targetRect.left + targetRect.width / 2 - scrollX, winW - 1),
    );
    const probeY = Math.max(
      1,
      Math.min(targetRect.top - scrollY + Math.min(targetRect.height / 2, 200), winH - 1),
    );

    const stack = document.elementsFromPoint(probeX, probeY);
    for (const hit of stack) {
      let el: Element | null = hit;
      while (el && el !== document.body && el !== document.documentElement) {
        if (isUsableContainer(el)) {
          return el;
        }
        el = el.parentElement;
      }
    }
  } catch {
    // Ignore frame/access errors
  }
  return window;
}

/**
 * Scroll to target coordinate robustly on the specific container
 */
export function robustScrollTo(container: Element | Window, targetX: number, targetY: number): void {
  const x = Math.max(0, Math.round(targetX));
  const y = Math.max(0, Math.round(targetY));

  if (container === window) {
    try {
      window.scrollTo({ left: x, top: y, behavior: 'instant' as ScrollBehavior });
    } catch {
      window.scrollTo(x, y);
    }
    if (document.documentElement) {
      document.documentElement.scrollLeft = x;
      document.documentElement.scrollTop = y;
    }
    if (document.body) {
      document.body.scrollLeft = x;
      document.body.scrollTop = y;
    }
  } else {
    try {
      (container as Element).scrollTo({ left: x, top: y, behavior: 'instant' as ScrollBehavior });
    } catch {
      (container as Element).scrollLeft = x;
      (container as Element).scrollTop = y;
    }
  }

  // Dispatch synthetic scroll event to trigger intersection observers and lazy load handlers
  try {
    (container as EventTarget).dispatchEvent(new Event('scroll'));
  } catch {}
}

/**
 * Get current accurate scroll position for the container
 */
export function getScrollPosition(container: Element | Window): { x: number; y: number } {
  if (container === window) {
    const x =
      window.scrollX ||
      document.documentElement?.scrollLeft ||
      document.body?.scrollLeft ||
      document.scrollingElement?.scrollLeft ||
      0;
    const y =
      window.scrollY ||
      document.documentElement?.scrollTop ||
      document.body?.scrollTop ||
      document.scrollingElement?.scrollTop ||
      0;
    return { x, y };
  } else {
    return {
      x: (container as Element).scrollLeft,
      y: (container as Element).scrollTop,
    };
  }
}

/**
 * Get maximum possible scroll limits for the specific container
 */
export function getMaxScroll(container: Element | Window): { maxX: number; maxY: number } {
  if (container === window) {
    const doc = document.documentElement;
    const body = document.body;
    const scrollW = Math.max(
      doc?.scrollWidth || 0,
      body?.scrollWidth || 0,
      doc?.offsetWidth || 0,
      body?.offsetWidth || 0,
    );
    const scrollH = Math.max(
      doc?.scrollHeight || 0,
      body?.scrollHeight || 0,
      doc?.offsetHeight || 0,
      body?.offsetHeight || 0,
    );
    const viewportW = window.innerWidth || doc?.clientWidth || 1;
    const viewportH = window.innerHeight || doc?.clientHeight || 1;

    return {
      maxX: Math.max(0, scrollW - viewportW),
      maxY: Math.max(0, scrollH - viewportH),
    };
  } else {
    const el = container as Element;
    return {
      maxX: Math.max(0, el.scrollWidth - el.clientWidth),
      maxY: Math.max(0, el.scrollHeight - el.clientHeight),
    };
  }
}

/**
 * Wait for scrolling to arrive at target coordinate or stabilize on the container.
 */
export async function waitForScrollSettled(
  container: Element | Window,
  targetY: number,
  maxWaitMs = 500,
): Promise<void> {
  const { maxY } = getMaxScroll(container);
  const expectedY = Math.min(Math.max(0, Math.round(targetY)), maxY);

  await sleep(40);
  await nextFrame();

  const startTime = Date.now();
  let lastPos = getScrollPosition(container);
  let stableTicks = 0;

  while (Date.now() - startTime < maxWaitMs) {
    const current = getScrollPosition(container);

    const reachedTarget = Math.abs(current.y - expectedY) <= 2;
    if (reachedTarget) {
      await nextFrame();
      await sleep(30);
      return;
    }

    if (Math.abs(current.y - lastPos.y) < 1) {
      stableTicks++;
      if (stableTicks >= 2 && Date.now() - startTime >= 120) {
        await nextFrame();
        return;
      }
    } else {
      stableTicks = 0;
    }

    lastPos = current;
    await sleep(30);
  }
}

/**
 * Wait for images and web fonts in the viewport to finish loading.
 */
export async function waitForViewportImages(maxWaitMs = 400): Promise<void> {
  const startTime = Date.now();

  try {
    if (document.fonts && document.fonts.status !== 'loaded') {
      await Promise.race([document.fonts.ready, sleep(200)]);
    }
  } catch {}

  while (Date.now() - startTime < maxWaitMs) {
    const imgs = Array.from(document.querySelectorAll<HTMLImageElement>('img'));
    const winH = window.innerHeight || 800;

    // getBoundingClientRect is client-space, so it is correct for both global
    // window scrolling and nested scroll containers.
    const viewportImgs = imgs.filter((img) => {
      try {
        const rect = img.getBoundingClientRect();
        return rect.bottom > 0 && rect.top < winH && rect.width > 0;
      } catch {
        return false;
      }
    });

    const allLoaded = viewportImgs.every(
      (img) => !img.src || img.complete || img.naturalWidth > 0,
    );

    if (allLoaded || viewportImgs.length === 0) {
      await nextFrame();
      return;
    }

    await sleep(40);
  }
}

/**
 * Calculate the effective full page dimensions.
 *
 * In traditional pages, document.documentElement.scrollHeight reflects the entire page height.
 * In SPA / multi-column layouts with locked body (height: 100%; overflow: hidden),
 * probes major layout containers to find the true maximum scrollable content height.
 */
export function calculateFullPageDimensions(): { width: number; height: number } {
  const winW = window.innerWidth || 1;
  const winH = window.innerHeight || 1;

  let maxWidth = Math.max(
    document.documentElement.scrollWidth || 0,
    document.body?.scrollWidth || 0,
    document.documentElement.offsetWidth || 0,
    document.body?.offsetWidth || 0,
    winW,
  );

  let maxHeight = Math.max(
    document.documentElement.scrollHeight || 0,
    document.body?.scrollHeight || 0,
    document.documentElement.offsetHeight || 0,
    document.body?.offsetHeight || 0,
    winH,
  );

  // If global window has little/no scroll (typical of SPA or multi-column layouts with overflow: hidden body),
  // probe top-level and content scrollers to find the true max content height
  const isGlobalScrollable = maxHeight > winH + 30;
  if (!isGlobalScrollable) {
    try {
      const candidates = document.querySelectorAll<HTMLElement>(
        'main, article, [role="main"], #root > *, #app > *, body > div, [style*="overflow"], [class*="content" i], [class*="main" i]',
      );
      candidates.forEach((el) => {
        if (el.scrollHeight > maxHeight) {
          maxHeight = el.scrollHeight;
        }
      });

      // Fallback probe all visible elements if still only 1 screen height
      if (maxHeight <= winH + 30) {
        document.querySelectorAll<HTMLElement>('*').forEach((el) => {
          if (el.scrollHeight > maxHeight && el.clientHeight >= Math.min(180, winH * 0.25)) {
            maxHeight = Math.max(maxHeight, el.scrollHeight);
          }
        });
      }
    } catch {}
  }

  return {
    width: Math.round(maxWidth),
    height: Math.round(maxHeight),
  };
}



