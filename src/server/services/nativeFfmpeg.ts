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
          error: stderr || `FFmpeg process exited with code ${code}`,
        });
      }
    });

    child.on('error', (err) => {
      resolve({ success: false, error: err.message });
    });
  });
}

/**
 * Mux separate video and audio tracks into an MP4 container.
 */
export function muxDualTracksToMp4(
  videoPath: string,
  audioPath: string,
  outputMp4Path: string,
): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    const ffmpegPath = getFfmpegPath();
    const args = [
      '-y',
      '-i',
      videoPath,
      '-i',
      audioPath,
      '-c',
      'copy',
      '-shortest',
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
          error: stderr || `FFmpeg process exited with code ${code}`,
        });
      }
    });

    child.on('error', (err) => {
      resolve({ success: false, error: err.message });
    });
  });
}
