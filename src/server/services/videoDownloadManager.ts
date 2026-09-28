import {
	createWriteStream,
	existsSync,
	promises as fs,
	mkdirSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getVideoDownloadsDir } from "./filesRoot.ts";
import { muxDualTracksToMp4, remuxTsToMp4 } from "./nativeFfmpeg.ts";
import { openInOs } from "./systemOpener.ts";
import {
	concatFilesOnDisk,
	extensionForVideoFile,
	sanitizeFilename,
	VIDEO_FILE_URL_RE,
} from "./videoDownload/fileUtils.ts";
import {
	parseAudioPlaylistUrl,
	parseMasterPlaylist,
	parseMediaPlaylist,
} from "./videoDownload/hlsPlaylist.ts";
import {
	downloadTrackSegments,
	fetchText,
} from "./videoDownload/segmentDownloader.ts";
import type { ServerVideoTask } from "./videoDownload/types.ts";

export type {
	SegmentCryptoInfo,
	ServerVideoTask,
	VideoSegmentItem,
} from "./videoDownload/types.ts";

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
		return Array.from(this.tasks.values()).sort(
			(a, b) => b.createdAt - a.createdAt,
		);
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
		task.status = "cancelled";
		task.phase = undefined;
		return true;
	}

	/**
	 * Reveal or select the downloaded video file in the host operating system file manager
	 */
	public revealTaskFile(params: {
		id?: string;
		filename?: string;
		outputPath?: string;
	}): boolean {
		let filePath = params.outputPath;

		if (!filePath && params.id) {
			const task = this.tasks.get(params.id);
			if (task?.outputPath) {
				filePath = task.outputPath;
			} else if (task?.filename) {
				filePath = join(getVideoDownloadsDir(), task.filename);
			}
		}

		if (!filePath && params.filename) {
			filePath = join(getVideoDownloadsDir(), params.filename);
		}

		if (!filePath || !existsSync(filePath)) {
			return false;
		}

		try {
			openInOs(filePath, { reveal: true, skipRootCheck: true }).catch(() => {});
			return true;
		} catch {
			return false;
		}
	}

	public createTask(params: {
		url: string;
		kind?: "hls" | "file" | "dash";
		audioUrl?: string;
		audioMimeType?: string;
		pageTitle: string;
		pageUrl?: string;
		force?: boolean;
	}): ServerVideoTask {
		// Prevent duplicate downloading unless force is explicitly requested
		if (!params.force) {
			const allMatching = Array.from(this.tasks.values())
				.filter((t) => t.url === params.url)
				.sort((a, b) => b.createdAt - a.createdAt);

			const active = allMatching.find(
				(t) =>
					t.status === "downloading" ||
					t.status === "pending" ||
					t.status === "muxing",
			);
			if (active) {
				return active;
			}

			const done = allMatching.find(
				(t) => t.status === "done" && t.outputPath && existsSync(t.outputPath),
			);
			if (done) {
				return done;
			}
		}

		const id = `vt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
		const task: ServerVideoTask = {
			id,
			url: params.url,
			kind: params.kind,
			audioUrl: params.audioUrl,
			audioMimeType: params.audioMimeType,
			pageTitle: params.pageTitle,
			pageUrl: params.pageUrl,
			status: "pending",
			percent: 0,
			doneSegments: 0,
			totalSegments: 0,
			createdAt: Date.now(),
		};

		this.tasks.set(id, task);
		// Fire and forget, errors are caught inside startTask
		this.startTask(task).catch((err) => {
			console.error(
				`[VideoDownloadManager] Unhandled task error for ${id}:`,
				err,
			);
		});
		return task;
	}

	/**
	 * Downloads a progressive video file (kind: 'file') as a single HTTP GET
	 * straight into the downloads directory. No playlist parsing or remuxing.
	 * Progress is reported on a 0-100 scale (doneSegments mirrors percent).
	 */
	private async downloadDirectFile(
		task: ServerVideoTask,
		headers: Record<string, string>,
		signal: AbortSignal,
	): Promise<void> {
		const res = await fetch(task.url, { headers, signal });
		if (!res.ok || !res.body) {
			throw new Error(`视频请求失败 (HTTP ${res.status}): ${task.url}`);
		}

		const totalBytes = Number(res.headers.get("content-length")) || 0;
		const mime = (res.headers.get("content-type") || "").toLowerCase();
		task.totalSegments = 100;

		const userDownloadsDir = getVideoDownloadsDir();
		mkdirSync(userDownloadsDir, { recursive: true });
		const filenameBase = sanitizeFilename(task.pageTitle);
		const extension = extensionForVideoFile(mime, task.url);
		const outputPath = join(userDownloadsDir, `${filenameBase}.${extension}`);
		task.filename = `${filenameBase}.${extension}`;

		const writer = createWriteStream(outputPath);
		let received = 0;
		try {
			for await (const chunk of res.body as AsyncIterable<Uint8Array>) {
				writer.write(chunk);
				received += chunk.length;
				task.percent =
					totalBytes > 0
						? Math.min(100, Math.round((received / totalBytes) * 100))
						: Math.min(99, task.percent + 1);
				task.doneSegments = task.percent;
			}
			await new Promise<void>((resolve, reject) => {
				writer.end(() => resolve());
				writer.on("error", reject);
			});
		} catch (err) {
			writer.destroy();
			await fs.rm(outputPath, { force: true }).catch(() => {});
			throw err;
		}

		task.status = "done";
		task.phase = undefined;
		task.outputPath = outputPath;
		task.completedAt = Date.now();
	}

	/**
	 * Downloads a DASH split-track stream (kind: 'dash'): fetches video-only
	 * and audio-only m4s tracks, then muxes both into a single file with
	 * ffmpeg (-c copy, no re-encode). Output container follows the audio
	 * codec: AAC audio goes into MP4, Opus/WebM audio into MKV.
	 */
	private async downloadDash(
		task: ServerVideoTask,
		headers: Record<string, string>,
		signal: AbortSignal,
		tempDir: string,
	): Promise<void> {
		if (!task.audioUrl) {
			throw new Error("缺少音频流地址，无法合成完整视频");
		}

		let totalVideo = 0;
		let totalAudio = 0;
		let receivedBytes = 0;

		const reportProgress = () => {
			const total = totalVideo + totalAudio;
			task.percent =
				total > 0
					? Math.min(100, Math.round((receivedBytes / total) * 100))
					: Math.min(99, task.percent + 1);
			task.doneSegments = task.percent;
			task.totalSegments = 100;
		};

		const downloadTrack = async (
			url: string,
			destPath: string,
			track: "video" | "audio",
		) => {
			const res = await fetch(url, { headers, signal });
			if (!res.ok || !res.body) {
				throw new Error(`分轨请求失败 (HTTP ${res.status}): ${url}`);
			}
			const trackTotal = Number(res.headers.get("content-length")) || 0;
			if (track === "video") totalVideo = trackTotal;
			else totalAudio = trackTotal;

			const writer = createWriteStream(destPath);
			try {
				for await (const chunk of res.body as AsyncIterable<Uint8Array>) {
					writer.write(chunk);
					receivedBytes += chunk.length;
					reportProgress();
				}
				await new Promise<void>((resolve, reject) => {
					writer.end(() => resolve());
					writer.on("error", reject);
				});
			} catch (err) {
				writer.destroy();
				throw err;
			}
		};

		const videoPath = join(tempDir, "video_track.m4s");
		const audioPath = join(tempDir, "audio_track.m4s");
		await Promise.all([
			downloadTrack(task.url, videoPath, "video"),
			downloadTrack(task.audioUrl, audioPath, "audio"),
		]);

		task.status = "muxing";
		task.phase = "muxing";
		task.percent = 100;

		const userDownloadsDir = getVideoDownloadsDir();
		mkdirSync(userDownloadsDir, { recursive: true });
		const filenameBase = sanitizeFilename(task.pageTitle);
		// Opus/WebM audio does not belong in an MP4 container (many players
		// render it silent), so YouTube-style tracks land in MKV instead
		const audioMime = (task.audioMimeType ?? "").toLowerCase();
		const useMkv =
			audioMime.includes("webm") || audioMime.includes("opus");
		const extension = useMkv ? "mkv" : "mp4";
		const outputPath = join(userDownloadsDir, `${filenameBase}.${extension}`);
		task.filename = `${filenameBase}.${extension}`;

		const muxRes = await muxDualTracksToMp4(
			videoPath,
			audioPath,
			outputPath,
		);
		if (!muxRes.success)
			throw new Error(muxRes.error || "FFmpeg 音视频轨道合成失败");

		task.status = "done";
		task.phase = undefined;
		task.outputPath = outputPath;
		task.completedAt = Date.now();
	}

	private async startTask(task: ServerVideoTask): Promise<void> {
		const controller = new AbortController();
		this.abortControllers.set(task.id, controller);
		const signal = controller.signal;

		task.status = "downloading";
		task.phase = "downloading";

		const baseHeaders: Record<string, string> = {
			"User-Agent":
				"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
		};
		if (task.pageUrl) {
			baseHeaders["Referer"] = task.pageUrl;
		}

		const tempDir = join(tmpdir(), `aiworkstation_video_${task.id}`);
		if (!existsSync(tempDir)) {
			mkdirSync(tempDir, { recursive: true });
		}

		try {
			// DASH split tracks (Bilibili): fetch video + audio, then mux
			if (task.kind === "dash") {
				await this.downloadDash(task, baseHeaders, signal, tempDir);
				return;
			}

			// Progressive video files (Douyin / Xiaohongshu) download as-is
			if (
				task.kind === "file" ||
				(!task.kind && VIDEO_FILE_URL_RE.test(task.url))
			) {
				await this.downloadDirectFile(task, baseHeaders, signal);
				return;
			}

			const playlistText = await fetchText(task.url, baseHeaders);
			let mediaPlaylistUrl = task.url;
			let mediaText = playlistText;
			let audioPlaylistUrl: string | null = null;

			// 1. Resolve master playlist
			if (playlistText.includes("#EXT-X-STREAM-INF")) {
				const variants = parseMasterPlaylist(playlistText, task.url);
				if (variants.length === 0)
					throw new Error("Master playlist 中未解析出有效清晰度流");
				const best = variants.reduce((a, b) =>
					b.bandwidth > a.bandwidth ? b : a,
				);
				mediaPlaylistUrl = best.url;
				mediaText = await fetchText(mediaPlaylistUrl, baseHeaders);

				audioPlaylistUrl = parseAudioPlaylistUrl(
					playlistText,
					task.url,
					best.audioGroup,
				);
			}

			// 2. Parse video segments
			const { segments: videoSegments, isFmp4 } = parseMediaPlaylist(
				mediaText,
				mediaPlaylistUrl,
			);
			if (videoSegments.length === 0) throw new Error("未解析到任何视频切片");

			let audioSegments: typeof videoSegments = [];
			if (audioPlaylistUrl) {
				const audioText = await fetchText(audioPlaylistUrl, baseHeaders);
				const parsedAudio = parseMediaPlaylist(audioText, audioPlaylistUrl);
				audioSegments = parsedAudio.segments;
			}

			task.totalSegments = videoSegments.length + audioSegments.length;

			const reportProgress = () => {
				task.doneSegments++;
				if (task.totalSegments > 0) {
					task.percent = Math.min(
						100,
						Math.round((task.doneSegments / task.totalSegments) * 100),
					);
				}
			};

			// 3. Download segments with bounded concurrency
			const concurrency = 6;
			const videoFiles = await downloadTrackSegments(
				videoSegments,
				tempDir,
				"video",
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
					"audio",
					baseHeaders,
					signal,
					concurrency,
					reportProgress,
				);
			}

			// 4. Muxing phase
			task.status = "muxing";
			task.phase = "muxing";
			task.percent = 100;

			const combinedVideoPath = join(tempDir, "combined_video.ts");
			await concatFilesOnDisk(videoFiles, combinedVideoPath);

			// Determine final destination path (filesRootDir/downloads > system Downloads)
			const userDownloadsDir = getVideoDownloadsDir();
			mkdirSync(userDownloadsDir, { recursive: true });
			const filenameBase = sanitizeFilename(task.pageTitle);
			const outputMp4Path = join(userDownloadsDir, `${filenameBase}.mp4`);
			task.filename = `${filenameBase}.mp4`;

			if (audioFiles.length > 0) {
				const combinedAudioPath = join(tempDir, "combined_audio.ts");
				await concatFilesOnDisk(audioFiles, combinedAudioPath);
				const muxRes = await muxDualTracksToMp4(
					combinedVideoPath,
					combinedAudioPath,
					outputMp4Path,
				);
				if (!muxRes.success)
					throw new Error(muxRes.error || "FFmpeg 音视频轨道合成失败");
			} else if (!isFmp4) {
				// MPEG-TS single stream -> Remux to MP4
				const remuxRes = await remuxTsToMp4(combinedVideoPath, outputMp4Path);
				if (!remuxRes.success)
					throw new Error(remuxRes.error || "FFmpeg TS转MP4合成失败");
			} else {
				// Native fMP4 stream without separate audio track
				await fs.rename(combinedVideoPath, outputMp4Path);
			}

			task.status = "done";
			task.phase = undefined;
			task.outputPath = outputMp4Path;
			task.completedAt = Date.now();
		} catch (err: any) {
			if (signal.aborted) {
				task.status = "cancelled";
			} else {
				task.status = "error";
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
