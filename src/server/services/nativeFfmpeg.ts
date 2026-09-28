import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

/**
 * Detect available system ffmpeg binary path
 */
export function getFfmpegPath(): string {
  // Common paths on macOS (Homebrew Apple Silicon & Intel) and Linux
  const candidates = [
    '/opt/homebrew/bin/ffmpeg',
    '/usr/local/bin/ffmpeg',
    '/usr/bin/ffmpeg',
    'ffmpeg',
  ];

  for (const candidate of candidates) {
    if (candidate === 'ffmpeg' || existsSync(candidate)) {
      return candidate;
    }
  }
  return 'ffmpeg';
}

function formatFfmpegError(stderr: string, code: number | null): string {
  if (!stderr) return `FFmpeg 异常退出 (代码 ${code})`;
  const lines = stderr
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  const meaningful = lines.filter(
    (l) =>
      !l.startsWith('ffmpeg version') &&
      !l.startsWith('built with') &&
      !l.startsWith('configuration:') &&
      !l.startsWith('libav') &&
      !l.startsWith('Press [q] to stop'),
  );
  if (meaningful.length > 0) {
    return meaningful.slice(-3).join('; ');
  }
  return stderr.slice(-300);
}

/**
 * Remux an existing MPEG-TS file into a web-optimized MP4 file using system ffmpeg.
 * Performs fast stream-copy without re-encoding.
 */
export function remuxTsToMp4(
  inputTsPath: string,
  outputMp4Path: string,
): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    const ffmpegPath = getFfmpegPath();
    const args = [
      '-y', // Overwrite output if exists
      '-i',
      inputTsPath,
      '-c',
      'copy',
      '-movflags',
      '+faststart',
      outputMp4Path,
    ];

    const child = spawn(ffmpegPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';

    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true });
      } else {
        resolve({
          success: false,
          error: formatFfmpegError(stderr, code),
        });
      }
    });

    child.on('error', (err) => {
      resolve({ success: false, error: err.message });
    });
  });
}

/**
 * Mux separate video and audio tracks into one container (MP4 or MKV,
 * inferred from the output file extension). MP4-only faststart flags are
 * omitted for MKV outputs.
 */
export function muxDualTracksToMp4(
	videoPath: string,
	audioPath: string,
	outputMp4Path: string,
): Promise<{ success: boolean; error?: string }> {
	return new Promise((resolve) => {
		const ffmpegPath = getFfmpegPath();
		const isMp4Output = /\.mp4$/i.test(outputMp4Path);
		const args = [
			'-y',
			'-i',
			videoPath,
			'-i',
			audioPath,
			'-c',
			'copy',
			'-shortest',
			...(isMp4Output ? ['-movflags', '+faststart'] : []),
			outputMp4Path,
		];

    const child = spawn(ffmpegPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';

    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true });
      } else {
        resolve({
          success: false,
          error: formatFfmpegError(stderr, code),
        });
      }
    });

    child.on('error', (err) => {
      resolve({ success: false, error: err.message });
    });
  });
}
