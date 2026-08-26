import type { PageTDK } from '../types';

/**
 * Extract Title, Description, Keywords and metadata from current document
 */
export function extractPageTDK(doc: Document = document): PageTDK {
  const getMeta = (nameOrProperty: string): string => {
    const el =
      doc.querySelector(`meta[name="${nameOrProperty}"]`) ||
      doc.querySelector(`meta[property="${nameOrProperty}"]`) ||
      doc.querySelector(`meta[name="${nameOrProperty.toLowerCase()}"]`) ||
      doc.querySelector(`meta[property="${nameOrProperty.toLowerCase()}"]`);
    return el?.getAttribute('content')?.trim() || '';
  };

  // 1. Title extraction: og:title -> meta title -> document.title
  const title =
    getMeta('og:title') ||
    getMeta('twitter:title') ||
    doc.title ||
    doc.querySelector('h1')?.textContent?.trim() ||
    '';

  // 2. Description extraction: meta description -> og:description
  const description =
    getMeta('description') ||
    getMeta('og:description') ||
    getMeta('twitter:description') ||
    '';

  // 3. Keywords extraction: meta keywords
  const keywords = getMeta('keywords') || getMeta('news_keywords') || '';

  // 4. Favicon extraction
  const faviconEl =
    doc.querySelector('link[rel~="icon"]') ||
    doc.querySelector('link[rel="shortcut icon"]') ||
    doc.querySelector('link[rel="apple-touch-icon"]');
  let favicon = faviconEl?.getAttribute('href') || '';
  if (favicon && !favicon.startsWith('http') && !favicon.startsWith('data:')) {
    try {
      favicon = new URL(favicon, window.location.href).href;
    } catch {
      // Keep original if URL parse fails
    }
  }

  // 5. OpenGraph image
  let ogImage = getMeta('og:image') || getMeta('twitter:image') || '';
  if (ogImage && !ogImage.startsWith('http') && !ogImage.startsWith('data:')) {
    try {
      ogImage = new URL(ogImage, window.location.href).href;
    } catch {
      // Keep original
    }
  }

  // 6. Canonical URL
  const canonicalEl = doc.querySelector('link[rel="canonical"]');
  const canonical = canonicalEl?.getAttribute('href') || window.location.href;

  // 7. Site Name
  const siteName = getMeta('og:site_name') || window.location.hostname;

  return {
    title,
    description,
    keywords,
    url: window.location.href,
    favicon,
    ogImage,
    ogTitle: getMeta('og:title'),
    ogDescription: getMeta('og:description'),
    canonical,
    siteName,
  };
}
