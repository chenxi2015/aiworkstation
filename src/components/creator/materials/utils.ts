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
