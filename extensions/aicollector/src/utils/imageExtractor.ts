/**
 * Image extraction utilities for DOM elements and web pages.
 * Handles lazy loading attributes, srcset, picture elements,
 * background images, and platform-specific formats (e.g. WeChat, QbitAI).
 */

/**
 * Filter out transparent or placeholder data URIs
 */
function isPlaceholder(url: string): boolean {
  if (!url || url.length < 30) return true;
  if (url.startsWith('data:image/svg+xml') || url.startsWith('data:image/gif')) {
    return true;
  }
  return false;
}

/**
 * Normalizes raw candidate string into an absolute URL
 */
function normalizeImageUrl(rawUrl: string, baseHref: string, dataType?: string | null): string | null {
  let trimmed = rawUrl.trim();
  if (!trimmed || isPlaceholder(trimmed)) return null;

  // Handle srcset candidates (take the highest quality / last valid candidate)
  if (trimmed.includes(' ') && !trimmed.startsWith('data:')) {
    const parts = trimmed.split(',').map((p) => p.trim().split(/\s+/)[0]);
    trimmed = parts[parts.length - 1] || parts[0] || '';
  }
  if (!trimmed || isPlaceholder(trimmed)) return null;

  // WeChat platform specific: append wx_fmt if missing and data-type exists
  if (trimmed.includes('qpic.cn') && dataType && !trimmed.includes('wx_fmt=')) {
    const separator = trimmed.includes('?') ? '&' : '?';
    trimmed = `${trimmed}${separator}wx_fmt=${dataType}`;
  }

  try {
    return new URL(trimmed, baseHref).href;
  } catch {
    return trimmed;
  }
}

/**
 * Extracts all valid image URLs contained within a given DOM element
 */
export function extractImagesFromElement(
  el: HTMLElement,
  baseHref: string = window.location.href,
): string[] {
  const images: string[] = [];

  const addImage = (rawUrl: string | null | undefined, dataType?: string | null) => {
    if (!rawUrl) return;
    const normalized = normalizeImageUrl(rawUrl, baseHref, dataType);
    if (normalized && !images.includes(normalized)) {
      images.push(normalized);
    }
  };

  // Helper to extract image candidates from an img element
  const processImg = (img: Element) => {
    const dataType = img.getAttribute('data-type');
    const candidate =
      img.getAttribute('data-src') ||
      img.getAttribute('data-original-src') ||
      img.getAttribute('data-original') ||
      img.getAttribute('data-actualsrc') ||
      img.getAttribute('data-url') ||
      (img as HTMLImageElement).currentSrc ||
      (img as HTMLImageElement).src ||
      img.getAttribute('src');
    addImage(candidate, dataType);
  };

  // 1. Process <img> elements (root element and descendants)
  if (el.tagName.toLowerCase() === 'img') {
    processImg(el);
  }
  el.querySelectorAll('img').forEach(processImg);

  // 2. Process <picture> > <source> tags (root element and descendants)
  if (el.tagName.toLowerCase() === 'source') {
    addImage(el.getAttribute('srcset') || el.getAttribute('data-srcset'));
  }
  el.querySelectorAll('picture source, source').forEach((source) => {
    const srcCandidate = source.getAttribute('srcset') || source.getAttribute('data-srcset');
    addImage(srcCandidate);
  });

  // 3. Process CSS background-image (root element and descendants)
  const processBg = (elem: HTMLElement) => {
    if (elem && elem.style) {
      const bg = elem.style.backgroundImage || window.getComputedStyle(elem).backgroundImage;
      if (bg && bg.startsWith('url(')) {
        const bgUrl = bg.replace(/^url\(["']?/, '').replace(/["']?\)$/, '');
        addImage(bgUrl);
      }
    }
  };

  processBg(el);
  const bgElements = el.querySelectorAll('*');
  const maxScanCount = Math.min(bgElements.length, 30);
  for (let i = 0; i < maxScanCount; i++) {
    processBg(bgElements[i] as HTMLElement);
  }

  return images;
}
