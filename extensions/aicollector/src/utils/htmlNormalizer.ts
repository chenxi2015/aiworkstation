import { normalizeImageUrl } from './imageExtractor';

/**
 * HTML content normalizer and sanitizer
 * Ensures extracted HTML snippets are complete, self-contained, and valid
 */

const LAZY_ATTRS = [
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
];

/**
 * Normalizes HTML by resolving relative URLs and restoring lazy-loaded image sources
 */
export function normalizeHtml(element: HTMLElement, baseUrl: string): string {
  // Clone element to prevent mutations on active DOM
  const clone = element.cloneNode(true) as HTMLElement;

  // 1. Remove dangerous script and iframe elements
  const hazardousElements = clone.querySelectorAll('script, noscript, iframe');
  hazardousElements.forEach((node) => node.remove());

  // 2. Strip inline event listeners (e.g. onclick, onload, onerror)
  const allElements = clone.querySelectorAll('*');
  allElements.forEach((el) => {
    const attrNames = Array.from(el.attributes).map((attr) => attr.name);
    attrNames.forEach((name) => {
      if (name.startsWith('on')) {
        el.removeAttribute(name);
      }
    });
  });

  // 3. Normalize image sources (Restore lazy loading attributes commonly used in WeChat, Zhihu, Medium, etc.)
  const images = clone.querySelectorAll<HTMLImageElement>('img');
  images.forEach((img) => {
    const dataType = img.getAttribute('data-type');
    let resolvedUrl: string | null = null;

    for (const attr of LAZY_ATTRS) {
      const val = img.getAttribute(attr);
      if (val) {
        const normalized = normalizeImageUrl(val, baseUrl, dataType);
        if (normalized) {
          resolvedUrl = normalized;
          break;
        }
      }
    }

    if (resolvedUrl) {
      img.setAttribute('src', resolvedUrl);
    }

    // Clean up lazy attributes to keep HTML tidy
    LAZY_ATTRS.forEach((attr) => {
      if (attr !== 'src') {
        img.removeAttribute(attr);
      }
    });

    // Reset visibility styles applied by lazy loaders
    if (img.style.visibility === 'hidden') {
      img.style.visibility = 'visible';
    }
    if (img.style.display === 'none') {
      img.style.display = '';
    }
    if (img.style.opacity === '0') {
      img.style.opacity = '1';
    }
  });

  // 4. Normalize hyperlinks to absolute URLs
  const links = clone.querySelectorAll<HTMLAnchorElement>('a');
  links.forEach((a) => {
    const href = a.getAttribute('href');
    if (href && !href.startsWith('javascript:') && !href.startsWith('#')) {
      try {
        a.setAttribute('href', new URL(href, baseUrl).href);
      } catch {
        // Ignore invalid URLs
      }
    }
  });

  // 5. Normalize media source URLs (audio, video, source tags)
  const mediaElements = clone.querySelectorAll<HTMLMediaElement>('video, audio, source');
  mediaElements.forEach((media) => {
    const src = media.getAttribute('src') || media.getAttribute('srcset') || media.getAttribute('data-src');
    if (src) {
      try {
        media.setAttribute('src', new URL(src, baseUrl).href);
      } catch {
        // Ignore
      }
    }
  });

  return clone.outerHTML;
}
