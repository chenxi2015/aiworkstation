import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { getFfmpegPath } from './nativeFfmpeg.ts';

/**
 * yt-dlp runner: delegates YouTube (and other hostile-to-sniff platforms)
 * downloads to the yt-dlp binary, which tracks anti-bot changes upstream.
 */

export function getYtDlpPath(): string {
  const candidates = [
    process.env.YT_DLP_PATH,
    '/opt/homebrew/bin/yt-dlp',
    '/usr/local/bin/yt-dlp',
    '/usr/bin/yt-dlp',
  ];
  for (const candidate of candidates) {
    if (candidate && existsSync(candidate)) return candidate;
  }
  return 'yt-dlp'; // PATH fallback; spawn error surfaces as install hint
}

const INSTALL_HINT =
  '未检测到 yt-dlp。请先安装：brew install yt-dlp（或 pip install yt-dlp），然后重试';

export interface YtDlpDownloadOptions {
  url: string;
  outputDir: string;
  filenameBase: string;
  signal: AbortSignal;
  onProgress?: (percent: number) => void;
  onPhase?: (phase: 'downloading' | 'muxing') => void;
}

export interface YtDlpDownloadResult {
  success: boolean;
  filePath?: string;
  error?: string;
}

interface YtDlpRunResult {
  code: number | null;
  /** Last chunk of combined stdout/stderr for error reporting */
  tail: string;
  /** Final file path printed via --print after_move:filepath */
  finalFilePath?: string;
  spawnError?: string;
}

function runYtDlp(
  bin: string,
  args: string[],
  signal: AbortSignal,
  onLine: (line: string, isStderr: boolean) => void,
): Promise<YtDlpRunResult> {
  return new Promise((resolve) => {
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (err: any) {
      resolve({ code: null, tail: '', spawnError: err?.message || String(err) });
      return;
    }

    let tail = '';
    let finalFilePath: string | undefined;
    let buffer = '';

    const onData = (chunk: Buffer, isStderr: boolean) => {
      const text = chunk.toString();
      tail = (tail + text).slice(-4000);
      buffer += text;
      let idx: number;
      while ((idx = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        if (!line) continue;
        // "--print after_move:filepath" emits the absolute output path
        if (!isStderr && line.startsWith('/') && /\.[a-z0-9]{2,5}$/i.test(line)) {
          finalFilePath = line;
          continue;
        }
        onLine(line, isStderr);
      }
    };

    child.stdout?.on('data', (c) => onData(c, false));
    child.stderr?.on('data', (c) => onData(c, true));

    const onAbort = () => child.kill('SIGKILL');
    signal.addEventListener('abort', onAbort);

    child.on('close', (code) => {
      signal.removeEventListener('abort', onAbort);
      resolve({ code, tail, finalFilePath });
    });
    child.on('error', (err) => {
      signal.removeEventListener('abort', onAbort);
      resolve({ code: null, tail, spawnError: err.message });
    });
  });
}

/**
 * Downloads a video page URL via yt-dlp, merging best video + audio into a
 * single MP4. Anonymous attempt first; when YouTube's bot wall is hit,
 * retries once with cookies pulled from the local Chrome profile.
 */
export async function downloadWithYtDlp(
  options: YtDlpDownloadOptions,
): Promise<YtDlpDownloadResult> {
  const bin = getYtDlpPath();
  const outputTemplate = join(options.outputDir, `${options.filenameBase}.%(ext)s`);

  const buildArgs = (withCookies: boolean): string[] => [
    '--newline',
    '--no-playlist',
    '--no-warnings',
    '--force-overwrites',
    '-f',
    // Prefer AAC audio (m4a) so the merged MP4 plays everywhere; Opus in
    // an MP4 container renders silent in QuickTime and some players
    'bv*+ba[ext=m4a]/bv*+ba/b',
    '--merge-output-format',
    'mp4',
    '--ffmpeg-location',
    getFfmpegPath(),
    '--print',
    'after_move:filepath',
    '-o',
    outputTemplate,
    ...(withCookies ? ['--cookies-from-browser', 'chrome'] : []),
    options.url,
  ];

  const makeLineHandler = () => (line: string) => {
    // [download]  42.5% of  119.00MiB at  ...
    const progressMatch = /\[download\]\s+([\d.]+)%/.exec(line);
    if (progressMatch) {
      const percent = Number(progressMatch[1]);
      if (Number.isFinite(percent)) options.onProgress?.(percent);
      return;
    }
    if (line.startsWith('[Merger]') || line.startsWith('[ModifyChapters]')) {
      options.onPhase?.('muxing');
    }
  };

  let result = await runYtDlp(bin, buildArgs(false), options.signal, makeLineHandler());

  if (result.spawnError) {
    return {
      success: false,
      error: result.spawnError.includes('ENOENT') ? INSTALL_HINT : result.spawnError,
    };
  }

  // Bot wall / login gate: retry with cookies from the local Chrome profile
  if (
    result.code !== 0 &&
    /sign in|not a bot|cookies|login required/i.test(result.tail)
  ) {
    result = await runYtDlp(bin, buildArgs(true), options.signal, makeLineHandler());
  }

  if (result.code !== 0) {
    const lines = result.tail
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith('[download]'));
    const message = lines.slice(-3).join('; ') || `yt-dlp 异常退出 (代码 ${result.code})`;
    return { success: false, error: message.slice(0, 300) };
  }

  return { success: true, filePath: result.finalFilePath };
}
