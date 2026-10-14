/**
 * Utility for client-side image compression and format conversion (WebP, JPEG, PNG).
 * Uses native HTML5 Canvas without heavy external dependencies.
 */

export type CompressFormat = "image/webp" | "image/jpeg" | "image/png";

export interface CompressOptions {
	format: CompressFormat;
	quality: number; // 0.1 to 1.0
	maxDimension?: number; // 0 or undefined means original resolution
	background?: string; // background color for JPEG (defaults to white)
}

export interface CompressResult {
	file: File;
	blob: Blob;
	originalSize: number;
	compressedSize: number;
	savedBytes: number;
	ratio: number; // 0-1, fraction of size reduced
	width: number;
	height: number;
	filename: string;
}

export interface ImageInfo {
	width: number;
	height: number;
	size: number;
	mimeType: string;
	filename: string;
}

const FORMAT_EXT_MAP: Record<CompressFormat, string> = {
	"image/webp": ".webp",
	"image/jpeg": ".jpg",
	"image/png": ".png",
};

/**
 * Extract filename from URL or path
 */
export function extractFilename(src: string): string {
	let raw = "image";
	try {
		const pathname = new URL(src, window.location.href).pathname;
		const lastSegment = pathname.split("/").pop();
		if (lastSegment) {
			raw = decodeURIComponent(lastSegment);
		}
	} catch {
		// Ignore URL parsing errors
	}
	return raw;
}

/**
 * Generate output filename with new format extension
 */
export function generateTargetFilename(
	originalFilename: string,
	targetFormat: CompressFormat,
): string {
	const ext = FORMAT_EXT_MAP[targetFormat] || ".webp";
	const dotIndex = originalFilename.lastIndexOf(".");
	const baseName =
		dotIndex > 0 ? originalFilename.slice(0, dotIndex) : originalFilename;
	return `${baseName}${ext}`;
}

/**
 * Format bytes to readable string (e.g. 1.2 MB, 450 KB)
 */
export function formatBytes(bytes: number): string {
	if (!bytes || bytes <= 0) return "0 B";
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Fetch image blob from URL, handling both remote/local URLs and fallbacks
 */
export async function fetchImageBlob(src: string): Promise<Blob> {
	const res = await fetch(src, { mode: "cors" });
	if (!res.ok) {
		throw new Error(`无法获取图片数据 (HTTP ${res.status})`);
	}
	return await res.blob();
}

/**
 * Inspect image metadata (dimensions and byte size)
 */
export async function inspectImage(src: string): Promise<ImageInfo> {
	const filename = extractFilename(src);
	let blob: Blob | null = null;
	try {
		blob = await fetchImageBlob(src);
	} catch {
		// If fetch fails, proceed with Image element for dimensions
	}

	return new Promise((resolve, reject) => {
		const img = new Image();
		img.crossOrigin = "anonymous";
		img.onload = () => {
			resolve({
				width: img.naturalWidth || img.width,
				height: img.naturalHeight || img.height,
				size: blob?.size || 0,
				mimeType: blob?.type || "image/png",
				filename,
			});
		};
		img.onerror = () => reject(new Error("无法解码图片以读取尺寸"));
		img.src = blob ? URL.createObjectURL(blob) : src;
	});
}

/**
 * Compress and convert image using Canvas in browser memory
 */
export async function compressImage(
	src: string,
	options: CompressOptions,
): Promise<CompressResult> {
	const { format, quality, maxDimension = 0, background = "#ffffff" } = options;
	const originalFilename = extractFilename(src);

	// 1. Fetch raw blob
	const blob = await fetchImageBlob(src);
	const originalSize = blob.size;

	// 2. Decode into image bitmap or HTMLImageElement
	let bitmap: ImageBitmap | null = null;
	let imgElement: HTMLImageElement | null = null;
	let srcWidth = 0;
	let srcHeight = 0;

	if (typeof createImageBitmap === "function") {
		try {
			bitmap = await createImageBitmap(blob);
			srcWidth = bitmap.width;
			srcHeight = bitmap.height;
		} catch {
			// Fallback to Image element
		}
	}

	if (!bitmap) {
		imgElement = await new Promise<HTMLImageElement>((resolve, reject) => {
			const img = new Image();
			img.crossOrigin = "anonymous";
			const objectUrl = URL.createObjectURL(blob);
			img.onload = () => {
				URL.revokeObjectURL(objectUrl);
				resolve(img);
			};
			img.onerror = () => {
				URL.revokeObjectURL(objectUrl);
				reject(new Error("图片解码失败"));
			};
			img.src = objectUrl;
		});
		srcWidth = imgElement.naturalWidth || imgElement.width;
		srcHeight = imgElement.naturalHeight || imgElement.height;
	}

	try {
		// 3. Calculate target dimensions
		let targetWidth = srcWidth;
		let targetHeight = srcHeight;
		if (maxDimension > 0) {
			const longest = Math.max(srcWidth, srcHeight);
			if (longest > maxDimension) {
				const scale = maxDimension / longest;
				targetWidth = Math.max(1, Math.round(srcWidth * scale));
				targetHeight = Math.max(1, Math.round(srcHeight * scale));
			}
		}

		// 4. Draw to Canvas
		const canvas = document.createElement("canvas");
		canvas.width = targetWidth;
		canvas.height = targetHeight;
		const ctx = canvas.getContext("2d");
		if (!ctx) {
			throw new Error("当前环境不支持 Canvas 2D 绘图");
		}

		// Fill solid background for JPEG to prevent black transparent areas
		if (format === "image/jpeg") {
			ctx.fillStyle = background;
			ctx.fillRect(0, 0, targetWidth, targetHeight);
		}

		if (bitmap) {
			ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
		} else if (imgElement) {
			ctx.drawImage(imgElement, 0, 0, targetWidth, targetHeight);
		}

		// 5. Export to compressed format Blob
		const clampedQuality = Math.min(1, Math.max(0.05, quality));
		const outputBlob = await new Promise<Blob | null>((resolve) => {
			canvas.toBlob(resolve, format, clampedQuality);
		});

		if (!outputBlob) {
			throw new Error("图片编码失败，浏览器可能不支持目标格式");
		}

		const compressedSize = outputBlob.size;
		const savedBytes = Math.max(0, originalSize - compressedSize);
		const ratio = originalSize > 0 ? savedBytes / originalSize : 0;
		const targetFilename = generateTargetFilename(originalFilename, format);

		const file = new File([outputBlob], targetFilename, { type: format });

		return {
			file,
			blob: outputBlob,
			originalSize,
			compressedSize,
			savedBytes,
			ratio,
			width: targetWidth,
			height: targetHeight,
			filename: targetFilename,
		};
	} finally {
		if (bitmap) {
			bitmap.close();
		}
	}
}
