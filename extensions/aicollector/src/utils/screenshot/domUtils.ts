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
  `;
  (document.head || document.documentElement).appendChild(styleEl);

  return () => {
    styleEl.remove();
  };
}

/**
 * Smart Scroll Container Detection
 *
 * Probes every element stacked at the target area's visible center, collects
 * their scrollable ancestors, and accepts the deepest one that:
 *   1. is tall enough to be a main-content scroller (>= 50% viewport height),
 *      rejecting tiny sub-scrollables like code blocks or table wrappers,
 *   2. geometrically intersects the target area in page coordinates,
 *   3. can actually be scrolled (verified with a reversible 1px test scroll).
 * Falls back to the global window scroller when nothing qualifies.
 */
export function findScrollContainer(targetRect: AreaPageRect): Element | Window {
  try {
    const winW = window.innerWidth || 1;
    const winH = window.innerHeight || 1;
    const scrollX = window.scrollX || 0;
    const scrollY = window.scrollY || 0;

    const probeX = Math.max(
      1,
      Math.min(targetRect.left + targetRect.width / 2 - scrollX, winW - 1),
    );
    // Probe slightly inside the selection's visible leading edge instead of the
    // extreme top, avoiding fixed headers stacked at the very top of the viewport.
    const probeY = Math.max(
      1,
      Math.min(targetRect.top - scrollY + Math.min(targetRect.height / 2, 200), winH - 1),
    );

    const stack = document.elementsFromPoint(probeX, probeY);
    const minContainerHeight = Math.min(320, Math.floor(winH * 0.5));

    const isUsableContainer = (el: Element): boolean => {
      try {
        const style = window.getComputedStyle(el);
        const overflowY = style.overflowY;
        const isScrollableStyle =
          overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay';
        if (!isScrollableStyle) return false;
        if (el.scrollHeight <= el.clientHeight + 1) return false;
        if (el.clientHeight < minContainerHeight) return false;

        // The container's page-space box must intersect the target area, otherwise
        // the probed element belongs to unrelated floating UI.
        const rect = el.getBoundingClientRect();
        const boxTop = rect.top + scrollY;
        const boxBottom = boxTop + rect.height;
        if (
          boxBottom <= targetRect.top + 4 ||
          boxTop >= targetRect.top + targetRect.height - 4
        ) {
          return false;
        }

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
 * Detect external fixed and sticky floating elements on page and hide them
 */
export function hideFloatingElements(targetRect?: AreaPageRect): () => void {
  const hiddenElements: HiddenElementState[] = [];

  const candidateSelectors = [
    'header',
    'nav',
    '[class*="header" i]',
    '[class*="sticky" i]',
    '[class*="fixed" i]',
    '[class*="navbar" i]',
    '[class*="toolbar" i]',
    '[style*="position: fixed"]',
    '[style*="position:fixed"]',
    '[style*="position: sticky"]',
    '[style*="position:sticky"]',
    '[style*="position: -webkit-sticky"]',
  ].join(',');

  const matched = document.querySelectorAll<HTMLElement>(candidateSelectors);
  const elementsToInspect = new Set<HTMLElement>(Array.from(matched));

  const winH = window.innerHeight || 800;
  const globalScrollY = window.scrollY || 0;
  const globalScrollX = window.scrollX || 0;

  elementsToInspect.forEach((el) => {
    if (el.closest('#ai-workstation-grabber-container')) return;

    try {
      const style = window.getComputedStyle(el);
      const pos = style.position;
      const isFixed = pos === 'fixed';
      const isSticky = pos === 'sticky' || (pos as string) === '-webkit-sticky';

      if (isFixed || isSticky) {
        const rect = el.getBoundingClientRect();

        // Never hide main structural containers or full-height wrappers
        if (rect.height > winH * 0.45) {
          return;
        }

        if (targetRect) {
          const pageLeft = rect.left + globalScrollX;
          const pageTop = rect.top + globalScrollY;
          const pageRight = pageLeft + rect.width;
          const pageBottom = pageTop + rect.height;

          const overlapsTarget =
            pageLeft < targetRect.left + targetRect.width &&
            pageRight > targetRect.left &&
            pageTop < targetRect.top + targetRect.height &&
            pageBottom > targetRect.top;

          if (overlapsTarget) {
            return;
          }
        }

        hiddenElements.push({
          element: el,
          originalVisibility: el.style.visibility,
        });
        el.style.setProperty('visibility', 'hidden', 'important');
      }
    } catch {}
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
