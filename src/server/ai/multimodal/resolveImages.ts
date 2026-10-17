import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { ChatContextItem } from "../../../types/chatContext.ts";
import { DB_DIR } from "../../db/connection.ts";
import { workbenchDb } from "../../db/sqlite.ts";
import { getFilesRootDir } from "../../services/filesRoot.ts";
import { extractCoverFrame } from "../../services/nativeFfmpeg.ts";
import { resolveObsidianVaultDir } from "../../services/obsidian/vault.ts";

/**
 * Standard image mime map supported by multimodal LLM vision APIs.
 */
export const IMAGE_MIME_BY_EXT: Record<string, string> = {
	png: "image/png",
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	webp: "image/webp",
	gif: "image/gif",
	svg: "image/svg+xml",
	bmp: "image/bmp",
	avif: "image/avif",
};

/** Set of recognized video file extensions */
export const VIDEO_EXTENSIONS = new Set([
	"mp4",
	"mov",
	"webm",
	"mkv",
	"m4v",
	"flv",
	"avi",
]);

/**
 * Check if a file extension represents an image
 */
export function isImageExtension(ext: string): boolean {
	const clean = ext.toLowerCase().replace(/^\./, "");
	return Object.prototype.hasOwnProperty.call(IMAGE_MIME_BY_EXT, clean);
}

/**
 * Check if a file extension represents a video
 */
export function isVideoExtension(ext: string): boolean {
	const clean = ext.toLowerCase().replace(/^\./, "");
	return VIDEO_EXTENSIONS.has(clean);
}

/** Maximum image file size in bytes (10MB) to protect LLM vision payloads from 413 errors */
export const MAX_IMAGE_FILE_BYTES = 10 * 1024 * 1024;

/** Maximum Base64 Data URI length (approx 15MB text payload) */
export const MAX_BASE64_URI_LENGTH = 15 * 1024 * 1024;

/**
 * Validates that a mime string is a legitimate image format (not text/plain, video, etc.)
 */
export function isValidImageMime(mime?: string | null): boolean {
	if (!mime) return false;
	const base = mime.split(";")[0].trim().toLowerCase();
	return base.startsWith("image/");
}

/**
 * Extracts a cover keyframe from a local video file via native ffmpeg with disk caching.
 * Returns Base64 JPEG Data URI if successful, or null on failure.
 */
export async function resolveVideoCoverAsDataUri(
	videoAbsPath: string,
): Promise<string | null> {
	try {
		if (!fs.existsSync(videoAbsPath) || !fs.statSync(videoAbsPath).isFile()) {
			return null;
		}

		const stat = fs.statSync(videoAbsPath);
		const hash = crypto
			.createHash("md5")
			.update(`${videoAbsPath}:${stat.size}:${stat.mtimeMs}`)
			.digest("hex");

		const cacheDir = path.join(DB_DIR, "video_covers");
		if (!fs.existsSync(cacheDir)) {
			fs.mkdirSync(cacheDir, { recursive: true });
		}
		const coverPath = path.join(cacheDir, `${hash}.jpg`);

		if (!fs.existsSync(coverPath)) {
			// Extract frame at 1s timestamp
			const res = await extractCoverFrame(videoAbsPath, coverPath, "00:00:01");
			if (!res.success || !fs.existsSync(coverPath)) {
				// Retry at video origin for short clips (<1s)
				await extractCoverFrame(videoAbsPath, coverPath, "00:00:00");
			}
		}

		if (fs.existsSync(coverPath) && fs.statSync(coverPath).size > 0) {
			const data = fs.readFileSync(coverPath);
			return `data:image/jpeg;base64,${data.toString("base64")}`;
		}
	} catch (err) {
		console.warn("[resolveImages] Failed to extract video cover frame:", err);
	}
	return null;
}

/**
 * Inspects companion export files (.svg, .png) or embedded SVG for visual boards (Canvas, Excalidraw).
 * Returns Base64 Data URI if a valid image is found, or null otherwise.
 */
export function resolveBoardVisualAsDataUri(
	boardAbsPath: string,
): string | null {
	try {
		if (!fs.existsSync(boardAbsPath) || !fs.statSync(boardAbsPath).isFile()) {
			return null;
		}

		const dir = path.dirname(boardAbsPath);
		const ext = path.extname(boardAbsPath);
		const stem = path.basename(boardAbsPath, ext);

		// 1. Check companion files exported by Obsidian Excalidraw / Canvas
		const candidatePaths = [
			path.join(dir, `${stem}.svg`),
			path.join(dir, `${stem}.dark.svg`),
			path.join(dir, `${stem}.light.svg`),
			path.join(dir, `${stem}.png`),
			boardAbsPath.replace(/\.(excalidraw(\.md)?|canvas)$/i, ".svg"),
			boardAbsPath.replace(/\.(excalidraw(\.md)?|canvas)$/i, ".png"),
		];

		for (const cand of candidatePaths) {
			if (fs.existsSync(cand) && fs.statSync(cand).isFile()) {
				const candExt = path.extname(cand).replace(/^\./, "").toLowerCase();
				const mime = IMAGE_MIME_BY_EXT[candExt] || "image/png";
				const data = fs.readFileSync(cand);
				return `data:${mime};base64,${data.toString("base64")}`;
			}
		}

		// 2. Check embedded SVG markup in .excalidraw or .excalidraw.md file
		if (/\.excalidraw(\.md)?$/i.test(boardAbsPath)) {
			const text = fs.readFileSync(boardAbsPath, "utf-8");
			const svgMatch = text.match(/<svg[\s\S]*?<\/svg>/i);
			if (svgMatch) {
				const base64 = Buffer.from(svgMatch[0], "utf-8").toString("base64");
				return `data:image/svg+xml;base64,${base64}`;
			}
		}
	} catch (err) {
		console.warn("[resolveImages] Failed to resolve board visual:", err);
	}
	return null;
}

/**
 * Resolves absolute path for a managed or external asset
 */
function resolveAssetAbsPath(asset: {
	storageMode?: string | null;
	sourcePath?: string | null;
	relPath: string;
	materialId?: number | null;
}): string | null {
	if (asset.storageMode === "external") {
		return asset.sourcePath ? path.resolve(asset.sourcePath) : null;
	}

	const filesRoot = getFilesRootDir();
	let absPath = path.resolve(filesRoot, asset.relPath);
	if (
		(!fs.existsSync(absPath) || !fs.statSync(absPath).isFile()) &&
		asset.materialId
	) {
		const fallback = path.resolve(
			filesRoot,
			"creator",
			"materials",
			String(asset.materialId),
			asset.relPath,
		);
		if (fs.existsSync(fallback)) absPath = fallback;
	}

	return fs.existsSync(absPath) && fs.statSync(absPath).isFile() ? absPath : null;
}

/**
 * Reads local asset file and returns as Base64 Data URI.
 * Strictly verifies image/video type and NEVER returns fake image data for text/plain.
 */
async function readAssetAsDataUri(assetId: number): Promise<string | null> {
	try {
		const asset = workbenchDb.getAsset(assetId);
		if (!asset) return null;

		const absPath = resolveAssetAbsPath(asset);
		if (!absPath) return null;

		const ext = path.extname(absPath).replace(".", "").toLowerCase();

		// Case A: Video asset -> extract keyframe cover
		if (asset.kind === "video" || isVideoExtension(ext)) {
			return await resolveVideoCoverAsDataUri(absPath);
		}

		// Case B: Image asset -> read and wrap with genuine image MIME
		if (asset.kind === "image" || isImageExtension(ext)) {
			const stat = fs.statSync(absPath);
			if (stat.size > MAX_IMAGE_FILE_BYTES) {
				console.warn(
					`[resolveImages] Skipped oversized asset image: ${stat.size} bytes (limit: ${MAX_IMAGE_FILE_BYTES})`,
				);
				return null;
			}
			const mime =
				asset.mime && isValidImageMime(asset.mime)
					? asset.mime
					: IMAGE_MIME_BY_EXT[ext] || "image/png";
			const data = fs.readFileSync(absPath);
			return `data:${mime};base64,${data.toString("base64")}`;
		}

		// Non-image / non-video assets (e.g. text/plain, markdown, audio) MUST NOT be returned as image data
		return null;
	} catch (err) {
		console.warn(`[resolveImages] Failed to read asset ${assetId}:`, err);
		return null;
	}
}

/**
 * Searches for a file inside Obsidian Vault with depth-limited directory walk
 */
function findVaultFile(vaultRoot: string, targetPath: string): string | null {
	const direct = path.resolve(vaultRoot, targetPath);
	if (fs.existsSync(direct) && fs.statSync(direct).isFile()) {
		return direct;
	}

	const base = path.basename(targetPath);
	const search = (dir: string, depth = 0): string | null => {
		if (depth > 6) return null;
		try {
			const entries = fs.readdirSync(dir, { withFileTypes: true });
			for (const e of entries) {
				if (e.name.startsWith(".")) continue;
				const p = path.join(dir, e.name);
				if (e.isDirectory()) {
					const hit = search(p, depth + 1);
					if (hit) return hit;
				} else if (e.name === base) {
					return p;
				}
			}
		} catch {}
		return null;
	};

	return search(vaultRoot);
}

/**
 * Resolves context item into Base64 Data URI or external URL for visual AI input.
 */
async function resolveItemDataUrl(item: ChatContextItem): Promise<string | null> {
	// 1. Direct Image Type
	if (item.type === "image") {
		if (item.thumbnail) {
			if (item.thumbnail.startsWith("data:")) {
				if (item.thumbnail.length > MAX_BASE64_URI_LENGTH) {
					console.warn(
						`[resolveImages] Skipped oversized base64 data URI (${item.thumbnail.length} chars, limit: ${MAX_BASE64_URI_LENGTH})`,
					);
					return null;
				}
				// Only accept legitimate image data URIs
				const match = item.thumbnail.match(/^data:([^;]+);/);
				return match && isValidImageMime(match[1]) ? item.thumbnail : null;
			}
			if (item.thumbnail.startsWith("/api/assets/stream?id=")) {
				const idMatch = item.thumbnail.match(/id=(\d+)/);
				if (idMatch) {
					return await readAssetAsDataUri(Number.parseInt(idMatch[1], 10));
				}
			}
			if (
				item.thumbnail.startsWith("http://") ||
				item.thumbnail.startsWith("https://")
			) {
				if (
					!item.thumbnail.includes("localhost") &&
					!item.thumbnail.includes("127.0.0.1")
				) {
					return item.thumbnail;
				}
			}
		}

		if (item.notePath || item.thumbnail?.includes("/api/obsidian/asset")) {
			let targetPath = item.notePath || "";
			if (!targetPath && item.thumbnail) {
				try {
					const urlObj = new URL(item.thumbnail, "http://localhost");
					targetPath =
						urlObj.searchParams.get("path") ||
						urlObj.searchParams.get("name") ||
						"";
				} catch {}
			}
			if (targetPath) {
				const { path: vaultRoot } = resolveObsidianVaultDir();
				const absPath = findVaultFile(vaultRoot, targetPath);
				if (absPath) {
					const ext = path.extname(absPath).replace(".", "").toLowerCase();
					if (isImageExtension(ext)) {
						const stat = fs.statSync(absPath);
						if (stat.size > MAX_IMAGE_FILE_BYTES) {
							console.warn(
								`[resolveImages] Skipped oversized vault image: ${stat.size} bytes (limit: ${MAX_IMAGE_FILE_BYTES})`,
							);
							return null;
						}
						const mime = IMAGE_MIME_BY_EXT[ext] || "image/png";
						const data = fs.readFileSync(absPath);
						return `data:${mime};base64,${data.toString("base64")}`;
					}
				}
			}
		}
		return null;
	}

	// 2. Material: supports image assets and video keyframe covers
	if (item.type === "material" && item.materialId != null) {
		const material = workbenchDb.getMaterial(item.materialId);
		if (material?.assets && material.assets.length > 0) {
			// First priority: genuine image asset
			const imageAsset = material.assets.find(
				(a) => a.kind === "image" || isImageExtension(a.filename || a.relPath),
			);
			if (imageAsset) {
				return await readAssetAsDataUri(imageAsset.id);
			}

			// Second priority: video asset keyframe cover
			const videoAsset = material.assets.find(
				(a) => a.kind === "video" || isVideoExtension(a.filename || a.relPath),
			);
			if (videoAsset) {
				return await readAssetAsDataUri(videoAsset.id);
			}
		}
		return null;
	}

	// 3. Obsidian Note / Canvas / Whiteboard
	if (item.type === "note" && item.notePath) {
		const { path: vaultRoot } = resolveObsidianVaultDir();
		const absPath = findVaultFile(vaultRoot, item.notePath);
		if (absPath) {
			const ext = path.extname(absPath).replace(".", "").toLowerCase();
			if (isImageExtension(ext)) {
				const mime = IMAGE_MIME_BY_EXT[ext] || "image/png";
				const data = fs.readFileSync(absPath);
				return `data:${mime};base64,${data.toString("base64")}`;
			}
			if (/\.(canvas|excalidraw(\.md)?)$/i.test(absPath)) {
				return resolveBoardVisualAsDataUri(absPath);
			}
			// Plain markdown or text notes DO NOT produce image parts
		}
		return null;
	}

	// 4. File: check for video cover or image thumbnail
	if (item.type === "file") {
		if (item.thumbnail && item.thumbnail.startsWith("data:")) {
			const match = item.thumbnail.match(/^data:([^;]+);/);
			if (match && isValidImageMime(match[1])) {
				return item.thumbnail;
			}
		}
		if (item.title && isVideoExtension(item.title) && item.data?.filePath) {
			return await resolveVideoCoverAsDataUri(String(item.data.filePath));
		}
		return null;
	}

	return null;
}

/**
 * Resolves context items into normalized TanStack AI ImagePart objects.
 * Supports:
 * - Direct Base64 data URIs (validated image formats only)
 * - Local asset references (/api/assets/stream?id=...)
 * - Material library items (image assets & video keyframe covers)
 * - Whiteboards/Canvases (companion SVG/PNG or embedded SVG)
 * - Prevents text/plain, markdown, or non-image files from being sent to vision endpoints.
 */
export async function resolveImagePartsFromContext(
	contextItems?: ChatContextItem[],
): Promise<any[]> {
	if (!contextItems || contextItems.length === 0) return [];

	const parts: any[] = [];

	for (const item of contextItems) {
		const dataUrl = await resolveItemDataUrl(item);
		if (!dataUrl) continue;

		if (dataUrl.startsWith("data:")) {
			const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
			if (match) {
				const mime = match[1].trim().toLowerCase();
				if (isValidImageMime(mime)) {
					parts.push({
						type: "image",
						source: { type: "data", value: match[2], mimeType: mime },
					});
				} else {
					console.warn(
						`[resolveImages] Skipped invalid image MIME type: ${mime}`,
					);
				}
			}
		} else if (
			dataUrl.startsWith("http://") ||
			dataUrl.startsWith("https://")
		) {
			parts.push({
				type: "image",
				source: { type: "url", value: dataUrl },
			});
		}
	}

	return parts;
}
