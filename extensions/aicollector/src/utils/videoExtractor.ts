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

  // 1. Tag attributes & DOM properties
  addCandidate(videoEl.getAttribute('src'));
  addCandidate(videoEl.getAttribute('data-src'));
  addCandidate(videoEl.getAttribute('data-original-src'));
  addCandidate(videoEl.getAttribute('data-url'));
  addCandidate(videoEl.currentSrc);
  addCandidate(videoEl.src);

  // 2. Child <source> elements
  videoEl.querySelectorAll('source').forEach((source) => {
    addCandidate(source.getAttribute('src'));
    addCandidate(source.getAttribute('data-src'));
    addCandidate(source.getAttribute('data-url'));
    addCandidate(source.src);
  });

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

  // 3. Scan video containers (e.g. .xgplayer, .tt-video-box, [tt-videoid], [data-video-url])
  const containerCandidates = el.querySelectorAll<HTMLElement>(
    '[data-video-url], [data-mp4], [data-video-src], [tt-videoid]',
  );

  containerCandidates.forEach((container) => {
    // If container already contains video handled above, skip duplicate scanning
    if (container.querySelector('video')) return;

    const poster = extractPosterFromElement(container, baseHref);
    const videoUrl =
      container.getAttribute('data-video-url') ||
      container.getAttribute('data-mp4') ||
      container.getAttribute('data-video-src');

    if (videoUrl) {
      addVideo(videoUrl, poster);
    }
  });

  return result;
}
