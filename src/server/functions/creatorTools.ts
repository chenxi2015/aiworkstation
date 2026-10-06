import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { createServerFn } from "@tanstack/react-start";
import type { Material } from "../../components/creator/types.ts";
import { formatBytes } from "../ai/fs/fsSafety.ts";
import { workbenchDb } from "../db/sqlite.ts";
import { getMaterialAssetsDir } from "../services/filesRoot.ts";
import {
	burnSubtitlesToVideo,
	changeMediaSpeed,
	compressVideoWithCrf,
	convertAspectWithBlur,
	createVideoFilmStrip,
	extractCoverFrame,
	normalizeAudioLoudness,
	runFfmpeg,
} from "../services/nativeFfmpeg.ts";

export interface RunFfmpegToolPayload {
	toolId: string;
	sourcePath: string;
	params?: Record<string, string | number | boolean>;
	title?: string;
	folderId?: number | null;
}

/**
 * Strategy handler interface for dispatching FFmpeg commands cleanly.
 */
type ToolExecutionHandler = (
	inputPath: string,
	outputPath: string,
	params: Record<string, string | number | boolean>,
) => Promise<{ success: boolean; error?: string }>;

const FFMPEG_TOOL_STRATEGIES: Record<
	string,
	{
		ext: string;
		suffix: string;
		handler: ToolExecutionHandler;
	}
> = {
	"video-blur-background": {
		ext: ".mp4",
		suffix: "_blurred",
		handler: (input, output, params) => {
			const ratio = String(params.targetRatio || "9:16");
			const [w, h] =
				ratio === "16:9"
					? [1920, 1080]
					: ratio === "1:1"
						? [1080, 1080]
						: [1080, 1920];
			const blur = Number(params.blurIntensity || 25);
			return convertAspectWithBlur(input, output, {
				width: w,
				height: h,
				blur,
			});
		},
	},
	"video-smart-compress": {
		ext: ".mp4",
		suffix: "_compressed",
		handler: (input, output, params) => {
			const crf = Number(params.crfValue || 23);
			return compressVideoWithCrf(input, output, { crf });
		},
	},
	"video-speed-adjust": {
		ext: ".mp4",
		suffix: "_speed",
		handler: (input, output, params) => {
			const speed = Number(params.speedRate || 1.5);
			return changeMediaSpeed(input, output, speed);
		},
	},
	"video-keyframe-cover": {
		ext: ".jpg",
		suffix: "_cover",
		handler: (input, output, params) => {
			const timestamp = String(params.timestamp || "00:00:02");
			return extractCoverFrame(input, output, timestamp);
		},
	},
	"video-burn-subtitles": {
		ext: ".mp4",
		suffix: "_subtitled",
		handler: (input, output, params) => {
			const srtPath = String(params.srtPath || "");
			const fontSize = Number(params.fontSize || 22);
			return burnSubtitlesToVideo(input, srtPath, output, { fontSize });
		},
	},
	"video-mute": {
		ext: ".mp4",
		suffix: "_muted",
		handler: (input, output) => {
			return runFfmpeg([
				"-y",
				"-i",
				input,
				"-c:v",
				"copy",
				"-an",
				"-movflags",
				"+faststart",
				output,
			]);
		},
	},
	"video-fast-trim": {
		ext: ".mp4",
		suffix: "_trimmed",
		handler: (input, output, params) => {
			const start = String(params.startTime || "00:00:00");
			const duration = String(params.duration || "00:00:10");
			return runFfmpeg([
				"-y",
				"-ss",
				start,
				"-t",
				duration,
				"-i",
				input,
				"-c",
				"copy",
				"-movflags",
				"+faststart",
				output,
			]);
		},
	},
	"video-to-gif": {
		ext: ".gif",
		suffix: "_animated",
		handler: (input, output, params) => {
			const fps = String(params.fps || "15");
			const width = String(params.width || "480");
			const filter = `fps=${fps},scale=${width}:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse`;
			return runFfmpeg([
				"-y",
				"-i",
				input,
				"-vf",
				filter,
				"-loop",
				"0",
				output,
			]);
		},
	},
	"audio-loudnorm": {
		ext: ".mp3",
		suffix: "_loudnorm",
		handler: (input, output, params) => {
			const targetI = Number(params.targetStandard || -14);
			return normalizeAudioLoudness(input, output, targetI);
		},
	},
	"image-video-strip": {
		ext: ".jpg",
		suffix: "_strip",
		handler: (input, output, params) => {
			const rows = Number(params.gridRows || 4);
			return createVideoFilmStrip(input, output, rows);
		},
	},
};

/**
 * Execute FFmpeg strategy and register generated asset into SQLite.
 */
async function processMediaPipeline(
	sourcePath: string,
	toolId: string,
	params: Record<string, string | number | boolean>,
	folderId?: number | null,
	title?: string,
): Promise<{
	success: boolean;
	material?: Material;
	assetUrl?: string;
	outputFilename?: string;
	outputSizeBytes?: number;
	error?: string;
}> {
	const strategy = FFMPEG_TOOL_STRATEGIES[toolId];
	if (!strategy) {
		return { success: false, error: `不支持的工具类型：${toolId}` };
	}

	if (!sourcePath || !existsSync(sourcePath)) {
		return { success: false, error: `输入源文件不存在：${sourcePath}` };
	}

	const inputBase = basename(sourcePath, extname(sourcePath));
	const outputFilename = `${inputBase}${strategy.suffix}${strategy.ext}`;

	// Pre-create material record to obtain storage directory
	const toolTitle = title || `${inputBase} (${toolId})`;
	const materialId = workbenchDb.createMaterial({
		sourceType: "manual",
		folderId: folderId ?? null,
		title: toolTitle,
		content: `由自媒体工具箱 [${toolId}] 处理生成，源文件：${basename(sourcePath)}`,
		note: null,
	});

	const destDir = getMaterialAssetsDir(materialId);
	mkdirSync(destDir, { recursive: true });
	const outputFilePath = join(destDir, outputFilename);

	// Execute FFmpeg pipeline
	const result = await strategy.handler(sourcePath, outputFilePath, params);
	if (!result.success || !existsSync(outputFilePath)) {
		workbenchDb.deleteMaterial(materialId);
		return {
			success: false,
			error: result.error || "FFmpeg 执行未生成输出文件",
		};
	}

	// Register generated asset file
	const stat = statSync(outputFilePath);
	const assetKind =
		strategy.ext === ".jpg" ||
		strategy.ext === ".png" ||
		strategy.ext === ".gif"
			? "image"
			: strategy.ext === ".mp3" || strategy.ext === ".wav"
				? "audio"
				: "video";

	workbenchDb.addAsset({
		materialId,
		relPath: outputFilename,
		kind: assetKind,
		filename: outputFilename,
		sizeBytes: stat.size,
		storageMode: "managed",
	});

	workbenchDb.updateMaterial(materialId, {
		content: `处理完成：${outputFilename}（${formatBytes(stat.size)}），已归档至素材库。`,
	});

	const finalMaterial = workbenchDb.getMaterial(materialId);
	const assetUrl = `/api/files/creator/materials/${materialId}/${encodeURIComponent(outputFilename)}`;

	return {
		success: true,
		material: finalMaterial ?? undefined,
		assetUrl,
		outputFilename,
		outputSizeBytes: stat.size,
	};
}

/**
 * Server Function: Execute FFmpeg creator utility on an existing file path.
 */
export const executeFfmpegCreatorTool = createServerFn({ method: "POST" })
	.validator((data: RunFfmpegToolPayload) => data)
	.handler(async ({ data }) => {
		return processMediaPipeline(
			data.sourcePath,
			data.toolId,
			data.params || {},
			data.folderId,
			data.title,
		);
	});

/**
 * Server Function: Upload a media file from browser and run FFmpeg creator utility directly.
 */
export const processUploadedMediaWithFfmpeg = createServerFn({
	method: "POST",
})
	.validator((formData: FormData) => {
		const file = formData.get("file");
		if (!(file instanceof File)) throw new Error("缺少上传文件");
		const toolId = String(formData.get("toolId") || "");
		if (!toolId) throw new Error("缺少工具ID");

		const rawParams = formData.get("params");
		let params: Record<string, string | number | boolean> = {};
		if (typeof rawParams === "string" && rawParams.trim()) {
			try {
				params = JSON.parse(rawParams);
			} catch {}
		}

		return { file, toolId, params };
	})
	.handler(async ({ data }) => {
		// Save uploaded file into a temporary input location in materials folder
		const timestamp = Date.now();
		const cleanName = basename(data.file.name).replace(/\s+/g, "_");
		const tempDir = join(getMaterialAssetsDir(0), "_tmp_inputs");
		mkdirSync(tempDir, { recursive: true });
		const tempInputPath = join(tempDir, `${timestamp}_${cleanName}`);

		const buffer = Buffer.from(await data.file.arrayBuffer());
		writeFileSync(tempInputPath, buffer);

		try {
			return await processMediaPipeline(
				tempInputPath,
				data.toolId,
				data.params,
				null,
				`${cleanName} (${data.toolId})`,
			);
		} finally {
			// Best-effort cleanup of temp upload file
			try {
				const { rmSync } = await import("node:fs");
				rmSync(tempInputPath, { force: true });
			} catch {}
		}
	});
