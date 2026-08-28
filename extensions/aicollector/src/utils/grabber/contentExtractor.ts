/**
 * Content Extraction Engine for Visual Grabber
 *
 * Handles DOM structure normalization, metadata extraction, media parsing,
 * and geometrical bounding-box content intersection.
 */

import type { GrabbedContent, GrabbedVideo } from '../../types';
import { extractPageTDK } from '../tdk';
import { extractImagesFromElement } from '../imageExtractor';
import { extractVideosFromElement } from '../videoExtractor';
import { normalizeHtml } from '../htmlNormalizer';
import { calculateFullPageDimensions, type AreaPageRect } from '../screenshotHelper';
import type { SelectionBoxRect } from './types';

/**
 * Generate readable CSS selector for target element
 */
export function generateSelector(el: HTMLElement): string {
  if (el.id) return `#${el.id}`;
  const parts: string[] = [];
  let curr: HTMLElement | null = el;
  while (curr && curr !== document.body && curr !== document.documentElement) {
    let segment = curr.tagName.toLowerCase();
    if (curr.className && typeof curr.className === 'string') {
      const cls = curr.className.trim().split(/\s+/).filter(Boolean)[0];
      if (cls) segment += `.${cls}`;
    }
    parts.unshift(segment);
    curr = curr.parentElement;
  }
  return parts.slice(-3).join(' > ') || el.tagName.toLowerCase();
}

/**
 * Extract content from a single grabbed element
 */
export function extractElementContent(
  el: HTMLElement,
  screenshot?: string,
  pageRect?: AreaPageRect,
): GrabbedContent {
  const rect = el.getBoundingClientRect();
  const tdk = extractPageTDK(document);
  const images = extractImagesFromElement(el, window.location.href);
  const videos = extractVideosFromElement(el, window.location.href);

  const links: string[] = [];
  if (el.tagName.toLowerCase() === 'a' && (el as HTMLAnchorElement).href) {
    links.push((el as HTMLAnchorElement).href);
  }
  el.querySelectorAll('a').forEach((a) => {
    if (a.href && !links.includes(a.href)) links.push(a.href);
  });

  return {
    id: `grab_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    url: window.location.href,
    tdk,
    selectedHtml: normalizeHtml(el, window.location.href),
    selectedText: el.innerText || el.textContent || '',
    selector: generateSelector(el),
    tag: el.tagName.toLowerCase(),
    dimensions: { width: Math.round(rect.width), height: Math.round(pageRect ? pageRect.height : rect.height) },
    images,
    videos,
    links,
    screenshot,
    pageRect: pageRect
      ? {
          left: Math.round(pageRect.left),
          top: Math.round(pageRect.top),
          width: Math.round(pageRect.width),
          height: Math.round(pageRect.height),
        }
      : undefined,
    pageScroll: { x: window.scrollX || 0, y: window.scrollY || 0 },
    createdAt: Date.now(),
  };
}

/**
 * Extract content from drag-selected bounding box area using geometric intersection
 */
export function extractBoxAreaContent(
  rect: SelectionBoxRect,
  isInternalElement: (el: HTMLElement) => boolean,
  screenshot?: string,
  pageRect?: AreaPageRect,
): GrabbedContent {
  const tdk = extractPageTDK(document);
  const allElements = Array.from(document.querySelectorAll<HTMLElement>('body *'));
  const selectionArea = rect.width * rect.height;

  // Helper to calculate geometric intersection in page coordinates
  const getIntersection = (elPage: { left: number; top: number; right: number; bottom: number; width: number; height: number }) => {
    if (elPage.width === 0 || elPage.height === 0) return null;

    const intersectLeft = Math.max(elPage.left, rect.left);
    const intersectTop = Math.max(elPage.top, rect.top);
    const intersectRight = Math.min(elPage.right, rect.right);
    const intersectBottom = Math.min(elPage.bottom, rect.bottom);

    const intersectWidth = Math.max(0, intersectRight - intersectLeft);
    const intersectHeight = Math.max(0, intersectBottom - intersectTop);
    const intersectArea = intersectWidth * intersectHeight;

    if (intersectArea <= 0) return null;

    const elArea = elPage.width * elPage.height;
    const overlapRatio = elArea > 0 ? intersectArea / elArea : 0;
    const centerX = elPage.left + elPage.width / 2;
    const centerY = elPage.top + elPage.height / 2;
    const centerInBox =
      centerX >= rect.left && centerX <= rect.right &&
      centerY >= rect.top && centerY <= rect.bottom;

    return {
      intersectArea,
      elArea,
      overlapRatio,
      centerInBox,
    };
  };

  // Helper to compute element's page coordinates
  const getElementPageRect = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    return {
      left: r.left + window.scrollX,
      top: r.top + window.scrollY,
      right: r.right + window.scrollX,
      bottom: r.bottom + window.scrollY,
      width: r.width,
      height: r.height,
    };
  };

  // 1. Direct scan for all image / media elements intersecting the selection area
  const allImages: string[] = [];
  const allVideos: GrabbedVideo[] = [];
  const addedVideoUrls = new Set<string>();

  const addExtractedVideos = (videos: GrabbedVideo[]) => {
    for (const v of videos) {
      if (!addedVideoUrls.has(v.src)) {
        addedVideoUrls.add(v.src);
        allVideos.push(v);
        if (v.poster && !allImages.includes(v.poster)) {
          allImages.push(v.poster);
        }
      }
    }
  };

  const mediaElements = Array.from(
    document.querySelectorAll<HTMLElement>(
      'img, picture, figure, svg image, video, [tt-videoid], [data-video-url], [data-poster], [tt-poster], [data-bg], [data-background]',
    ),
  );
  for (const mediaEl of mediaElements) {
    if (isInternalElement(mediaEl)) continue;
    const elPage = getElementPageRect(mediaEl);
    const info = getIntersection(elPage);
    if (!info) continue;

    if (info.centerInBox || info.overlapRatio >= 0.05 || info.intersectArea >= 30) {
      const extractedImgs = extractImagesFromElement(mediaEl, window.location.href);
      for (const imgUrl of extractedImgs) {
        if (!allImages.includes(imgUrl)) {
          allImages.push(imgUrl);
        }
      }

      const extractedVids = extractVideosFromElement(mediaEl, window.location.href);
      addExtractedVideos(extractedVids);
    }
  }

  // 2. Candidate content elements
  const candidates: HTMLElement[] = [];
  const contentTagRegex = /^(p|h[1-6]|li|blockquote|pre|code|table|tr|figure|figcaption|article|section|div|span|a|ul|ol|dd|dt)$/i;

  for (let i = 0; i < allElements.length; i++) {
    const el = allElements[i];
    if (!el || isInternalElement(el)) continue;

    const elPage = getElementPageRect(el);
    const info = getIntersection(elPage);
    if (!info) continue;

    // Skip massive wrapper containers that dwarf the selection
    if (info.elArea > selectionArea * 3.5 && info.overlapRatio < 0.65) {
      continue;
    }

    const isContentTag = contentTagRegex.test(el.tagName);
    const isCandidate =
      info.centerInBox ||
      info.overlapRatio >= 0.2 ||
      (isContentTag && info.intersectArea >= 30);

    if (isCandidate) {
      candidates.push(el);
    }
  }

  // 3. Keep top-level selected elements to avoid nested duplicate text / HTML
  const topLevel = candidates.filter((el) => {
    let p = el.parentElement;
    while (p && p !== document.body && p !== document.documentElement) {
      if (candidates.includes(p)) {
        const pr = getElementPageRect(p);
        if (pr.width * pr.height <= selectionArea * 1.5) {
          return false;
        }
      }
      p = p.parentElement;
    }
    return true;
  });

  // 4. Fallback if no candidates found
  if (topLevel.length === 0 && candidates.length === 0) {
    let bestEl: HTMLElement | null = null;
    let maxIntersect = 0;

    for (let i = 0; i < allElements.length; i++) {
      const el = allElements[i];
      if (!el || isInternalElement(el)) continue;
      const elPage = getElementPageRect(el);
      const info = getIntersection(elPage);
      if (info && info.intersectArea > maxIntersect) {
        maxIntersect = info.intersectArea;
        bestEl = el;
      }
    }

    if (bestEl) {
      return extractElementContent(bestEl, screenshot, pageRect);
    }
  }

  const selectedElements = topLevel.length > 0 ? topLevel : candidates;

  // 5. Sort elements by natural DOM order for coherent reading
  selectedElements.sort((a, b) => {
    const pos = a.compareDocumentPosition(b);
    if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
    if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
    return 0;
  });

  // 6. Aggregate text, HTML, images, videos and links
  const textPieces: string[] = [];
  const htmlPieces: string[] = [];
  const allLinks: string[] = [];

  selectedElements.forEach((el) => {
    const text = (el.innerText || el.textContent || '').trim();
    if (text && !textPieces.includes(text)) {
      textPieces.push(text);
    }

    htmlPieces.push(normalizeHtml(el, window.location.href));

    extractImagesFromElement(el, window.location.href).forEach((img) => {
      if (!allImages.includes(img)) {
        allImages.push(img);
      }
    });

    addExtractedVideos(extractVideosFromElement(el, window.location.href));

    if (el.tagName.toLowerCase() === 'a' && (el as HTMLAnchorElement).href) {
      const href = (el as HTMLAnchorElement).href;
      if (!allLinks.includes(href)) allLinks.push(href);
    }
    el.querySelectorAll('a').forEach((a) => {
      if (a.href && !allLinks.includes(a.href)) allLinks.push(a.href);
    });
  });

  return {
    id: `grab_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    url: window.location.href,
    tdk,
    selectedHtml: htmlPieces.length === 1 ? htmlPieces[0]! : `<div class="drag-selected-area">\n${htmlPieces.join('\n')}\n</div>`,
    selectedText: textPieces.join('\n\n'),
    selector: selectedElements.length === 1 ? generateSelector(selectedElements[0]!) : 'box-selection',
    tag: selectedElements.length === 1 ? selectedElements[0]!.tagName.toLowerCase() : 'selection-area',
    dimensions: { width: Math.round(rect.width), height: Math.round(pageRect ? pageRect.height : rect.height) },
    images: allImages,
    videos: allVideos,
    links: allLinks,
    screenshot,
    pageRect: pageRect
      ? {
          left: Math.round(pageRect.left),
          top: Math.round(pageRect.top),
          width: Math.round(pageRect.width),
          height: Math.round(pageRect.height),
        }
      : undefined,
    pageScroll: { x: window.scrollX || 0, y: window.scrollY || 0 },
    createdAt: Date.now(),
  };
}

/**
 * Extract full webpage metadata, media, and text content for full page grab
 */
export function extractFullPageContent(screenshot?: string): GrabbedContent {
  const rootEl = document.body || document.documentElement;
  const { width: fullWidth, height: fullHeight } = calculateFullPageDimensions();

  const tdk = extractPageTDK(document);
  const images = extractImagesFromElement(rootEl, window.location.href);
  const videos = extractVideosFromElement(rootEl, window.location.href);

  const linkSet = new Set<string>();
  document.querySelectorAll<HTMLAnchorElement>('a[href]').forEach((a) => {
    if (a.href && !a.href.startsWith('javascript:')) {
      linkSet.add(a.href);
    }
  });

  return {
    id: `page_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    url: window.location.href,
    tdk,
    selectedHtml: normalizeHtml(rootEl, window.location.href),
    selectedText: (rootEl.innerText || rootEl.textContent || '').trim(),
    selector: 'html',
    tag: 'page',
    dimensions: { width: Math.round(fullWidth), height: Math.round(fullHeight) },
    images,
    videos,
    links: Array.from(linkSet),
    screenshot,
    pageRect: {
      left: 0,
      top: 0,
      width: Math.round(fullWidth),
      height: Math.round(fullHeight),
    },
    pageScroll: { x: 0, y: 0 },
    createdAt: Date.now(),
  };
}
