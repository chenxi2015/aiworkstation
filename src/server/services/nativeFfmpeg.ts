import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

/**
 * Detect available system ffmpeg binary path
 */
export function getFfmpegPath(): string {
	// Common paths on macOS (Homebrew Apple Silicon & Intel) and Linux
	const candidates = [
		"/opt/homebrew/bin/ffmpeg",
		"/usr/local/bin/ffmpeg",
		"/usr/bin/ffmpeg",
		"ffmpeg",
	];

	for (const candidate of candidates) {
		if (candidate === "ffmpeg" || existsSync(candidate)) {
			return candidate;
		}
	}
	return "ffmpeg";
}

function formatFfmpegError(stderr: string, code: number | null): string {
	if (!stderr) return `FFmpeg 异常退出 (代码 ${code})`;
	const lines = stderr
		.split("\n")
		.map((l) => l.trim())
		.filter((l) => l.length > 0);
	const meaningful = lines.filter(
		(l) =>
			!l.startsWith("ffmpeg version") &&
			!l.startsWith("built with") &&
			!l.startsWith("configuration:") &&
			!l.startsWith("libav") &&
			!l.startsWith("Press [q] to stop"),
	);
	if (meaningful.length > 0) {
		return meaningful.slice(-3).join("; ");
	}
	return stderr.slice(-300);
}

/**
 * Core runner that executes ffmpeg with given arguments and catches stderr.
 */
export function runFfmpeg(
	args: string[],
): Promise<{ success: boolean; error?: string }> {
	return new Promise((resolve) => {
		const ffmpegPath = getFfmpegPath();
		const child = spawn(ffmpegPath, args, {
			stdio: ["ignore", "pipe", "pipe"],
		});
		let stderr = "";

		child.stderr?.on("data", (chunk) => {
			stderr += chunk.toString();
		});

		child.on("close", (code) => {
			if (code === 0) {
				resolve({ success: true });
			} else {
				resolve({
					success: false,
					error: formatFfmpegError(stderr, code),
				});
			}
		});

		child.on("error", (err) => {
			resolve({ success: false, error: err.message });
		});
	});
}

/**
 * Remux an existing MPEG-TS file into a web-optimized MP4 file using system ffmpeg.
 * Performs fast stream-copy without re-encoding.
 */
export function remuxTsToMp4(
	inputTsPath: string,
	outputMp4Path: string,
): Promise<{ success: boolean; error?: string }> {
	return runFfmpeg([
		"-y",
		"-i",
		inputTsPath,
		"-c",
		"copy",
		"-movflags",
		"+faststart",
		outputMp4Path,
	]);
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
	const isMp4Output = /\.mp4$/i.test(outputMp4Path);
	return runFfmpeg([
		"-y",
		"-i",
		videoPath,
		"-i",
		audioPath,
		"-c",
		"copy",
		"-shortest",
		...(isMp4Output ? ["-movflags", "+faststart"] : []),
		outputMp4Path,
	]);
}

/**
 * Convert video aspect ratio with blurred background padding (ideal for 16:9 -> 9:16 vertical shorts).
 */
export function convertAspectWithBlur(
	inputPath: string,
	outputPath: string,
	options: { width?: number; height?: number; blur?: number } = {},
): Promise<{ success: boolean; error?: string }> {
	const w = options.width || 1080;
	const h = options.height || 1920;
	const blur = options.blur || 25;

	// Split filter: scale & blur background to fill target frame, overlay original scaled foreground in center
	const filter = `[0:v]scale=${w}:${h}:force_original_aspect_ratio=increase,boxblur=${blur}:${blur},crop=${w}:${h}[bg];[0:v]scale=${w}:${h}:force_original_aspect_ratio=decrease[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2`;

	return runFfmpeg([
		"-y",
		"-i",
		inputPath,
		"-filter_complex",
		filter,
		"-c:v",
		"libx264",
		"-preset",
		"fast",
		"-crf",
		"22",
		"-c:a",
		"copy",
		"-movflags",
		"+faststart",
		outputPath,
	]);
}

/**
 * Smart video compression with visually lossless CRF rate control.
 */
export function compressVideoWithCrf(
	inputPath: string,
	outputPath: string,
	options: { crf?: number; maxRate?: string; bufSize?: string } = {},
): Promise<{ success: boolean; error?: string }> {
	const crf = String(options.crf ?? 24);
	const args = [
		"-y",
		"-i",
		inputPath,
		"-c:v",
		"libx264",
		"-crf",
		crf,
		"-preset",
		"medium",
		"-c:a",
		"aac",
		"-b:a",
		"128k",
	];

	if (options.maxRate) {
		args.push("-maxrate", options.maxRate, "-bufsize", options.bufSize || "2M");
	}

	args.push("-movflags", "+faststart", outputPath);
	return runFfmpeg(args);
}

/**
 * Change media playback speed while preserving audio pitch.
 */
export function changeMediaSpeed(
	inputPath: string,
	outputPath: string,
	speed: number,
): Promise<{ success: boolean; error?: string }> {
	const safeSpeed = Math.max(0.5, Math.min(4.0, speed));
	const setPts = (1 / safeSpeed).toFixed(4);

	// atempo filter only supports 0.5 to 2.0; chain if speed > 2.0
	let audioFilter = `atempo=${safeSpeed}`;
	if (safeSpeed > 2.0) {
		audioFilter = `atempo=2.0,atempo=${(safeSpeed / 2.0).toFixed(4)}`;
	}

	return runFfmpeg([
		"-y",
		"-i",
		inputPath,
		"-filter_complex",
		`[0:v]setpts=${setPts}*PTS[v];[0:a]${audioFilter}[a]`,
		"-map",
		"[v]",
		"-map",
		"[a]",
		"-c:v",
		"libx264",
		"-preset",
		"fast",
		"-movflags",
		"+faststart",
		outputPath,
	]);
}

/**
 * Extract an ultra-clear single keyframe or cover image at specified timestamp.
 */
export function extractCoverFrame(
	inputPath: string,
	outputPath: string,
	timestamp = "00:00:01",
): Promise<{ success: boolean; error?: string }> {
	return runFfmpeg([
		"-y",
		"-ss",
		timestamp,
		"-i",
		inputPath,
		"-frames:v",
		"1",
		"-q:v",
		"2",
		outputPath,
	]);
}

/**
 * Burn hard subtitles (.srt) onto video frame with custom styling.
 */
export function burnSubtitlesToVideo(
	videoPath: string,
	srtPath: string,
	outputPath: string,
	options: { fontSize?: number; fontColor?: string } = {},
): Promise<{ success: boolean; error?: string }> {
	const fontSize = options.fontSize || 20;
	// White text with black border, or customized
	const subFilter = `subtitles='${srtPath}':force_style='FontSize=${fontSize},PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=2'`;

	return runFfmpeg([
		"-y",
		"-i",
		videoPath,
		"-vf",
		subFilter,
		"-c:v",
		"libx264",
		"-preset",
		"fast",
		"-crf",
		"21",
		"-c:a",
		"copy",
		"-movflags",
		"+faststart",
		outputPath,
	]);
}

/**
 * Normalize audio loudness using EBU R128 industrial standard.
 */
export function normalizeAudioLoudness(
	inputPath: string,
	outputPath: string,
	targetLoudness = -16,
): Promise<{ success: boolean; error?: string }> {
	return runFfmpeg([
		"-y",
		"-i",
		inputPath,
		"-af",
		`loudnorm=I=${targetLoudness}:TP=-1.5:LRA=11`,
		"-c:a",
		"aac",
		"-b:a",
		"192k",
		outputPath,
	]);
}

/**
 * Create a multi-frame vertical film strip from video (ideal for social posts).
 */
export function createVideoFilmStrip(
	inputPath: string,
	outputPath: string,
	rows = 4,
): Promise<{ success: boolean; error?: string }> {
	const filter = `select='not(mod(n\\,60))',scale=720:-1,tile=1x${rows}`;
	return runFfmpeg([
		"-y",
		"-i",
		inputPath,
		"-vf",
		filter,
		"-frames:v",
		"1",
		"-q:v",
		"2",
		outputPath,
	]);
}
