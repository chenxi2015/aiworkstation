import { execFile, spawn } from 'node:child_process';
import { existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { DB_DIR } from '../db/connection.ts';
import { getFfmpegPath } from './nativeFfmpeg.ts';

/**
 * yt-dlp runner: delegates YouTube (and other hostile-to-sniff platforms)
 * downloads to the yt-dlp binary, which tracks anti-bot changes upstream.
 *
 * Two hard-won behaviors:
 *
 * - PTY wrapping: yt-dlp block-buffers stdout when piped, so progress lines
 *   arrive only at exit. Spawning through `script -q /dev/null` gives it a
 *   TTY and progress streams in real time. Exit codes are NOT propagated by
 *   macOS `script`, so success is detected via the printed final file path.
 *
 * - Cookie file cache: `--cookies-from-browser chrome` triggers a macOS
 *   Keychain prompt ("Chrome Safe Storage") on EVERY run. We therefore
 *   export browser cookies once into a Netscape cookie file and reuse it
 *   silently, re-exporting only when the file goes stale (bot wall again).
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

const COOKIE_FILE = join(DB_DIR, 'youtube-cookies.txt');

const BOT_WALL_RE = /sign in|not a bot|cookies|login required/i;

/** Kill the run when nothing is printed for this long — the classic cause
 *  is an unanswered macOS Keychain prompt during Chrome cookie export */
const STALL_TIMEOUT_MS = 90_000;

const STALL_HINT =
  '下载长时间无响应：很可能有 macOS 钥匙串授权弹窗未处理。请留意屏幕上的「yt-dlp 想要访问 Chrome 安全存储」弹窗并点击「始终允许」，然后重试';

/** Browser profile used for cookie export (override via env) */
const COOKIES_FROM_BROWSER = process.env.YT_DLP_COOKIES_FROM_BROWSER || 'chrome';

export interface YtDlpDownloadOptions {
  url: string;
  outputDir: string;
  filenameBase: string;
  signal: AbortSignal;
  /** Netscape cookie file freshly exported by the browser extension */
  cookiesFile?: string;
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
    // A PTY makes yt-dlp flush progress lines in real time (macOS `script`
    // takes the command as separate argv entries, no shell quoting needed)
    const usePty = process.platform === 'darwin';
    const spawnBin = usePty ? 'script' : bin;
    const spawnArgs = usePty ? ['-q', '/dev/null', bin, ...args] : args;

    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(spawnBin, spawnArgs, { stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (err: any) {
      resolve({ code: null, tail: '', spawnError: err?.message || String(err) });
      return;
    }

    let tail = '';
    let finalFilePath: string | undefined;
    let buffer = '';
    let lastActivity = Date.now();
    let stalled = false;

    const onData = (chunk: Buffer, isStderr: boolean) => {
      lastActivity = Date.now();
      const text = chunk.toString();
      tail = (tail + text).slice(-4000);
      buffer += text;
      let idx: number;
      while ((idx = buffer.indexOf('\n')) >= 0) {
        // The PTY wrapper injects control artifacts (e.g. "^D\b\b"), strip
        // control chars before parsing
        const line = buffer
          .slice(0, idx)
          // eslint-disable-next-line no-control-regex
          .replace(/[\x00-\x08\x0b-\x1f\x7f]/g, '')
          .replace(/\^D/g, '')
          .trim();
        buffer = buffer.slice(idx + 1);
        if (!line) continue;
        // "--print after_move:filepath" emits the absolute output path —
        // match it anywhere in the line, artifacts may prefix it
        const pathMatch = /(\/[^\s]+\.(?:mp4|mkv|webm|mov|m4a|flv|mp3|m4v))$/i.exec(line);
        if (!isStderr && pathMatch) {
          finalFilePath = pathMatch[1];
          continue;
        }
        onLine(line, isStderr);
      }
    };

    child.stdout?.on('data', (c) => onData(c, false));
    child.stderr?.on('data', (c) => onData(c, true));

    // The PTY wrapper puts yt-dlp in its own session, so killing `script`
    // alone orphans the actual downloader. Best-effort cleanup by matching
    // this run's unique output template in the process list.
    const outputTemplate = args.find((a) => a.includes('%(ext)s'));
    const killTree = () => {
      try {
        child.kill('SIGKILL');
      } catch {
        // Already gone
      }
      if (outputTemplate) {
        execFile('pkill', ['-f', outputTemplate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')], () => {});
      }
    };

    const onAbort = () => killTree();
    signal.addEventListener('abort', onAbort);

    // Stall watchdog: no output at all for STALL_TIMEOUT_MS means the
    // process is blocked on something invisible (e.g. an unanswered macOS
    // Keychain prompt during Chrome cookie export)
    const watchdog = setInterval(() => {
      if (Date.now() - lastActivity > STALL_TIMEOUT_MS) {
        stalled = true;
        killTree();
      }
    }, 5000);

    child.on('close', (code) => {
      clearInterval(watchdog);
      signal.removeEventListener('abort', onAbort);
      resolve({
        code,
        tail: stalled ? `${tail}\n${STALL_HINT}` : tail,
        finalFilePath,
      });
    });
    child.on('error', (err) => {
      clearInterval(watchdog);
      signal.removeEventListener('abort', onAbort);
      resolve({ code: null, tail, spawnError: err.message });
    });
  });
}

function tailError(tail: string, code: number | null): string {
  const lines = tail
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('[download]'));
  const errorLine = lines.find((l) => l.startsWith('ERROR:'));
  const message = errorLine || lines.slice(-3).join('; ');
  return (message || `yt-dlp 异常退出 (代码 ${code})`).slice(0, 300);
}

/**
 * Downloads a video page URL via yt-dlp, merging best video + audio into a
 * single MP4. Attempt order: anonymous → cached cookie file → fresh export
 * from the local Chrome profile (one Keychain prompt, then cached).
 */
export async function downloadWithYtDlp(
  options: YtDlpDownloadOptions,
): Promise<YtDlpDownloadResult> {
  const bin = getYtDlpPath();
  const outputTemplate = join(options.outputDir, `${options.filenameBase}.%(ext)s`);

  const baseArgs = [
    '--newline',
    '--no-playlist',
    '--no-warnings',
    '--force-overwrites',
    '-f',
    // Prefer AAC audio (m4a) so the merged MP4 plays everywhere; Opus in
    // an MP4 container renders silent in QuickTime and some players
    process.env.YT_DLP_FORMAT || 'bv*+ba[ext=m4a]/bv*+ba/b',
    '--merge-output-format',
    'mp4',
    '--ffmpeg-location',
    getFfmpegPath(),
    '--print',
    'after_move:filepath',
    '-o',
    outputTemplate,
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
      return;
    }
    if (line.startsWith('ERROR:')) {
      console.warn('[yt-dlp]', line);
    }
  };

  const attempt = (extraArgs: string[]) =>
    runYtDlp(bin, [...baseArgs, ...extraArgs, options.url], options.signal, makeLineHandler());

  let result: YtDlpRunResult;

  if (options.cookiesFile) {
    // Extension-exported cookies are always fresh: use them first and skip
    // the anonymous attempt entirely (bot-wall hits worsen IP throttling)
    result = await attempt(['--cookies', options.cookiesFile]);
  } else {
    // 1. Anonymous attempt (works for many videos when YouTube is lenient)
    result = await attempt([]);
  }

  if (result.spawnError) {
    return {
      success: false,
      error: result.spawnError.includes('ENOENT') ? INSTALL_HINT : result.spawnError,
    };
  }

  // 2. Bot wall: use the extension-exported cookies (always fresh, no
  //    Keychain prompt) or the previously exported cache file
  if (!result.finalFilePath && BOT_WALL_RE.test(result.tail) && options.cookiesFile) {
    console.log('[yt-dlp] Bot wall hit, retrying with extension-exported cookies');
    result = await attempt(['--cookies', options.cookiesFile]);
  }

  // 3. Try the cached browser-export cookie file (no Keychain prompt)
  if (!result.finalFilePath && BOT_WALL_RE.test(result.tail) && existsSync(COOKIE_FILE)) {
    console.log('[yt-dlp] Bot wall hit, retrying with cached cookie file');
    result = await attempt(['--cookies', COOKIE_FILE]);
    if (!result.finalFilePath && BOT_WALL_RE.test(result.tail)) {
      // Stale cookies: drop the file so future runs go straight to export
      console.log('[yt-dlp] Cached cookies rejected, removing stale file');
      try {
        unlinkSync(COOKIE_FILE);
      } catch {
        // Best-effort cleanup
      }
    }
  }

  // 4. Still walled: export fresh cookies from the local browser profile.
  //    This triggers one macOS Keychain prompt; the exported file is reused
  //    silently by all later downloads.
  if (!result.finalFilePath && BOT_WALL_RE.test(result.tail)) {
    console.log(
      `[yt-dlp] Exporting cookies from ${COOKIES_FROM_BROWSER} (macOS may show a Keychain prompt — click 始终允许/Always Allow)`,
    );
    result = await attempt([
      '--cookies-from-browser',
      COOKIES_FROM_BROWSER,
      '--cookies',
      COOKIE_FILE,
    ]);
  }

  if (!result.finalFilePath) {
    if (result.spawnError) {
      return {
        success: false,
        error: result.spawnError.includes('ENOENT') ? INSTALL_HINT : result.spawnError,
      };
    }
    return { success: false, error: tailError(result.tail, result.code) };
  }

  return { success: true, filePath: result.finalFilePath };
}
