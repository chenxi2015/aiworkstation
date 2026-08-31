import type { GrabbedContent, GrabbedVideo, SniffedStream } from '../types';

/**
 * Correlates grabbed <video> elements with sniffed HLS playlists.
 *
 * blob: video srcs are undownloadable pointers, but the video's poster URL
 * and its HLS playlist URL usually share a distinctive content ID in the
 * path (e.g. Twitter: ext_tw_video_thumb/{id}/... ↔ ext_tw_video/{id}/...).
 * Matching on those shared path tokens recovers the real stream URL,
 * enabling WYSIWYG video downloads from grabbed regions.
 */

/** Distinctive ID-like tokens found in a URL path (numeric or long slugs) */
function extractIdTokens(rawUrl: string): Set<string> {
  const tokens = new Set<string>();
  if (!rawUrl || rawUrl.startsWith('blob:') || rawUrl.startsWith('data:')) return tokens;
  try {
    const { pathname } = new URL(rawUrl);
    for (const segment of pathname.split('/')) {
      for (const match of segment.matchAll(/\d{6,}/g)) {
        tokens.add(match[0]);
      }
      for (const match of segment.matchAll(/[A-Za-z0-9_-]{16,}/g)) {
        tokens.add(match[0]);
      }
    }
  } catch {
    // Not a parseable URL; no tokens
  }
  return tokens;
}

function scoreStream(videoTokens: Set<string>, stream: SniffedStream): number {
  const urls = [stream.url, ...(stream.children ?? [])];
  let score = 0;
  for (const url of urls) {
    for (const token of extractIdTokens(url)) {
      if (videoTokens.has(token)) score++;
    }
  }
  return score;
}

/**
 * Finds the sniffed stream that most likely belongs to a grabbed video.
 * Returns null when nothing correlates and no safe fallback exists.
 */
export function matchStreamForVideo(
  video: GrabbedVideo,
  streams: SniffedStream[],
): SniffedStream | null {
  const visible = streams.filter((s) => !s.hidden);
  if (visible.length === 0) return null;

  const videoTokens = new Set<string>([
    ...extractIdTokens(video.src),
    ...extractIdTokens(video.poster ?? ''),
  ]);

  let best: SniffedStream | null = null;
  let bestScore = 0;
  for (const stream of visible) {
    const score = videoTokens.size > 0 ? scoreStream(videoTokens, stream) : 0;
    if (score > bestScore) {
      bestScore = score;
      best = stream;
    }
  }
  if (best) return best;

  return null;
}

function videoNeedsStream(video: GrabbedVideo): boolean {
  if (!video.src) return true;
  if (video.src.startsWith('blob:')) return true;
  // Already a direct playlist or file URL: nothing to recover
  return false;
}

/**
 * Returns a copy of the grabbed content with videos enriched by matched
 * sniffed stream URLs. Returns the original object when nothing changes.
 *
 * Fallback: when the region has exactly one video and the page exposes
 * exactly one visible stream, they are assumed to be the same video.
 */
export function enrichGrabbedVideos(
  content: GrabbedContent,
  streams: SniffedStream[],
): GrabbedContent {
  const videos = content.videos;
  if (!videos || videos.length === 0) return content;

  const visible = streams.filter((s) => !s.hidden);
  let changed = false;

  const enriched = videos.map((video) => {
    if (video.hlsUrl || !videoNeedsStream(video)) return video;

    let matched = visible.length > 0 ? matchStreamForVideo(video, visible) : null;
    if (!matched && videos.length === 1 && visible.length === 1) {
      matched = visible[0] ?? null;
    }
    if (!matched) return video;

    changed = true;
    return { ...video, hlsUrl: matched.url };
  });

  return changed ? { ...content, videos: enriched } : content;
}
