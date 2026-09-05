import { promises as fs, existsSync, mkdirSync, createWriteStream, createReadStream } from 'node:fs';
import { spawn } from 'node:child_process';
import { createDecipheriv } from 'node:crypto';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { remuxTsToMp4, muxDualTracksToMp4 } from './nativeFfmpeg.ts';

export interface ServerVideoTask {
  id: string;
  url: string;
  pageTitle: string;
  pageUrl?: string;
  status: 'pending' | 'downloading' | 'muxing' | 'done' | 'error' | 'cancelled';
  percent: number;
  doneSegments: number;
  totalSegments: number;
  phase?: 'downloading' | 'muxing';
  outputPath?: string;
  filename?: string;
  error?: string;
  createdAt: number;
  completedAt?: number;
}

export interface SegmentCryptoInfo {
  method: 'AES-128';
  keyUrl: string;
  iv: Buffer;
}

export interface VideoSegmentItem {
  url: string;
  crypto?: SegmentCryptoInfo;
}

function sanitizeFilename(name: string): string {
  const cleaned = name
    .replace(/[\\/:*?"<>|#\s]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
  return cleaned || `video_${Date.now()}`;
}

function resolveUrl(maybeRelative: string, baseUrl: string): string {
  return new URL(maybeRelative.trim(), baseUrl).href;
}

async function fetchText(url: string, headers?: Record<string, string>): Promise<string> {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`请求播放列表失败 (HTTP ${res.status}): ${url}`);
  return await res.text();
}

const keyCache = new Map<string, Promise<Buffer>>();

function fetchKeyCached(
  url: string,
  headers?: Record<string, string>,
  signal?: AbortSignal,
): Promise<Buffer> {
  const cached = keyCache.get(url);
  if (cached) return cached;

  const promise = (async () => {
    const res = await fetch(url, { headers, signal });
    if (!res.ok) throw new Error(`获取解密密钥失败 (HTTP ${res.status}): ${url}`);
    const ab = await res.arrayBuffer();
    return Buffer.from(ab);
  })();

  keyCache.set(url, promise);
  return promise;
}

function parseMasterPlaylist(text: string, baseUrl: string): { url: string; bandwidth: number; audioGroup?: string }[] {
  const lines = text.split('\n').map((l) => l.trim());
  const variants: { url: string; bandwidth: number; audioGroup?: string }[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.startsWith('#EXT-X-STREAM-INF')) continue;

    const bwMatch = line.match(/BANDWIDTH=(\d+)/);
    const audioMatch = line.match(/AUDIO="([^"]+)"/);
    for (let j = i + 1; j < lines.length; j++) {
      const uri = lines[j];
      if (!uri) continue;
      if (uri.startsWith('#')) break;
      variants.push({
        url: resolveUrl(uri, baseUrl),
        bandwidth: bwMatch ? Number(bwMatch[1]) : 0,
        audioGroup: audioMatch?.[1],
      });
      break;
    }
  }
  return variants;
}

function parseAudioPlaylistUrl(text: string, baseUrl: string, targetAudioGroup?: string): string | null {
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('#EXT-X-MEDIA') || !/TYPE=AUDIO/.test(trimmed)) continue;
    const uriMatch = trimmed.match(/URI="([^"]+)"/);
    if (!uriMatch?.[1]) continue;

    const groupId = trimmed.match(/GROUP-ID="([^"]+)"/)?.[1];
    if (!targetAudioGroup || groupId === targetAudioGroup) {
      return resolveUrl(uriMatch[1], baseUrl);
    }
  }
  return null;
}

function parseMediaPlaylist(text: string, baseUrl: string): { segments: VideoSegmentItem[]; isFmp4: boolean } {
  const segments: VideoSegmentItem[] = [];
  let isFmp4 = false;

  let currentCrypto: { method: string; keyUrl: string; rawIv?: string } | null = null;
  let mediaSequence = 0;

  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;

    if (line.startsWith('#EXT-X-MEDIA-SEQUENCE:')) {
      const match = line.match(/#EXT-X-MEDIA-SEQUENCE:(\d+)/);
      if (match?.[1]) {
        mediaSequence = parseInt(match[1], 10);
      }
      continue;
    }

    if (line.startsWith('#EXT-X-KEY:')) {
      const methodMatch = line.match(/METHOD=([^,\s]+)/);
      const method = methodMatch?.[1]?.toUpperCase();

      if (!method || method === 'NONE') {
        currentCrypto = null;
      } else if (method === 'AES-128') {
        const uriMatch = line.match(/URI="([^"]+)"/) || line.match(/URI=([^,\s]+)/);
        if (uriMatch?.[1]) {
          const ivMatch = line.match(/IV=(0x[0-9a-fA-F]+)/i);
          currentCrypto = {
            method: 'AES-128',
            keyUrl: resolveUrl(uriMatch[1], baseUrl),
            rawIv: ivMatch?.[1],
          };
        }
      }
      continue;
    }

    if (line.startsWith('#EXT-X-MAP')) {
      const uriMatch = line.match(/URI="([^"]+)"/);
      if (uriMatch?.[1]) {
        isFmp4 = true;
        segments.unshift({
          url: resolveUrl(uriMatch[1], baseUrl),
        });
      }
      continue;
    }

    if (line.startsWith('#')) continue;

    const segSeq = mediaSequence + segments.length;
    let segCrypto: SegmentCryptoInfo | undefined;

    if (currentCrypto && currentCrypto.method === 'AES-128') {
      let ivBuf: Buffer;
      if (currentCrypto.rawIv) {
        const hex = currentCrypto.rawIv.slice(2).padStart(32, '0');
        ivBuf = Buffer.from(hex, 'hex');
      } else {
        ivBuf = Buffer.alloc(16);
        ivBuf.writeBigUInt64BE(BigInt(segSeq), 8);
      }

      segCrypto = {
        method: 'AES-128',
        keyUrl: currentCrypto.keyUrl,
        iv: ivBuf,
      };
    }

    segments.push({
      url: resolveUrl(line, baseUrl),
      crypto: segCrypto,
    });
  }

  return { segments, isFmp4 };
}

/**
 * Downloads a single segment to disk with timeout, retries, and atomic fs.writeFile.
 * Transparently decrypts AES-128 encrypted HLS chunks.
 */
async function downloadSegmentToFile(
  segment: VideoSegmentItem,
  destPath: string,
  headers?: Record<string, string>,
  signal?: AbortSignal,
  retries = 3,
): Promise<void> {
  let lastErr: any;

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (signal?.aborted) throw new Error('Download aborted');
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, 500 * attempt));
    }

    const timeoutCtrl = new AbortController();
    const timer = setTimeout(() => timeoutCtrl.abort(), 25000);

    const onParentAbort = () => timeoutCtrl.abort();
    signal?.addEventListener('abort', onParentAbort);

    try {
      const res = await fetch(segment.url, { headers, signal: timeoutCtrl.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const arrayBuffer = await res.arrayBuffer();
      let buffer = Buffer.from(arrayBuffer);

      if (segment.crypto && segment.crypto.method === 'AES-128') {
        const keyBuf = await fetchKeyCached(segment.crypto.keyUrl, headers, signal);
        const decipher = createDecipheriv('aes-128-cbc', keyBuf, segment.crypto.iv);
        decipher.setAutoPadding(true);
        try {
          buffer = Buffer.concat([decipher.update(buffer), decipher.final()]);
        } catch {
          const fallback = createDecipheriv('aes-128-cbc', keyBuf, segment.crypto.iv);
          fallback.setAutoPadding(false);
          buffer = Buffer.concat([fallback.update(buffer), fallback.final()]);
        }
      }

      // Atomic write without unhandled stream error events
      await fs.writeFile(destPath, buffer);
      return;
    } catch (err: any) {
      lastErr = err;
      if (signal?.aborted) throw err;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onParentAbort);
    }
  }

  throw new Error(`分片下载失败 (${lastErr?.message || '未知错误'}): ${segment.url}`);
}

/**
 * Downloads segments with bounded concurrency, robust error containment and graceful abort.
 */
async function downloadTrackSegments(
  segments: VideoSegmentItem[],
  tempDir: string,
  trackPrefix: string,
  headers: Record<string, string> | undefined,
  signal: AbortSignal,
  concurrency: number,
  onProgress: () => void,
): Promise<string[]> {
  const downloadedFiles: string[] = new Array(segments.length);
  let cursor = 0;
  let firstError: Error | null = null;

  const worker = async () => {
    while (true) {
      if (signal.aborted || firstError) return;
      const index = cursor++;
      if (index >= segments.length) return;

      const segment = segments[index];
      const segFile = join(tempDir, `${trackPrefix}_${String(index).padStart(6, '0')}.seg`);

      try {
        await downloadSegmentToFile(segment, segFile, headers, signal);
        downloadedFiles[index] = segFile;
        onProgress();
      } catch (err: any) {
        if (!firstError && !signal.aborted) {
          firstError = err instanceof Error ? err : new Error(String(err));
        }
        return;
      }
    }
  };

  const pool = Array.from({ length: Math.min(concurrency, segments.length) }, () => worker());
  // Wait for all workers to gracefully complete/exit before proceeding
  await Promise.allSettled(pool);

  if (firstError) {
    throw firstError;
  }
  if (signal.aborted) {
    throw new Error('Download aborted by user');
  }

  return downloadedFiles;
}

/**
 * Concatenate multiple segment files on disk into one combined file without memory overhead.
 * Explicitly guards stream errors to prevent crashing the Node process.
 */
function concatFilesOnDisk(files: string[], targetPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const outStream = createWriteStream(targetPath);
    let index = 0;
    let isSettled = false;

    const cleanupAndReject = (err: Error) => {
      if (isSettled) return;
      isSettled = true;
      outStream.destroy();
      reject(err);
    };

    outStream.on('error', cleanupAndReject);

    function next() {
      if (isSettled) return;
      if (index >= files.length) {
        isSettled = true;
        outStream.end(resolve);
        return;
      }

      const file = files[index++];
      if (!file || !existsSync(file)) {
        cleanupAndReject(new Error(`分片临时文件缺失: ${file}`));
        return;
      }

      const inStream = createReadStream(file);
      inStream.on('error', cleanupAndReject);
      inStream.pipe(outStream, { end: false });
      inStream.on('end', next);
    }

    next();
  });
}

/**
 * Global singleton manager for server-side video downloads and remuxing
 */
export class VideoDownloadManager {
  private static instance: VideoDownloadManager | null = null;
  private tasks = new Map<string, ServerVideoTask>();
  private abortControllers = new Map<string, AbortController>();

  public static getInstance(): VideoDownloadManager {
    if (!VideoDownloadManager.instance) {
      VideoDownloadManager.instance = new VideoDownloadManager();
    }
    return VideoDownloadManager.instance;
  }

  public getAllTasks(): ServerVideoTask[] {
    return Array.from(this.tasks.values()).sort((a, b) => b.createdAt - a.createdAt);
  }

  public getTask(id: string): ServerVideoTask | undefined {
    return this.tasks.get(id);
  }

  public cancelTask(id: string): boolean {
    const task = this.tasks.get(id);
    if (!task) return false;
    const controller = this.abortControllers.get(id);
    if (controller) {
      controller.abort();
      this.abortControllers.delete(id);
    }
    task.status = 'cancelled';
    task.phase = undefined;
    return true;
  }

  /**
   * Reveal or select the downloaded video file in the host operating system file manager
   */
  public revealTaskFile(params: { id?: string; filename?: string; outputPath?: string }): boolean {
    let filePath = params.outputPath;

    if (!filePath && params.id) {
      const task = this.tasks.get(params.id);
      if (task?.outputPath) {
        filePath = task.outputPath;
      } else if (task?.filename) {
        filePath = join(homedir(), 'Downloads', task.filename);
      }
    }

    if (!filePath && params.filename) {
      filePath = join(homedir(), 'Downloads', params.filename);
    }

    if (!filePath || !existsSync(filePath)) {
      return false;
    }

    try {
      if (process.platform === 'darwin') {
        spawn('open', ['-R', filePath], { detached: true, stdio: 'ignore' }).unref();
      } else if (process.platform === 'win32') {
        spawn('explorer.exe', ['/select,', filePath], { detached: true, stdio: 'ignore' }).unref();
      } else {
        spawn('xdg-open', [join(filePath, '..')], { detached: true, stdio: 'ignore' }).unref();
      }
      return true;
    } catch {
      return false;
    }
  }

  public createTask(params: {
    url: string;
    pageTitle: string;
    pageUrl?: string;
  }): ServerVideoTask {
    const id = `vt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const task: ServerVideoTask = {
      id,
      url: params.url,
      pageTitle: params.pageTitle,
      pageUrl: params.pageUrl,
      status: 'pending',
      percent: 0,
      doneSegments: 0,
      totalSegments: 0,
      createdAt: Date.now(),
    };

    this.tasks.set(id, task);
    // Fire and forget, errors are caught inside startTask
    this.startTask(task).catch((err) => {
      console.error(`[VideoDownloadManager] Unhandled task error for ${id}:`, err);
    });
    return task;
  }

  private async startTask(task: ServerVideoTask): Promise<void> {
    const controller = new AbortController();
    this.abortControllers.set(task.id, controller);
    const signal = controller.signal;

    task.status = 'downloading';
    task.phase = 'downloading';

    const baseHeaders: Record<string, string> = {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
    };
    if (task.pageUrl) {
      baseHeaders['Referer'] = task.pageUrl;
    }

    const tempDir = join(tmpdir(), `aiworkstation_video_${task.id}`);
    if (!existsSync(tempDir)) {
      mkdirSync(tempDir, { recursive: true });
    }

    try {
      const playlistText = await fetchText(task.url, baseHeaders);
      let mediaPlaylistUrl = task.url;
      let mediaText = playlistText;
      let audioPlaylistUrl: string | null = null;

      // 1. Resolve master playlist
      if (playlistText.includes('#EXT-X-STREAM-INF')) {
        const variants = parseMasterPlaylist(playlistText, task.url);
        if (variants.length === 0) throw new Error('Master playlist 中未解析出有效清晰度流');
        const best = variants.reduce((a, b) => (b.bandwidth > a.bandwidth ? b : a));
        mediaPlaylistUrl = best.url;
        mediaText = await fetchText(mediaPlaylistUrl, baseHeaders);

        audioPlaylistUrl = parseAudioPlaylistUrl(playlistText, task.url, best.audioGroup);
      }

      // 2. Parse video segments
      const { segments: videoSegments, isFmp4 } = parseMediaPlaylist(mediaText, mediaPlaylistUrl);
      if (videoSegments.length === 0) throw new Error('未解析到任何视频切片');

      let audioSegments: VideoSegmentItem[] = [];
      if (audioPlaylistUrl) {
        const audioText = await fetchText(audioPlaylistUrl, baseHeaders);
        const parsedAudio = parseMediaPlaylist(audioText, audioPlaylistUrl);
        audioSegments = parsedAudio.segments;
      }

      task.totalSegments = videoSegments.length + audioSegments.length;

      const reportProgress = () => {
        task.doneSegments++;
        if (task.totalSegments > 0) {
          task.percent = Math.min(100, Math.round((task.doneSegments / task.totalSegments) * 100));
        }
      };

      // 3. Download segments with bounded concurrency
      const concurrency = 6;
      const videoFiles = await downloadTrackSegments(
        videoSegments,
        tempDir,
        'video',
        baseHeaders,
        signal,
        concurrency,
        reportProgress,
      );

      let audioFiles: string[] = [];
      if (audioSegments.length > 0) {
        audioFiles = await downloadTrackSegments(
          audioSegments,
          tempDir,
          'audio',
          baseHeaders,
          signal,
          concurrency,
          reportProgress,
        );
      }

      // 4. Muxing phase
      task.status = 'muxing';
      task.phase = 'muxing';
      task.percent = 100;

      const combinedVideoPath = join(tempDir, 'combined_video.ts');
      await concatFilesOnDisk(videoFiles, combinedVideoPath);

      // Determine final destination path (System Downloads directory)
      const userDownloadsDir = join(homedir(), 'Downloads');
      const filenameBase = sanitizeFilename(task.pageTitle);
      const outputMp4Path = join(userDownloadsDir, `${filenameBase}.mp4`);
      task.filename = `${filenameBase}.mp4`;

      if (audioFiles.length > 0) {
        const combinedAudioPath = join(tempDir, 'combined_audio.ts');
        await concatFilesOnDisk(audioFiles, combinedAudioPath);
        const muxRes = await muxDualTracksToMp4(combinedVideoPath, combinedAudioPath, outputMp4Path);
        if (!muxRes.success) throw new Error(muxRes.error || 'FFmpeg 音视频轨道合成失败');
      } else if (!isFmp4) {
        // MPEG-TS single stream -> Remux to MP4
        const remuxRes = await remuxTsToMp4(combinedVideoPath, outputMp4Path);
        if (!remuxRes.success) throw new Error(remuxRes.error || 'FFmpeg TS转MP4合成失败');
      } else {
        // Native fMP4 stream without separate audio track
        await fs.rename(combinedVideoPath, outputMp4Path);
      }

      task.status = 'done';
      task.phase = undefined;
      task.outputPath = outputMp4Path;
      task.completedAt = Date.now();
    } catch (err: any) {
      if (signal.aborted) {
        task.status = 'cancelled';
      } else {
        task.status = 'error';
        task.error = err instanceof Error ? err.message : String(err);
      }
    } finally {
      this.abortControllers.delete(task.id);
      // Wait a moment and cleanly remove temp directory
      setTimeout(async () => {
        try {
          if (existsSync(tempDir)) {
            await fs.rm(tempDir, { recursive: true, force: true });
          }
        } catch {
          // Ignore temp cleanup error
        }
      }, 3000);
    }
  }
}

export const videoDownloadManager = VideoDownloadManager.getInstance();
