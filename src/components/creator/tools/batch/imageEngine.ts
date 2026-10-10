import { ensureItemFile } from "./collectFiles";
import type { BatchItem } from "./types";

export type ImageOutputFormat =
	| "original"
	| "image/jpeg"
	| "image/png"
	| "image/webp";

export interface ImageCompressParams {
	/** 0-1 encoder quality, applies to jpeg/webp */
	quality: number;
	format: ImageOutputFormat;
	/** Clamp the longest edge; 0 keeps original resolution */
	maxDimension: number;
	/** JPEG fill color for transparent sources */
	background: string;
}

const FORMAT_EXT: Record<Exclude<ImageOutputFormat, "original">, string> = {
	"image/jpeg": ".jpg",
	"image/png": ".png",
	"image/webp": ".webp",
};

function swapExtension(filename: string, ext: string): string {
	const dot = filename.lastIndexOf(".");
	return dot > 0 ? `${filename.slice(0, dot)}${ext}` : `${filename}${ext}`;
}

function resolveTargetFormat(
	sourceFile: File,
	format: ImageOutputFormat,
): string {
	if (format !== "original") return format;
	return sourceFile.type || "image/png";
}

function outputFilename(item: BatchItem, targetFormat: string): string {
	const currentExt = item.name.slice(item.name.lastIndexOf(".")).toLowerCase();
	const targetExt =
		targetFormat === "image/jpeg"
			? ".jpg"
			: targetFormat === "image/png"
				? ".png"
				: targetFormat === "image/webp"
					? ".webp"
					: currentExt;
	return targetExt === currentExt
		? item.name
		: swapExtension(item.name, targetExt);
}

/**
 * Browser-side image compression / format conversion via canvas re-encode.
 * Runs fully in-memory; the output blob is attached to item.output.
 */
export async function compressImageItem(
	item: BatchItem,
	params: ImageCompressParams,
): Promise<void> {
	const sourceFile = await ensureItemFile(item);
	let bitmap: ImageBitmap;
	try {
		bitmap = await createImageBitmap(sourceFile);
	} catch {
		throw new Error("无法解码（SVG 等矢量图请先从队列移除）");
	}
	try {
		const { width, height } = bitmap;
		let targetWidth = width;
		let targetHeight = height;
		if (params.maxDimension > 0) {
			const longest = Math.max(width, height);
			if (longest > params.maxDimension) {
				const scale = params.maxDimension / longest;
				targetWidth = Math.round(width * scale);
				targetHeight = Math.round(height * scale);
			}
		}

		const canvas = document.createElement("canvas");
		canvas.width = targetWidth;
		canvas.height = targetHeight;
		const ctx = canvas.getContext("2d");
		if (!ctx) throw new Error("当前环境不支持 Canvas 2D");

		const targetFormat = resolveTargetFormat(sourceFile, params.format);
		if (targetFormat === "image/jpeg") {
			ctx.fillStyle = params.background || "#ffffff";
			ctx.fillRect(0, 0, targetWidth, targetHeight);
		}
		ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);

		const quality = Math.min(1, Math.max(0.05, params.quality));
		const blob = await new Promise<Blob | null>((resolve) => {
			canvas.toBlob(resolve, targetFormat, quality);
		});
		if (!blob) throw new Error("图片编码失败，可能是不支持的输出格式");

		// Never deliver a larger file when only compressing (same format)
		const isSameFormat = targetFormat === (sourceFile.type || "").toLowerCase();
		const finalBlob =
			isSameFormat && blob.size >= item.size ? sourceFile : blob;

		const filename = outputFilename(item, targetFormat);
		item.output = {
			blob: finalBlob,
			size: finalBlob.size,
			filename,
			absPath: item.absPath
				? item.absPath.slice(0, item.absPath.length - item.name.length) +
					filename
				: undefined,
		};
	} finally {
		bitmap.close();
	}
}

export { FORMAT_EXT, outputFilename, resolveTargetFormat };
