import type { GrabbedVideo } from '../types';
import { normalizeImageUrl } from './imageExtractor';

/**
 * Normalizes raw candidate string into an absolute video URL
 */
export function normalizeVideoUrl(
  rawUrl: string | null | undefined,
  baseHref: string = window.location.href,
): string | null {
  if (!rawUrl) return null;
  const trimmed = rawUrl.trim();
  if (
    !trimmed ||
    trimmed === '#' ||
    trimmed === 'about:blank' ||
    trimmed.startsWith('javascript:')
  ) {
    return null;
  }

  try {
    return new URL(trimmed, baseHref).href;
  } catch {
    return trimmed;
  }
}

/**
 * Common poster/cover attribute names across major video players
 */
const POSTER_ATTRIBUTES = [
  'poster',
  'tt-poster',
  'data-poster',
  'data-cover',
  'data-poster-url',
  'data-thumb',
  'data-thumbnail',
  'data-pic',
] as const;

/**
 * Extracts poster image URL from video element or its container
 */
function extractPosterFromElement(
  el: HTMLElement,
  baseHref: string = window.location.href,
): string | undefined {
  // 1. Direct attribute inspection
  for (const attr of POSTER_ATTRIBUTES) {
    const val = el.getAttribute(attr);
    if (val) {
      const normalized = normalizeImageUrl(val, baseHref);
      if (normalized) return normalized;
    }
  }

  // 2. Look for .xgplayer-poster or poster elements inside container
  const posterEl = el.querySelector<HTMLElement>(
    '.xgplayer-poster, [class*="poster"], [class*="cover"], video[poster]',
  );
  if (posterEl) {
    for (const attr of POSTER_ATTRIBUTES) {
      const val = posterEl.getAttribute(attr);
      if (val) {
        const normalized = normalizeImageUrl(val, baseHref);
        if (normalized) return normalized;
      }
    }

    if (posterEl.style?.backgroundImage) {
      const bg = posterEl.style.backgroundImage;
      if (bg.startsWith('url(')) {
        const bgUrl = bg.replace(/^url\(["']?/, '').replace(/["']?\)$/, '');
        const normalized = normalizeImageUrl(bgUrl, baseHref);
        if (normalized) return normalized;
      }
    }
  }

  // 3. Inspect parent player container (e.g., .tt-video-box, .xgplayer)
  let parent = el.parentElement;
  let depth = 0;
  while (parent && depth < 4 && parent !== document.body) {
    for (const attr of POSTER_ATTRIBUTES) {
      const val = parent.getAttribute(attr);
      if (val) {
        const normalized = normalizeImageUrl(val, baseHref);
        if (normalized) return normalized;
      }
    }
    parent = parent.parentElement;
    depth++;
  }

  return undefined;
}

/**
 * Common video candidate attribute names
 */
const VIDEO_SRC_ATTRIBUTES = [
  'src',
  'data-src',
  'data-original-src',
  'data-origin-src',
  'data-video-url',
  'data-mp4',
  'data-video-src',
  'data-h264',
  'data-play-url',
  'data-url',
  'data-video',
  'data-raw-url',
] as const;

/**
 * Extract video source candidate from a video or player element
 */
function extractVideoSources(videoEl: HTMLVideoElement, baseHref: string): string[] {
  const sources: string[] = [];

  const addCandidate = (val: string | null | undefined) => {
    if (!val) return;
    const normalized = normalizeVideoUrl(val, baseHref);
    if (normalized && !sources.includes(normalized)) {
      sources.push(normalized);
    }
  };

  // 1. Prioritize direct HTTP/HTTPS sources from attributes
  for (const attr of VIDEO_SRC_ATTRIBUTES) {
    const val = videoEl.getAttribute(attr);
    if (val && !val.startsWith('blob:')) {
      addCandidate(val);
    }
  }

  // 2. Child <source> elements
  videoEl.querySelectorAll('source').forEach((source) => {
    for (const attr of VIDEO_SRC_ATTRIBUTES) {
      const val = source.getAttribute(attr);
      if (val && !val.startsWith('blob:')) {
        addCandidate(val);
      }
    }
    if (source.src && !source.src.startsWith('blob:')) {
      addCandidate(source.src);
    }
  });

  // 3. Fallback to DOM properties or blob: src if no direct http URL was discovered
  if (sources.length === 0) {
    for (const attr of VIDEO_SRC_ATTRIBUTES) {
      addCandidate(videoEl.getAttribute(attr));
    }
    addCandidate(videoEl.currentSrc);
    addCandidate(videoEl.src);
  }

  return sources;
}

/**
 * Extracts all valid videos contained within a given DOM element
 */
export function extractVideosFromElement(
  el: HTMLElement,
  baseHref: string = window.location.href,
): GrabbedVideo[] {
  const result: GrabbedVideo[] = [];
  const addedUrls = new Set<string>();

  const addVideo = (src: string, poster?: string, title?: string) => {
    const normalized = normalizeVideoUrl(src, baseHref);
    if (!normalized || addedUrls.has(normalized)) return;
    addedUrls.add(normalized);
    result.push({
      src: normalized,
      ...(poster ? { poster } : {}),
      ...(title ? { title } : {}),
    });
  };

  // 1. If the root element itself is a <video>
  if (el.tagName.toLowerCase() === 'video') {
    const videoEl = el as HTMLVideoElement;
    const poster = extractPosterFromElement(videoEl, baseHref);
    const sources = extractVideoSources(videoEl, baseHref);
    sources.forEach((src) => addVideo(src, poster));
  }

  // 2. Query all descendant <video> elements
  el.querySelectorAll<HTMLVideoElement>('video').forEach((videoEl) => {
    const poster = extractPosterFromElement(videoEl, baseHref);
    const sources = extractVideoSources(videoEl, baseHref);
    sources.forEach((src) => addVideo(src, poster));
  });

  // 3. Scan rich media containers (e.g. .xgplayer, .tt-video-box, [tt-videoid], [data-video-url])
  const containerCandidates = el.querySelectorAll<HTMLElement>(
    '[data-video-url], [data-mp4], [data-video-src], [data-origin-src], [data-play-url], [tt-videoid]',
  );

  containerCandidates.forEach((container) => {
    // If container already contains video handled above, skip duplicate scanning
    if (container.querySelector('video')) return;

    const poster = extractPosterFromElement(container, baseHref);
    for (const attr of VIDEO_SRC_ATTRIBUTES) {
      const videoUrl = container.getAttribute(attr);
      if (videoUrl) {
        addVideo(videoUrl, poster);
        break;
      }
    }
  });

  // 4. If current element is a link pointing to a video file
  if (el.tagName.toLowerCase() === 'a') {
    const href = (el as HTMLAnchorElement).href;
    if (href && /\.(mp4|webm|mov|m4v|mkv)(\?.*)?$/i.test(href)) {
      addVideo(href);
    }
  }

  return result;
}
