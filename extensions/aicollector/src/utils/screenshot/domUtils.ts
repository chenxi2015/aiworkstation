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
      try {
        const el = item.element;
        if (!el || !el.style) return;

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
      } catch {}
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


export interface ScrollContainerInfo {
  container: Element | Window;
  isWindow: boolean;
  maxScrollY: number;
  scrollHeight: number;
  scrollWidth: number;
  clientHeight: number;
  clientWidth: number;
  score: number;
}

/**
 * Semantic Dictionary for Container Content Evaluation
 * Easily configurable lists of keywords, tags, roles, and item selectors.
 */
export const SEMANTIC_EVAL_CONFIG = {
  // Main article / reader content keywords (matched against id and class)
  readerKeywords: [
    'reader',
    'article',
    'content',
    'post',
    'detail',
    'markdown',
    'document',
    'doc',
    'reading',
    'story',
    'main-body',
    'post-body',
    'entry-content',
    'article-body',
  ],

  // Semantic tags indicating main reading content
  readerTags: ['article', 'main'],

  // ARIA roles indicating main reading content
  readerRoles: ['main', 'article'],

  // Selectors for elements expected inside high-quality reading containers
  innerArticleSelectors: 'article, [role="article"], [role="main"], h1',

  // Sidebar / navigation / feed list keywords (matched against id and class)
  sidebarKeywords: [
    'sidebar',
    'nav',
    'list',
    'feed',
    'catalog',
    'toc',
    'menu',
    'group',
    'directory',
    'channel',
    'tree',
    'aside',
    'drawer',
    'index',
  ],

  // Tags indicating sidebar or navigation panels
  sidebarTags: ['aside', 'nav'],

  // ARIA roles indicating sidebar or navigation panels
  sidebarRoles: ['navigation', 'feed'],

  // Selectors for repetitive index card items inside list/catalog containers
  listItemSelectors: '.entry-card, .feed-item, [class*="card"], [class*="item"], li',
};

/**
 * Calculate semantic and content quality weight for a candidate scroll container.
 * Heavily boosts main reading/article areas and deprioritizes sidebars/feed lists.
 */
export function calculateContainerSemanticWeight(
  el: HTMLElement,
  winW: number,
  config = SEMANTIC_EVAL_CONFIG,
): number {
  let multiplier = 1.0;

  const id = (el.id || '').toLowerCase();
  const className = (typeof el.className === 'string' ? el.className : '').toLowerCase();
  const tagName = el.tagName.toLowerCase();
  const role = el.getAttribute('role') || '';

  // 1. Strongly boost main article / reading areas
  const isArticleOrMain =
    config.readerTags.includes(tagName) || config.readerRoles.includes(role);
  if (isArticleOrMain) multiplier *= 3.0;

  const hasReaderKeyword = config.readerKeywords.some(
    (kw) => id.includes(kw) || className.includes(kw),
  );
  if (hasReaderKeyword) multiplier *= 2.5;

  // Contains an <h1> or <article> inside
  const hasH1 = !!el.querySelector('h1');
  const hasArticleInside =
    !isArticleOrMain && !!el.querySelector(config.innerArticleSelectors);
  if (hasH1) multiplier *= 2.0;
  if (hasArticleInside) multiplier *= 2.0;

  // 2. High-quality reading paragraph density
  const paragraphs = el.querySelectorAll('p');
  let substantiveParagraphs = 0;
  paragraphs.forEach((p) => {
    const textLen = (p.textContent || '').trim().length;
    if (textLen >= 25) substantiveParagraphs++;
  });
  if (substantiveParagraphs >= 2) {
    multiplier *= Math.min(3.0, 1.0 + substantiveParagraphs * 0.25);
  }

  // 3. Strongly penalize sidebars, navigation, catalogs, feed/entry lists
  const isSidebarOrList =
    config.sidebarTags.includes(tagName) ||
    config.sidebarRoles.includes(role) ||
    config.sidebarKeywords.some((kw) => id.includes(kw) || className.includes(kw));
  if (isSidebarOrList) multiplier *= 0.15;

  // If container has many repetitive item cards / list buttons and lacks reading paragraphs, it is an index list
  const itemCards = el.querySelectorAll(config.listItemSelectors);
  if (itemCards.length >= 6 && substantiveParagraphs < 2 && !hasH1) {
    multiplier *= 0.1;
  }

  // 4. Width / Aspect Ratio bonus
  const rect = el.getBoundingClientRect();
  const widthRatio = rect.width / Math.max(1, winW);
  if (widthRatio >= 0.35) {
    // Reading pane is wide
    multiplier *= 1.5;
  } else if (widthRatio <= 0.25) {
    // Sidebar list is narrow
    multiplier *= 0.4;
  }

  return multiplier;
}

/**
 * Detect and return the dominant scrollable container of the webpage.
 * Compares global window with all potential inner scrollable layout containers
 * by evaluating real scrollability, scrollable distance, semantic content weight, and visible area.
 */
export function findMaxScrollContainer(): ScrollContainerInfo {
  const winW = window.innerWidth || document.documentElement?.clientWidth || 1;
  const winH = window.innerHeight || document.documentElement?.clientHeight || 1;
  const doc = document.documentElement;
  const body = document.body;

  // 1. Evaluate Window / Document scroll capacity
  const docScrollH = doc?.scrollHeight || 0;
  const bodyScrollH = body?.scrollHeight || 0;
  const docOffsetH = doc?.offsetHeight || 0;
  const bodyOffsetH = body?.offsetHeight || 0;

  const winScrollH = Math.max(docScrollH, bodyScrollH, docOffsetH, bodyOffsetH, winH);
  const winScrollW = Math.max(
    doc?.scrollWidth || 0,
    body?.scrollWidth || 0,
    doc?.offsetWidth || 0,
    body?.offsetWidth || 0,
    winW,
  );

  const docStyle = doc ? window.getComputedStyle(doc) : null;
  const bodyStyle = body ? window.getComputedStyle(body) : null;
  const isDocLocked = docStyle?.overflowY === 'hidden' || docStyle?.overflow === 'hidden';
  const isBodyLocked = bodyStyle?.overflowY === 'hidden' || bodyStyle?.overflow === 'hidden';

  // Window actual scrollable distance
  const winMaxScrollY = (isDocLocked && isBodyLocked) ? 0 : Math.max(0, winScrollH - winH);
  const winScore = winMaxScrollY * Math.sqrt(winW * winH);

  let best: ScrollContainerInfo = {
    container: window,
    isWindow: true,
    maxScrollY: winMaxScrollY,
    scrollHeight: winScrollH,
    scrollWidth: winScrollW,
    clientHeight: winH,
    clientWidth: winW,
    score: winScore,
  };

  // 2. Scan all candidate DOM elements for inner scroll containers (e.g. SPA layouts)
  try {
    const minContainerH = Math.min(180, Math.floor(winH * 0.25));
    const allElements = document.querySelectorAll<HTMLElement>('*');

    for (let i = 0; i < allElements.length; i++) {
      const el = allElements[i];
      if (!el || el === body || el === doc) continue;
      if (el.id === 'ai-workstation-grabber-container' || el.id?.startsWith('ai-collector-')) continue;

      const clientH = el.clientHeight;
      const clientW = el.clientWidth;
      const scrollH = el.scrollHeight;
      const scrollW = el.scrollWidth;
      const scrollableDist = scrollH - clientH;

      // Filter out non-scrollable or tiny elements
      if (scrollableDist <= 20 || clientH < minContainerH || clientW < 100) continue;

      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') continue;

      const overflowY = style.overflowY;
      const isScrollStyle =
        overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay';

      const rect = el.getBoundingClientRect();
      if (rect.width < 100 || rect.height < 100) continue;

      // Reversible scroll verification to ensure element actually scrolls
      let canScroll = false;
      const before = el.scrollTop;
      el.scrollTop = before + 1;
      if (el.scrollTop !== before) {
        canScroll = true;
        el.scrollTop = before;
      } else if (before > 0) {
        el.scrollTop = before - 1;
        if (el.scrollTop !== before) {
          canScroll = true;
          el.scrollTop = before;
        }
      } else if (isScrollStyle) {
        canScroll = true;
      }

      if (!canScroll) continue;

      const visibleArea = Math.min(rect.width, winW) * Math.min(rect.height, winH);
      const semanticWeight = calculateContainerSemanticWeight(el, winW);
      const score = scrollableDist * Math.sqrt(visibleArea) * semanticWeight;

      // If this inner container has higher score or window is locked, elect it
      if (score > best.score || (best.isWindow && winMaxScrollY <= 50 && scrollableDist > 50)) {
        best = {
          container: el,
          isWindow: false,
          maxScrollY: scrollableDist,
          scrollHeight: scrollH,
          scrollWidth: scrollW,
          clientHeight: clientH,
          clientWidth: clientW,
          score,
        };
      }
    }
  } catch (err) {
    console.warn('[AI Collector] Error scanning max scroll container:', err);
  }

  return best;
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

    const isUsableContainer = (el: Element): boolean => {
      try {
        if (el === document.body || el === document.documentElement) return false;
        const style = window.getComputedStyle(el);
        const overflowY = style.overflowY;
        const isScrollableStyle =
          overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay';
        if (!isScrollableStyle) return false;
        if (el.scrollHeight <= el.clientHeight + 5) return false;
        if (el.clientHeight < 100) return false;

        const rect = el.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return false;

        return true;
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

    // 2. If target is full page, use the dominant max scroll container
    const isFullPage =
      targetRect.left <= 10 &&
      targetRect.top <= 80 &&
      targetRect.width >= Math.floor(winW * 0.85);

    if (isFullPage) {
      const maxInfo = findMaxScrollContainer();
      return maxInfo.container;
    }

    // 3. Coordinate-based multi-point probing in target area
    const probePoints = [
      { x: targetRect.left + targetRect.width * 0.5, y: targetRect.top + Math.min(targetRect.height * 0.5, 200) },
      { x: targetRect.left + targetRect.width * 0.25, y: targetRect.top + Math.min(targetRect.height * 0.3, 200) },
      { x: targetRect.left + targetRect.width * 0.75, y: targetRect.top + Math.min(targetRect.height * 0.3, 200) },
    ];

    for (const pt of probePoints) {
      const probeX = Math.max(1, Math.min(pt.x - scrollX, winW - 1));
      const probeY = Math.max(1, Math.min(pt.y - scrollY, winH - 1));

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
    }

    // 4. If probing points failed, fallback to the dominant max scroll container
    const maxInfo = findMaxScrollContainer();
    return maxInfo.container;
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
 * Combines global document dimensions with the dominant scrollable container
 * detected by findMaxScrollContainer to ensure SPA / multi-column layouts
 * are always accurately sized.
 */
export function calculateFullPageDimensions(): { width: number; height: number } {
  const maxInfo = findMaxScrollContainer();
  const winW = window.innerWidth || document.documentElement?.clientWidth || 1;
  const winH = window.innerHeight || document.documentElement?.clientHeight || 1;

  const doc = document.documentElement;
  const body = document.body;

  const maxWidth = Math.max(
    doc?.scrollWidth || 0,
    body?.scrollWidth || 0,
    doc?.offsetWidth || 0,
    body?.offsetWidth || 0,
    maxInfo.scrollWidth,
    winW,
  );

  const maxHeight = Math.max(
    doc?.scrollHeight || 0,
    body?.scrollHeight || 0,
    doc?.offsetHeight || 0,
    body?.offsetHeight || 0,
    maxInfo.scrollHeight,
    winH,
  );

  return {
    width: Math.round(maxWidth),
    height: Math.round(maxHeight),
  };
}



