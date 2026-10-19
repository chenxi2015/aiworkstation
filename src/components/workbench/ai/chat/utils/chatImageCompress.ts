import type { ChatContextItem } from "../../../../../types/chatContext";

const MAX_IMAGE_DIMENSION = 1536;
const JPEG_COMPRESS_QUALITY = 0.85;
const FAST_BYPASS_SIZE_BYTES = 200 * 1024; // 200 KB

export interface PreparedChatImage {
	dataUrl: string;
	sizeFormatted: string;
	name: string;
}

/**
 * Format bytes to human readable format
 */
export function formatBytes(bytes: number): string {
	if (!bytes || bytes <= 0) return "0 B";
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Read File as raw Data URL using FileReader
 */
function readRawDataUrl(file: File | Blob): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(reader.result as string);
		reader.onerror = () => reject(new Error("Failed to read image file"));
		reader.readAsDataURL(file);
	});
}

/**
 * Optimizes an image file for vision LLM consumption.
 * Scales down large images to MAX_IMAGE_DIMENSION to prevent exceeding API limits
 * and minimize token consumption while maintaining high OCR/vision fidelity.
 */
export async function prepareChatImage(file: File): Promise<PreparedChatImage> {
	const name = file.name || "截图";
	const isSvg = file.type === "image/svg+xml" || name.endsWith(".svg");
	const isGif = file.type === "image/gif" || name.endsWith(".gif");

	// Bypass compression for SVGs, GIFs or small files below threshold
	if (isSvg || isGif || file.size <= FAST_BYPASS_SIZE_BYTES) {
		const rawUrl = await readRawDataUrl(file);
		return {
			dataUrl: rawUrl,
			sizeFormatted: formatBytes(file.size),
			name,
		};
	}

	// For larger images, decode and compress using Canvas
	try {
		const objectUrl = URL.createObjectURL(file);
		const img = new Image();
		await new Promise<void>((resolve, reject) => {
			img.onload = () => resolve();
			img.onerror = () => reject(new Error("Image decode failed"));
			img.src = objectUrl;
		});
		URL.revokeObjectURL(objectUrl);

		const { width, height } = img;
		const longestSide = Math.max(width, height);

		// If dimensions are already within safe limit and size is under 1MB, keep raw
		if (longestSide <= MAX_IMAGE_DIMENSION && file.size < 1024 * 1024) {
			const rawUrl = await readRawDataUrl(file);
			return {
				dataUrl: rawUrl,
				sizeFormatted: formatBytes(file.size),
				name,
			};
		}

		// Calculate scaled dimensions
		let targetWidth = width;
		let targetHeight = height;
		if (longestSide > MAX_IMAGE_DIMENSION) {
			const scale = MAX_IMAGE_DIMENSION / longestSide;
			targetWidth = Math.max(1, Math.round(width * scale));
			targetHeight = Math.max(1, Math.round(height * scale));
		}

		const canvas = document.createElement("canvas");
		canvas.width = targetWidth;
		canvas.height = targetHeight;
		const ctx = canvas.getContext("2d");
		if (!ctx) {
			const rawUrl = await readRawDataUrl(file);
			return { dataUrl: rawUrl, sizeFormatted: formatBytes(file.size), name };
		}

		ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
		const compressedDataUrl = canvas.toDataURL(
			"image/jpeg",
			JPEG_COMPRESS_QUALITY,
		);

		// Estimate compressed size from base64 length: (len * 3) / 4 - padding
		const estimatedBytes = Math.round((compressedDataUrl.length * 3) / 4);

		return {
			dataUrl: compressedDataUrl,
			sizeFormatted: formatBytes(estimatedBytes),
			name,
		};
	} catch {
		// Fallback to raw data URL on any canvas failure
		const rawUrl = await readRawDataUrl(file);
		return {
			dataUrl: rawUrl,
			sizeFormatted: formatBytes(file.size),
			name,
		};
	}
}

/**
 * Creates a normalized ChatContextItem for an image attachment
 */
export async function createChatImageContextItem(
	file: File,
	seq: number,
): Promise<ChatContextItem> {
	const { dataUrl, sizeFormatted, name } = await prepareChatImage(file);
	const nativePath = typeof (file as { path?: string }).path === "string" ? (file as { path?: string }).path : undefined;
	return {
		id: `img_${Date.now()}_${seq}`,
		type: "image",
		title: name,
		subtitle: sizeFormatted,
		thumbnail: dataUrl,
		filePath: nativePath,
		data: nativePath ? { filePath: nativePath } : undefined,
	};
}

