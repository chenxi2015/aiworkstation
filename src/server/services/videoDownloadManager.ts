import { existsSync, mkdirSync, createWriteStream, createReadStream, rmSync, renameSync } from 'node:fs';
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

function parseMediaPlaylist(text: string, baseUrl: string): { segments: string[]; isFmp4: boolean } {
  const segments: string[] = [];
  let isFmp4 = false;

  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;

    if (line.startsWith('#EXT-X-MAP')) {
      const uriMatch = line.match(/URI="([^"]+)"/);
      if (uriMatch?.[1]) {
        isFmp4 = true;
        segments.unshift(resolveUrl(uriMatch[1], baseUrl));
      }
      continue;
    }

    if (line.startsWith('#')) continue;
    segments.push(resolveUrl(line, baseUrl));
  }

  return { segments, isFmp4 };
}

async function downloadSegmentToFile(
  url: string,
  destPath: string,
  headers?: Record<string, string>,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(url, { headers, signal });
  if (!res.ok) throw new Error(`分片下载失败 (HTTP ${res.status}): ${url}`);
  const arrayBuffer = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const fileStream = createWriteStream(destPath);
  await new Promise<void>((resolve, reject) => {
    fileStream.write(buffer, (err) => {
      if (err) return reject(err);
      fileStream.end(resolve);
    });
  });
}

/**
 * Downloads segments sequentially or with concurrency, streaming directly to disk
 */
async function downloadTrackSegments(
  segments: string[],
  tempDir: string,
  trackPrefix: string,
  headers: Record<string, string> | undefined,
  signal: AbortSignal,
  concurrency: number,
  onProgress: () => void,
): Promise<string[]> {
  const downloadedFiles: string[] = new Array(segments.length);
  let cursor = 0;

  const worker = async () => {
    while (true) {
      if (signal.aborted) throw new Error('Download aborted by user');
      const index = cursor++;
      if (index >= segments.length) return;

      const segUrl = segments[index];
      const segFile = join(tempDir, `${trackPrefix}_${String(index).padStart(6, '0')}.seg`);
      await downloadSegmentToFile(segUrl, segFile, headers, signal);
      downloadedFiles[index] = segFile;
      onProgress();
    }
  };

  const pool = Array.from({ length: Math.min(concurrency, segments.length) }, () => worker());
  await Promise.all(pool);
  return downloadedFiles;
}

/**
 * Concatenate multiple segment files on disk into one combined file without memory overhead
 */
function concatFilesOnDisk(files: string[], targetPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const outStream = createWriteStream(targetPath);
    let index = 0;

    function next() {
      if (index >= files.length) {
        outStream.end(resolve);
        return;
      }
      const file = files[index++];
      const inStream = createReadStream(file);
      inStream.pipe(outStream, { end: false });
      inStream.on('end', next);
      inStream.on('error', reject);
    }

    outStream.on('error', reject);
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
    this.startTask(task);
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

      let audioSegments: string[] = [];
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
        renameSync(combinedVideoPath, outputMp4Path);
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
      // Clean up temporary disk segments
      try {
        if (existsSync(tempDir)) {
          rmSync(tempDir, { recursive: true, force: true });
        }
      } catch {
        // Ignore cleanup errors
      }
    }
  }
}

export const videoDownloadManager = VideoDownloadManager.getInstance();
