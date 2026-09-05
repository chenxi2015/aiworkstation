import type { SniffedStream } from '../types';
import {
  fetchText,
  parseMasterPlaylist,
  parseAudioRenditions,
  parseMediaPlaylist,
  downloadSegmentsResumable,
  mergeParts,
  concatParts,
  saveBlob,
  sanitizeFilename,
} from './hlsDownloader';

export type HlsTaskStatus = 'idle' | 'downloading' | 'paused' | 'muxing' | 'done' | 'error';

export interface HlsTaskState {
  url: string;
  stream: SniffedStream;
  status: HlsTaskStatus;
  percent: number;
  done: number;
  total: number;
  phase?: 'downloading' | 'muxing';
  error?: string;
  filename?: string;
  warning?: string;
}

const DONE_RESET_DELAY_MS = 3500;

function describeStreamLabel(url: string): string {
  try {
    const u = new URL(url);
    const fileName = u.pathname.split('/').filter(Boolean).pop() || u.pathname;
    return decodeURIComponent(fileName);
  } catch {
    return 'video';
  }
}

/**
 * Individual resumable HLS download task
 */
export class HlsDownloadTask {
  public readonly url: string;
  public stream: SniffedStream;
  public status: HlsTaskStatus = 'idle';
  public percent = 0;
  public done = 0;
  public total = 0;
  public phase?: 'downloading' | 'muxing';
  public error?: string;
  public filename?: string;
  public warning?: string;

  private abortController: AbortController | null = null;
  private isUserPaused = false;
  private isUserCancelled = false;

  private isPrepared = false;
  private container: 'mp4' | 'ts' = 'ts';
  private videoSegments: string[] = [];
  private videoBuffers: (ArrayBuffer | null)[] = [];
  private audioSegments: string[] = [];
  private audioBuffers: (ArrayBuffer | null)[] = [];
  private doneTimer: ReturnType<typeof setTimeout> | null = null;

  private readonly onUpdate: () => void;

  constructor(stream: SniffedStream, onUpdate: () => void) {
    this.url = stream.url;
    this.stream = stream;
    this.onUpdate = onUpdate;
  }

  public getState(): HlsTaskState {
    return {
      url: this.url,
      stream: this.stream,
      status: this.status,
      percent: this.percent,
      done: this.done,
      total: this.total,
      phase: this.phase,
      error: this.error,
      filename: this.filename,
      warning: this.warning,
    };
  }

  private countDoneSegments(): number {
    const videoDone = this.videoBuffers.filter((b) => b !== null).length;
    const audioDone = this.audioBuffers.filter((b) => b !== null).length;
    return videoDone + audioDone;
  }

  private updateProgress(phase?: 'downloading' | 'muxing') {
    this.done = this.countDoneSegments();
    if (this.total > 0) {
      this.percent = Math.min(100, Math.round((this.done / this.total) * 100));
    }
    this.phase = phase;
    this.onUpdate();
  }

  private async prepare(signal: AbortSignal): Promise<void> {
    const playlistText = await fetchText(this.url, signal);

    let mediaPlaylistUrl = this.url;
    let mediaText = playlistText;
    let audioPlaylistUrl: string | null = null;

    if (playlistText.includes('#EXT-X-STREAM-INF')) {
      const variants = parseMasterPlaylist(playlistText, this.url);
      if (variants.length === 0) {
        throw new Error('Master 播放列表中没有可用的清晰度');
      }
      const best = variants.reduce((a, b) => (b.bandwidth > a.bandwidth ? b : a));
      mediaPlaylistUrl = best.url;
      mediaText = await fetchText(mediaPlaylistUrl, signal);

      const renditions = parseAudioRenditions(playlistText, this.url);
      if (renditions.length > 0) {
        const matched =
          renditions.find((r) => r.groupId && r.groupId === best.audioGroup && r.isDefault) ||
          renditions.find((r) => r.groupId && r.groupId === best.audioGroup) ||
          renditions.find((r) => r.isDefault) ||
          renditions[0];
        audioPlaylistUrl = matched?.url ?? null;
      }
    }

    const { segments: vSegments, container } = parseMediaPlaylist(mediaText, mediaPlaylistUrl);
    this.container = container;
    this.videoSegments = vSegments;
    this.videoBuffers = new Array(vSegments.length).fill(null);

    if (audioPlaylistUrl) {
      const aText = await fetchText(audioPlaylistUrl, signal);
      const { segments: aSegments } = parseMediaPlaylist(aText, audioPlaylistUrl);
      this.audioSegments = aSegments;
      this.audioBuffers = new Array(aSegments.length).fill(null);
    } else {
      this.audioSegments = [];
      this.audioBuffers = [];
    }

    this.total = this.videoSegments.length + this.audioSegments.length;
    this.isPrepared = true;
  }

  public async start(concurrency = 4): Promise<void> {
    if (this.status === 'downloading' || this.status === 'muxing') return;

    if (this.doneTimer) {
      clearTimeout(this.doneTimer);
      this.doneTimer = null;
    }

    this.isUserPaused = false;
    this.isUserCancelled = false;
    this.error = undefined;
    this.status = 'downloading';
    this.phase = 'downloading';
    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    this.onUpdate();

    try {
      if (!this.isPrepared) {
        await this.prepare(signal);
      }

      const onSegmentFinished = () => {
        this.updateProgress('downloading');
      };

      const downloadPromises: Promise<void>[] = [
        downloadSegmentsResumable(
          this.videoSegments,
          this.videoBuffers,
          signal,
          concurrency,
          onSegmentFinished,
        ),
      ];

      if (this.audioSegments.length > 0) {
        downloadPromises.push(
          downloadSegmentsResumable(
            this.audioSegments,
            this.audioBuffers,
            signal,
            concurrency,
            onSegmentFinished,
          ),
        );
      }

      await Promise.all(downloadPromises);

      // Verify completion
      const videoParts = this.videoBuffers.filter((b): b is ArrayBuffer => b !== null);
      const audioParts = this.audioBuffers.filter((b): b is ArrayBuffer => b !== null);

      if (videoParts.length !== this.videoSegments.length) {
        throw new Error(`视频分片不完整 (${videoParts.length}/${this.videoSegments.length})`);
      }
      if (this.audioSegments.length > 0 && audioParts.length !== this.audioSegments.length) {
        throw new Error(`音频分片不完整 (${audioParts.length}/${this.audioSegments.length})`);
      }

      const filenameBase = sanitizeFilename(
        this.stream.pageTitle || describeStreamLabel(this.url),
      );

      // Fast path: native fMP4 stream without separate audio track is already MP4 container
      if (this.container === 'mp4' && this.audioSegments.length === 0) {
        const blob = mergeParts(videoParts, 'video/mp4');
        const filename = `${filenameBase}.mp4`;
        await saveBlob(blob, filename);

        this.status = 'done';
        this.filename = filename;
        this.phase = undefined;
        this.percent = 100;
        this.scheduleReset();
        this.onUpdate();
        return;
      }

      // Enter muxing phase to remux TS to MP4 or combine video + audio tracks
      this.status = 'muxing';
      this.phase = 'muxing';
      this.percent = 100;
      this.onUpdate();

      // Guard: Check total bytes to prevent browser WebAssembly OOM crash on huge videos (> 1.2GB)
      const totalBytes =
        videoParts.reduce((sum, p) => sum + p.byteLength, 0) +
        audioParts.reduce((sum, p) => sum + p.byteLength, 0);

      const MAX_WASM_SAFE_BYTES = 1200 * 1024 * 1024; // 1.2 GB safe limit for browser WASM

      if (totalBytes > MAX_WASM_SAFE_BYTES) {
        console.warn(`[HlsDownloadTask] Stream size is ${totalBytes} bytes, skipping WASM mux to prevent OOM`);
        const blob = mergeParts(videoParts, 'video/mp2t');
        const filename = `${filenameBase}.ts`;
        await saveBlob(blob, filename);

        this.status = 'done';
        this.filename = filename;
        this.warning = `视频体积较大(${(totalBytes / (1024 * 1024 * 1024)).toFixed(1)}GB)，为防浏览器崩溃已保存原始无损 TS 格式`;
        this.phase = undefined;
        this.scheduleReset();
        this.onUpdate();
        return;
      }

      const videoBytes = concatParts(videoParts);
      const audioBytes = audioParts.length > 0 ? concatParts(audioParts) : undefined;

      try {
        const { muxToMp4 } = await import('./ffmpegMuxer');
        const mp4 = await muxToMp4(videoBytes, audioBytes);
        const blob = new Blob([mp4 as unknown as BlobPart], { type: 'video/mp4' });
        const filename = `${filenameBase}.mp4`;
        await saveBlob(blob, filename);

        this.status = 'done';
        this.filename = filename;
        this.phase = undefined;
        this.scheduleReset();
        this.onUpdate();
      } catch (muxErr) {
        console.warn('[HlsDownloadTask] Mux to MP4 failed, falling back to TS:', muxErr);
        const blob = mergeParts(videoParts, 'video/mp2t');
        const filename = `${filenameBase}.ts`;
        await saveBlob(blob, filename);

        this.status = 'done';
        this.filename = filename;
        this.warning = '自动合成 MP4 失败，已为您保存原始无损 TS 格式';
        this.phase = undefined;
        this.scheduleReset();
        this.onUpdate();
      }
    } catch (err: any) {
      if (this.isUserCancelled) {
        this.resetTask();
        return;
      }

      if (this.isUserPaused) {
        this.status = 'paused';
        this.phase = undefined;
        this.onUpdate();
        return;
      }

      this.status = 'error';
      this.phase = undefined;
      this.error = err instanceof Error ? err.message : String(err);
      this.onUpdate();
    }
  }

  public pause(): void {
    if (this.status !== 'downloading') return;
    this.isUserPaused = true;
    this.abortController?.abort();
    this.status = 'paused';
    this.phase = undefined;
    this.onUpdate();
  }

  public cancel(): void {
    this.isUserCancelled = true;
    this.abortController?.abort();
    this.resetTask();
  }

  private resetTask(): void {
    if (this.doneTimer) {
      clearTimeout(this.doneTimer);
      this.doneTimer = null;
    }
    this.status = 'idle';
    this.percent = 0;
    this.done = 0;
    this.total = 0;
    this.phase = undefined;
    this.error = undefined;
    this.warning = undefined;
    this.isPrepared = false;
    this.videoBuffers = [];
    this.audioBuffers = [];
    this.videoSegments = [];
    this.audioSegments = [];
    this.onUpdate();
  }

  private scheduleReset(): void {
    if (this.doneTimer) clearTimeout(this.doneTimer);
    this.doneTimer = setTimeout(() => {
      this.resetTask();
    }, DONE_RESET_DELAY_MS);
  }
}

/**
 * Singleton Manager for HLS download tasks
 */
class HlsDownloadManager {
  private static instance: HlsDownloadManager | null = null;
  private tasks = new Map<string, HlsDownloadTask>();
  private listeners = new Set<() => void>();

  public static getInstance(): HlsDownloadManager {
    if (!HlsDownloadManager.instance) {
      HlsDownloadManager.instance = new HlsDownloadManager();
    }
    return HlsDownloadManager.instance;
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch (err) {
        console.error('[HlsDownloadManager] Listener error:', err);
      }
    }
  }

  public getOrCreateTask(stream: SniffedStream): HlsDownloadTask {
    let task = this.tasks.get(stream.url);
    if (!task) {
      task = new HlsDownloadTask(stream, () => this.notify());
      this.tasks.set(stream.url, task);
    } else {
      // Update stream metadata in case title or resolution was refreshed
      task.stream = stream;
    }
    return task;
  }

  public start(stream: SniffedStream): void {
    const task = this.getOrCreateTask(stream);
    task.start();
  }

  public pause(url: string): void {
    const task = this.tasks.get(url);
    task?.pause();
  }

  public resume(url: string): void {
    const task = this.tasks.get(url);
    task?.start();
  }

  public cancel(url: string): void {
    const task = this.tasks.get(url);
    task?.cancel();
  }

  public getState(url: string): HlsTaskState | undefined {
    return this.tasks.get(url)?.getState();
  }

  public getAllStates(): Record<string, HlsTaskState> {
    const res: Record<string, HlsTaskState> = {};
    for (const [url, task] of this.tasks.entries()) {
      res[url] = task.getState();
    }
    return res;
  }

  /**
   * Returns streams with active, paused or recently completed downloads.
   * Used to keep streams visible even when switching to an empty tab.
   */
  public getActiveStreams(): SniffedStream[] {
    const streams: SniffedStream[] = [];
    for (const task of this.tasks.values()) {
      if (task.status !== 'idle') {
        streams.push(task.stream);
      }
    }
    return streams;
  }
}

export const hlsDownloadManager = HlsDownloadManager.getInstance();
