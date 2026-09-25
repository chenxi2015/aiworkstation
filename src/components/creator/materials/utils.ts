import type { Material, MaterialAsset } from "../types";
import type { TypeTab } from "./types";

/**
 * Determine material category based on asset kinds and source type:
 * Video assets -> video; Image assets -> image; Audio assets -> audio;
 * Bookmark snapshot -> bookmark; Others (text/markdown/etc.) -> doc.
 */
export function getMaterialKind(material: Material): Exclude<TypeTab, "all"> {
	const kinds = (material.assets ?? []).map((a) => a.kind);
	if (kinds.includes("video")) return "video";
	if (kinds.includes("image")) return "image";
	if (kinds.includes("audio")) return "audio";
	if (material.sourceType === "bookmark") return "bookmark";
	return "doc";
}

/**
 * Encode asset URL for static file serving via /api/files/
 */
export function assetUrl(relPath: string): string {
	return `/api/files/${relPath.split("/").map(encodeURIComponent).join("/")}`;
}

/**
 * Get media streaming URL for asset (supporting both managed and external in-place references)
 */
export function getAssetMediaUrl(asset: MaterialAsset): string {
	if (asset.id) {
		return `/api/assets/stream?id=${asset.id}`;
	}
	return assetUrl(asset.relPath);
}

const VIDEO_EXTS = new Set(["mp4", "mov", "webm", "mkv", "m4v"]);

/**
 * Check if an asset is a playable video
 */
export function isVideoAsset(asset: MaterialAsset): boolean {
	if (asset.kind === "video") return true;
	const ext = (asset.filename || asset.relPath).split(".").pop()?.toLowerCase();
	return ext ? VIDEO_EXTS.has(ext) : false;
}

/**
 * Extract all playable video assets from a material
 */
export function getVideoAssets(material: Material): MaterialAsset[] {
	return (material.assets ?? []).filter(isVideoAsset);
}

const IMAGE_EXTS = new Set([
	"png",
	"jpg",
	"jpeg",
	"gif",
	"webp",
	"svg",
	"bmp",
	"ico",
	"avif",
]);

/**
 * Check if an asset is a displayable image
 */
export function isImageAsset(asset: MaterialAsset): boolean {
	if (asset.kind === "image") return true;
	const ext = (asset.filename || asset.relPath).split(".").pop()?.toLowerCase();
	return ext ? IMAGE_EXTS.has(ext) : false;
}

/**
 * Extract all image assets from a material
 */
export function getImageAssets(material: Material): MaterialAsset[] {
	return (material.assets ?? []).filter(isImageAsset);
}

/**
 * Format bytes into human readable string
 */
export function formatBytes(bytes?: number | null): string {
	if (!bytes || bytes <= 0) return "";
	const units = ["B", "KB", "MB", "GB"];
	let i = 0;
	let val = bytes;
	while (val >= 1024 && i < units.length - 1) {
		val /= 1024;
		i++;
	}
	return `${val.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}
