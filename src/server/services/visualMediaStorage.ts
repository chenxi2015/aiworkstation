import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { VisualMediaType } from "../../types/visualGeneration.ts";
import { assertPathWithinRoot, assertWritablePath } from "../ai/fs/fsSafety.ts";
import { getFilesRootDir, getVisualMediaDir } from "./filesRoot.ts";

/**
 * Determine file extension from Content-Type or data URL prefix or url extension
 */
function resolveExtension(
	mimeType?: string,
	rawUrl?: string,
	mediaType: VisualMediaType = "image",
): string {
	if (mimeType) {
		const clean = mimeType.toLowerCase();
		if (clean.includes("png")) return "png";
		if (clean.includes("jpeg") || clean.includes("jpg")) return "jpg";
		if (clean.includes("webp")) return "webp";
		if (clean.includes("gif")) return "gif";
		if (clean.includes("svg")) return "svg";
		if (clean.includes("mp4")) return "mp4";
		if (clean.includes("webm")) return "webm";
		if (clean.includes("mov")) return "mov";
	}
	if (rawUrl) {
		try {
			const parsed = new URL(rawUrl);
			const ext = path
				.extname(parsed.pathname)
				.replace(/^\./, "")
				.toLowerCase();
			if (ext && ext.length <= 5) return ext;
		} catch {
			// Ignore invalid URL
		}
	}
	return mediaType === "video" ? "mp4" : "png";
}

/**
 * Persist a visual generation image or video locally under filesRootDir/visual/...
 * and return the accessible local route URL (/api/files/visual/...).
 */
export async function persistVisualMediaLocally(
	urlOrBase64: string,
	mediaType: VisualMediaType = "image",
): Promise<string> {
	if (!urlOrBase64) return urlOrBase64;

	// If already a local route URL, no need to redownload
	if (urlOrBase64.startsWith("/api/files/")) {
		return urlOrBase64;
	}

	try {
		const filesRoot = getFilesRootDir();
		const destDir = getVisualMediaDir(mediaType);
		assertPathWithinRoot(destDir, filesRoot);
		assertWritablePath(destDir);
		fs.mkdirSync(destDir, { recursive: true });

		let buffer: Buffer;
		let ext = mediaType === "video" ? "mp4" : "png";

		if (urlOrBase64.startsWith("data:")) {
			// Data URL: data:image/png;base64,...
			const commaIdx = urlOrBase64.indexOf(",");
			if (commaIdx === -1) return urlOrBase64;
			const mimePart = urlOrBase64.slice(5, commaIdx).split(";")[0];
			ext = resolveExtension(mimePart, undefined, mediaType);
			const base64Data = urlOrBase64.slice(commaIdx + 1);
			buffer = Buffer.from(base64Data, "base64");
		} else if (
			urlOrBase64.startsWith("http://") ||
			urlOrBase64.startsWith("https://")
		) {
			// Remote URL: fetch with timeout
			const res = await fetch(urlOrBase64, {
				signal: AbortSignal.timeout(15000), // 15 seconds timeout
			});
			if (!res.ok) {
				console.warn(
					`[visualMediaStorage] Failed to fetch remote media: ${res.status} ${res.statusText}`,
				);
				return urlOrBase64; // Fallback to remote URL
			}
			const contentType = res.headers.get("content-type") || undefined;
			ext = resolveExtension(contentType, urlOrBase64, mediaType);
			const arrayBuffer = await res.arrayBuffer();
			buffer = Buffer.from(arrayBuffer);
		} else if (urlOrBase64.length > 500 && !urlOrBase64.includes("/")) {
			// Raw base64 string
			buffer = Buffer.from(urlOrBase64, "base64");
		} else {
			return urlOrBase64;
		}

		if (!buffer || buffer.length === 0) {
			return urlOrBase64;
		}

		const timestamp = new Date()
			.toISOString()
			.replace(/[-:T]/g, "")
			.slice(0, 14);
		const randomSuffix = crypto.randomBytes(4).toString("hex");
		const filename = `visual_${timestamp}_${randomSuffix}.${ext}`;
		const filePath = path.join(destDir, filename);

		assertPathWithinRoot(filePath, filesRoot);
		fs.writeFileSync(filePath, buffer);

		const subDir = mediaType === "video" ? "videos" : "images";
		return `/api/files/visual/${subDir}/${filename}`;
	} catch (err) {
		console.warn("[visualMediaStorage] Failed to persist visual media:", err);
		return urlOrBase64;
	}
}