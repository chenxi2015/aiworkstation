import { createFFmpeg, type FFmpeg } from '@ffmpeg/ffmpeg';

/**
 * Lazy singleton wrapper around ffmpeg.wasm (v0.11 API).
 * Core binaries ship inside the extension (public/ffmpeg) so no remote code
 * is loaded; MV3 CSP allows them via 'wasm-unsafe-eval'.
 */

let ffmpegInstance: FFmpeg | null = null;
let loadingPromise: Promise<FFmpeg> | null = null;

async function getFFmpeg(): Promise<FFmpeg> {
  if (ffmpegInstance?.isLoaded()) return ffmpegInstance;

  if (!loadingPromise) {
    const ffmpeg = createFFmpeg({
      log: false,
      corePath: chrome.runtime.getURL('ffmpeg/ffmpeg-core.js'),
    });
    loadingPromise = ffmpeg.load().then(() => {
      ffmpegInstance = ffmpeg;
      return ffmpeg;
    });
    loadingPromise.catch(() => {
      loadingPromise = null;
    });
  }

  return loadingPromise;
}

function toUint8Array(data: ArrayBuffer | Uint8Array): Uint8Array {
  return data instanceof Uint8Array ? data : new Uint8Array(data);
}

/**
 * Muxes a video track (merged TS/fMP4 bytes) and an optional separate audio
 * track into a single MP4 without re-encoding (-c copy).
 */
export async function muxToMp4(
  videoData: ArrayBuffer | Uint8Array,
  audioData?: ArrayBuffer | Uint8Array,
): Promise<Uint8Array> {
  const ffmpeg = await getFFmpeg();

  const videoName = 'input_video.ts';
  const audioName = 'input_audio.ts';
  const outName = 'output.mp4';

  try {
    ffmpeg.FS('writeFile', videoName, toUint8Array(videoData));
    if (audioData) {
      ffmpeg.FS('writeFile', audioName, toUint8Array(audioData));
    }

    const args = audioData
      ? ['-i', videoName, '-i', audioName, '-c', 'copy', '-shortest', outName]
      : ['-i', videoName, '-c', 'copy', outName];

    await ffmpeg.run(...args);
    return ffmpeg.FS('readFile', outName);
  } finally {
    for (const name of [videoName, audioName, outName]) {
      try {
        ffmpeg.FS('unlink', name);
      } catch {
        // File may not exist; ignore
      }
    }
  }
}
