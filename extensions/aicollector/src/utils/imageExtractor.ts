/**
 * Image extraction utilities for DOM elements and web pages.
 * Handles lazy loading attributes, srcset, picture elements,
 * background images, and platform-specific formats (e.g. WeChat, QbitAI).
 */

/**
 * Filter out transparent or placeholder data URIs, tracking pixels, or invalid values
 */
function isPlaceholder(url: string): boolean {
  if (!url) return true;
  const trimmed = url.trim();
  if (
    !trimmed ||
    trimmed === '#' ||
    trimmed === 'about:blank' ||
    trimmed.startsWith('javascript:') ||
    trimmed.startsWith('chrome-extension://') ||
    trimmed.startsWith('moz-extension://') ||
    trimmed.startsWith('edge-extension://') ||
    trimmed.startsWith('extension://')
  ) {
    return true;
  }
  // Filter out tiny 1x1 transparent gif / svg placeholder data URLs
  if (trimmed.startsWith('data:image/svg+xml') || trimmed.startsWith('data:image/gif')) {
    return true;
  }
  if (trimmed.startsWith('data:') && trimmed.length < 80) {
    return true;
  }
  return false;
}

/**
 * Normalizes raw candidate string into an absolute URL
 */
export function normalizeImageUrl(rawUrl: string, baseHref: string = window.location.href, dataType?: string | null): string | null {
  if (!rawUrl) return null;
  let trimmed = rawUrl.trim();
  if (!trimmed || isPlaceholder(trimmed)) return null;

  // Handle srcset candidates (take the highest quality / last valid candidate)
  if (trimmed.includes(' ') && !trimmed.startsWith('data:')) {
    const parts = trimmed.split(',').map((p) => p.trim().split(/\s+/)[0]).filter(Boolean);
    if (parts.length > 0) {
      trimmed = parts[parts.length - 1] || parts[0] || '';
    }
  }
  if (!trimmed || isPlaceholder(trimmed)) return null;

  // WeChat platform specific: append wx_fmt if missing and data-type exists
  if (trimmed.includes('qpic.cn') && dataType && !trimmed.includes('wx_fmt=')) {
    const separator = trimmed.includes('?') ? '&' : '?';
    trimmed = `${trimmed}${separator}wx_fmt=${dataType}`;
  }

  try {
    const resolved = new URL(trimmed, baseHref).href;
    if (
      resolved.startsWith('chrome-extension://') ||
      resolved.startsWith('moz-extension://') ||
      resolved.startsWith('edge-extension://')
    ) {
      return null;
    }
    return resolved;
  } catch {
    return trimmed;
  }
}

/**
 * Common lazy load attribute names across major websites (WeChat, Zhihu, CSDN, Medium, etc.)
 */
const LAZY_IMAGE_ATTRIBUTES = [
  'data-src',
  'data-original',
  'data-original-src',
  'data-actualsrc',
  'data-lazy-src',
  'data-lazyload',
  'data-origin-src',
  'data-echo',
  'data-zoom-src',
  'data-large-file',
  'data-highres',
  'data-full-src',
  'data-pic',
  'data-cover',
  'data-img-url',
  'data-url',
  'data-srcset',
  'srcset',
  'src',
] as const;

/**
 * Extract the best valid image URL from an <img> element
 */
function extractFromImgElement(img: Element, baseHref: string): string | null {
  const dataType = img.getAttribute('data-type');

  // Try candidate attributes in order of quality/reliability
  for (const attr of LAZY_IMAGE_ATTRIBUTES) {
    const val = img.getAttribute(attr);
    if (val && !isPlaceholder(val)) {
      const normalized = normalizeImageUrl(val, baseHref, dataType);
      if (normalized && !isPlaceholder(normalized)) {
        return normalized;
      }
    }
  }

  // Fallback to DOM properties if available
  const imgEl = img as HTMLImageElement;
  if (imgEl.currentSrc && !isPlaceholder(imgEl.currentSrc)) {
    const normalized = normalizeImageUrl(imgEl.currentSrc, baseHref, dataType);
    if (normalized && !isPlaceholder(normalized)) return normalized;
  }
  if (imgEl.src && !isPlaceholder(imgEl.src)) {
    const normalized = normalizeImageUrl(imgEl.src, baseHref, dataType);
    if (normalized && !isPlaceholder(normalized)) return normalized;
  }

  return null;
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

  // 1. Process <img> elements (root element and all descendants)
  if (el.tagName.toLowerCase() === 'img') {
    const bestUrl = extractFromImgElement(el, baseHref);
    if (bestUrl) addImage(bestUrl);
  }
  el.querySelectorAll('img').forEach((img) => {
    const bestUrl = extractFromImgElement(img, baseHref);
    if (bestUrl) addImage(bestUrl);
  });

  // 2. Process <picture> > <source> tags
  if (el.tagName.toLowerCase() === 'source') {
    addImage(el.getAttribute('srcset') || el.getAttribute('data-srcset'));
  }
  el.querySelectorAll('picture source, source').forEach((source) => {
    const srcCandidate = source.getAttribute('srcset') || source.getAttribute('data-srcset');
    addImage(srcCandidate);
  });

  // 3. Process SVG <image> elements
  if (el.tagName.toLowerCase() === 'image') {
    addImage(el.getAttribute('href') || el.getAttribute('xlink:href'));
  }
  el.querySelectorAll('svg image, image').forEach((svgImg) => {
    addImage(svgImg.getAttribute('href') || svgImg.getAttribute('xlink:href'));
  });

  // 4. Process video elements and player poster attributes (tt-poster, data-poster, etc.)
  const posterAttrs = ['poster', 'tt-poster', 'data-poster', 'data-cover', 'data-poster-url'];
  if (el.tagName.toLowerCase() === 'video') {
    posterAttrs.forEach((attr) => addImage(el.getAttribute(attr)));
  }
  el.querySelectorAll('video, [tt-poster], [data-poster], [data-cover], [data-poster-url]').forEach((videoLike) => {
    posterAttrs.forEach((attr) => addImage(videoLike.getAttribute(attr)));
  });

  // 5. Process CSS background-image and data-bg attributes
  const processBg = (elem: HTMLElement) => {
    if (!elem) return;

    // Check data-bg, data-background attributes
    const dataBg = elem.getAttribute('data-bg') || elem.getAttribute('data-background') || elem.getAttribute('data-bg-url');
    if (dataBg) {
      addImage(dataBg);
    }

    if (elem.style) {
      const bg = elem.style.backgroundImage || (typeof window !== 'undefined' ? window.getComputedStyle(elem).backgroundImage : '');
      if (bg && bg.startsWith('url(')) {
        const bgUrl = bg.replace(/^url\(["']?/, '').replace(/["']?\)$/, '');
        addImage(bgUrl);
      }
    }
  };

  processBg(el);
  const allSubElements = el.querySelectorAll('*');
  const maxScanCount = Math.min(allSubElements.length, 50);
  for (let i = 0; i < maxScanCount; i++) {
    const subEl = allSubElements[i] as HTMLElement;
    if (subEl) processBg(subEl);
  }

  return images;
}

