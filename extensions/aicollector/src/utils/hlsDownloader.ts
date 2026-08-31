/**
 * HLS (m3u8) playlist parsing and segment-merging downloader.
 *
 * Designed to run in an extension page context (sidepanel), where
 * cross-origin fetch is allowed via host_permissions and
 * URL.createObjectURL is available for chrome.downloads.
 */

export interface HlsVariant {
  url: string;
  bandwidth: number;
  resolution?: string;
  /** EXT-X-MEDIA group id referenced by this variant's AUDIO attribute */
  audioGroup?: string;
}

export interface HlsAudioRendition {
  groupId: string;
  url: string;
  isDefault: boolean;
}

export interface HlsMediaInfo {
  /** Ordered segment URLs (init segment first when EXT-X-MAP is present) */
  segments: string[];
  /** fMP4 stream (EXT-X-MAP) vs MPEG-TS segment stream */
  container: 'mp4' | 'ts';
}

export interface HlsDownloadProgress {
  /** Number of segments finished */
  done: number;
  /** Total number of segments */
  total: number;
  /** 0-100 */
  percent: number;
  /** downloading = fetching segments; muxing = merging with ffmpeg */
  phase?: 'downloading' | 'muxing';
}

export interface HlsDownloadOptions {
  filenameBase?: string;
  onProgress?: (progress: HlsDownloadProgress) => void;
  signal?: AbortSignal;
  concurrency?: number;
}

const PLAYLIST_FETCH_TIMEOUT_MS = 15000;
const SEGMENT_FETCH_TIMEOUT_MS = 30000;

async function fetchText(url: string, signal?: AbortSignal): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PLAYLIST_FETCH_TIMEOUT_MS);
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort);
  try {
    const res = await fetch(url, { credentials: 'omit', signal: controller.signal });
    if (!res.ok) throw new Error(`播放列表请求失败 (HTTP ${res.status})`);
    return await res.text();
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

function resolveUrl(maybeRelative: string, baseUrl: string): string {
  return new URL(maybeRelative.trim(), baseUrl).href;
}

/**
 * Parses a master playlist into variant streams.
 * Returns an empty array when the text is not a master playlist.
 */
export function parseMasterPlaylist(text: string, baseUrl: string): HlsVariant[] {
  const lines = text.split('\n').map((l) => l.trim());
  const variants: HlsVariant[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (!line.startsWith('#EXT-X-STREAM-INF')) continue;

    const bandwidthMatch = line.match(/BANDWIDTH=(\d+)/);
    const resolutionMatch = line.match(/RESOLUTION=([\dx]+)/);
    const audioGroupMatch = line.match(/AUDIO="([^"]+)"/);
    // The variant URI is on the next non-empty, non-comment line
    for (let j = i + 1; j < lines.length; j++) {
      const uri = lines[j];
      if (!uri) continue;
      if (uri.startsWith('#')) break;
      variants.push({
        url: resolveUrl(uri, baseUrl),
        bandwidth: bandwidthMatch ? Number(bandwidthMatch[1]) : 0,
        resolution: resolutionMatch?.[1],
        audioGroup: audioGroupMatch?.[1],
      });
      break;
    }
  }

  return variants;
}

/**
 * Parses EXT-X-MEDIA audio renditions (separate audio track playlists)
 * declared by a master playlist.
 */
export function parseAudioRenditions(text: string, baseUrl: string): HlsAudioRendition[] {
  const renditions: HlsAudioRendition[] = [];

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line.startsWith('#EXT-X-MEDIA')) continue;
    if (!/TYPE=AUDIO/.test(line)) continue;

    const uriMatch = line.match(/URI="([^"]+)"/);
    if (!uriMatch?.[1]) continue;

    renditions.push({
      groupId: line.match(/GROUP-ID="([^"]+)"/)?.[1] ?? '',
      url: resolveUrl(uriMatch[1], baseUrl),
      isDefault: /DEFAULT=YES/.test(line),
    });
  }

  return renditions;
}

/**
 * Parses a media playlist into an ordered segment list.
 * Throws for encrypted, byte-range, or live (non-VOD) playlists.
 */
export function parseMediaPlaylist(text: string, baseUrl: string): HlsMediaInfo {
  if (/#EXT-X-KEY:[^\n]*METHOD=(AES-128|SAMPLE-AES)/i.test(text)) {
    throw new Error('加密 HLS 流（EXT-X-KEY）暂不支持下载');
  }
  if (/#EXT-X-BYTERANGE/i.test(text)) {
    throw new Error('字节范围（EXT-X-BYTERANGE）流暂不支持下载');
  }
  if (!/#EXT-X-ENDLIST/i.test(text)) {
    throw new Error('检测到直播流（无 ENDLIST），暂不支持直接下载');
  }

  const segments: string[] = [];
  let container: 'mp4' | 'ts' = 'ts';

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith('#EXT-X-MAP')) {
      const uriMatch = line.match(/URI="([^"]+)"/);
      if (uriMatch?.[1]) {
        container = 'mp4';
        // Init segment must be written before all media segments
        segments.unshift(resolveUrl(uriMatch[1], baseUrl));
      }
      continue;
    }

    if (line.startsWith('#')) continue;
    segments.push(resolveUrl(line, baseUrl));
  }

  if (segments.length === 0) {
    throw new Error('播放列表中没有找到任何分片');
  }

  return { segments, container };
}

async function fetchSegment(
  url: string,
  signal: AbortSignal | undefined,
  retries = 2,
): Promise<ArrayBuffer> {
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, 500 * attempt));
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SEGMENT_FETCH_TIMEOUT_MS);
    const onAbort = () => controller.abort();
    signal?.addEventListener('abort', onAbort);
    try {
      const res = await fetch(url, { credentials: 'omit', signal: controller.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.arrayBuffer();
    } catch (err) {
      lastError = err;
      if (signal?.aborted) throw err;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }
  }

  throw lastError instanceof Error ? lastError : new Error('分片下载失败');
}

function sanitizeFilename(name: string): string {
  const cleaned = name
    .replace(/[\\/:*?"<>|#\s]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
  return cleaned || 'video';
}

/**
 * Downloads an ordered segment list with bounded concurrency, preserving
 * segment order in the returned buffer array.
 */
async function downloadSegments(
  segments: string[],
  signal: AbortSignal | undefined,
  concurrency: number,
  onSegmentDone: () => void,
): Promise<ArrayBuffer[]> {
  const buffers: (ArrayBuffer | null)[] = new Array(segments.length).fill(null);
  let cursor = 0;

  const worker = async () => {
    while (true) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      const index = cursor++;
      if (index >= segments.length) return;
      const segmentUrl = segments[index];
      if (!segmentUrl) return;
      buffers[index] = await fetchSegment(segmentUrl, signal);
      onSegmentDone();
    }
  };

  const workerCount = Math.max(1, Math.min(concurrency, segments.length));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  const parts = buffers.filter((b): b is ArrayBuffer => b !== null);
  if (parts.length !== segments.length) {
    throw new Error(`分片不完整 (${parts.length}/${segments.length})`);
  }
  return parts;
}

function mergeParts(parts: ArrayBuffer[], mimeType: string): Blob {
  return new Blob(parts, { type: mimeType });
}

function concatParts(parts: ArrayBuffer[]): Uint8Array {
  const total = parts.reduce((sum, p) => sum + p.byteLength, 0);
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    merged.set(new Uint8Array(part), offset);
    offset += part.byteLength;
  }
  return merged;
}

async function saveBlob(blob: Blob, filename: string): Promise<void> {
  const objectUrl = URL.createObjectURL(blob);
  try {
    await chrome.downloads.download({
      url: objectUrl,
      filename,
      conflictAction: 'uniquify',
      saveAs: false,
    });
  } finally {
    // Give the downloads API a moment to grab the blob before revoking
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  }
}

export interface HlsFetchResult {
  blob: Blob;
  /** File extension matching the produced container: mp4 or ts */
  extension: 'mp4' | 'ts';
  warning?: string;
}

/**
 * Picks the highest-bandwidth variant, downloads all segments with bounded
 * concurrency, and returns the merged result as a Blob.
 *
 * When the master playlist declares a separate audio track (common on
 * Twitter/X), both tracks are downloaded and muxed into a single MP4 via
 * ffmpeg.wasm. Single-track MPEG-TS playlists merge into a .ts file;
 * fMP4 playlists (EXT-X-MAP) merge into a playable .mp4 file.
 */
export async function fetchHlsStream(
  playlistUrl: string,
  options: HlsDownloadOptions = {},
): Promise<HlsFetchResult> {
  const { onProgress, signal, concurrency = 4 } = options;

  const playlistText = await fetchText(playlistUrl, signal);

  let mediaPlaylistUrl = playlistUrl;
  let mediaText = playlistText;
  let audioPlaylistUrl: string | null = null;

  if (playlistText.includes('#EXT-X-STREAM-INF')) {
    const variants = parseMasterPlaylist(playlistText, playlistUrl);
    if (variants.length === 0) {
      throw new Error('Master 播放列表中没有可用的清晰度');
    }
    const best = variants.reduce((a, b) => (b.bandwidth > a.bandwidth ? b : a));
    mediaPlaylistUrl = best.url;
    mediaText = await fetchText(mediaPlaylistUrl, signal);

    // Separate audio track (EXT-X-MEDIA), typical for Twitter/X videos
    const renditions = parseAudioRenditions(playlistText, playlistUrl);
    if (renditions.length > 0) {
      const matched =
        renditions.find((r) => r.groupId && r.groupId === best.audioGroup && r.isDefault) ||
        renditions.find((r) => r.groupId && r.groupId === best.audioGroup) ||
        renditions.find((r) => r.isDefault) ||
        renditions[0];
      audioPlaylistUrl = matched?.url ?? null;
    }
  }

  const { segments, container } = parseMediaPlaylist(mediaText, mediaPlaylistUrl);

  // Fast path: no separate audio track, keep original container
  if (!audioPlaylistUrl) {
    let done = 0;
    const parts = await downloadSegments(segments, signal, concurrency, () => {
      done++;
      onProgress?.({
        done,
        total: segments.length,
        percent: Math.round((done / segments.length) * 100),
        phase: 'downloading',
      });
    });

    const mimeType = container === 'mp4' ? 'video/mp4' : 'video/mp2t';
    return { blob: mergeParts(parts, mimeType), extension: container };
  }

  // Split A/V path: fetch both playlists, then mux into MP4
  const audioText = await fetchText(audioPlaylistUrl, signal);
  const audioMedia = parseMediaPlaylist(audioText, audioPlaylistUrl);

  const totalSegments = segments.length + audioMedia.segments.length;
  let done = 0;
  const reportProgress = () => {
    done++;
    onProgress?.({
      done,
      total: totalSegments,
      percent: Math.round((done / totalSegments) * 100),
      phase: 'downloading',
    });
  };

  const [videoParts, audioParts] = await Promise.all([
    downloadSegments(segments, signal, concurrency, reportProgress),
    downloadSegments(audioMedia.segments, signal, concurrency, reportProgress),
  ]);

  onProgress?.({ done: totalSegments, total: totalSegments, percent: 100, phase: 'muxing' });

  const videoBytes = concatParts(videoParts);
  const audioBytes = concatParts(audioParts);

  try {
    const { muxToMp4 } = await import('./ffmpegMuxer');
    const mp4 = await muxToMp4(videoBytes, audioBytes);
    return {
      blob: new Blob([mp4 as unknown as BlobPart], { type: 'video/mp4' }),
      extension: 'mp4',
    };
  } catch (err) {
    // Muxing unavailable/failed: still deliver the video track so the user
    // gets something, and surface a clear warning.
    console.warn('[AI Collector] A/V muxing failed, saving video track only:', err);
    return {
      blob: new Blob([videoBytes as unknown as BlobPart], { type: 'video/mp2t' }),
      extension: 'ts',
      warning: '音轨合并失败，仅包含无声视频',
    };
  }
}

/**
 * Fetches an HLS stream and saves it via chrome.downloads.
 * Thin wrapper around fetchHlsStream.
 */
export async function downloadHlsStream(
  playlistUrl: string,
  options: HlsDownloadOptions = {},
): Promise<{ filename: string; warning?: string }> {
  const base = sanitizeFilename(options.filenameBase || 'video');
  const result = await fetchHlsStream(playlistUrl, options);
  const suffix = result.warning ? '_video_only' : '';
  const filename = `${base}${suffix}.${result.extension}`;
  await saveBlob(result.blob, filename);
  return { filename, warning: result.warning };
}
