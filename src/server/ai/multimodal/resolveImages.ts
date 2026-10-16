import fs from "node:fs";
import path from "node:path";
import type { ChatContextItem } from "../../../types/chatContext.ts";
import { workbenchDb } from "../../db/sqlite.ts";
import { getFilesRootDir } from "../../services/filesRoot.ts";
import { resolveObsidianVaultDir } from "../../services/obsidian/vault.ts";

const MIME_BY_EXT: Record<string, string> = {
	png: "image/png",
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	webp: "image/webp",
	gif: "image/gif",
	svg: "image/svg+xml",
};

/**
 * Reads local asset file and returns as Base64 Data URI
 */
function readAssetAsDataUri(assetId: number): string | null {
	try {
		const asset = workbenchDb.getAsset(assetId);
		if (!asset) return null;

		let absPath = "";
		if (asset.storageMode === "external") {
			if (!asset.sourcePath) return null;
			absPath = path.resolve(asset.sourcePath);
		} else {
			const filesRoot = getFilesRootDir();
			absPath = path.resolve(filesRoot, asset.relPath);
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
		}

		if (!fs.existsSync(absPath) || !fs.statSync(absPath).isFile()) return null;

		const ext = path.extname(absPath).replace(".", "").toLowerCase();
		const mime = asset.mime || MIME_BY_EXT[ext] || "image/png";
		const data = fs.readFileSync(absPath);
		return `data:${mime};base64,${data.toString("base64")}`;
	} catch (err) {
		console.warn(`[resolveImages] Failed to read asset ${assetId}:`, err);
		return null;
	}
}

/**
 * Resolves context items into normalized TanStack AI ImagePart objects.
 * Supports:
 * - Direct Base64 data URIs (uploaded / pasted images)
 * - Local asset references (/api/assets/stream?id=...) converted to Data URIs
 * - Material library items containing image assets
 */
export function resolveImagePartsFromContext(
	contextItems?: ChatContextItem[],
): any[] {
	if (!contextItems || contextItems.length === 0) return [];

	const parts: any[] = [];

	for (const item of contextItems) {
		let dataUrl = "";

		if (item.type === "image" && item.thumbnail) {
			if (item.thumbnail.startsWith("data:")) {
				dataUrl = item.thumbnail;
			} else if (item.thumbnail.startsWith("/api/assets/stream?id=")) {
				const idMatch = item.thumbnail.match(/id=(\d+)/);
				if (idMatch) {
					dataUrl = readAssetAsDataUri(Number.parseInt(idMatch[1], 10)) || "";
				}
			} else if (
				item.thumbnail.startsWith("http://") ||
				item.thumbnail.startsWith("https://")
			) {
				// Avoid forwarding unreachable localhost URLs to cloud models
				if (
					!item.thumbnail.includes("localhost") &&
					!item.thumbnail.includes("127.0.0.1")
				) {
					parts.push({
						type: "image",
						source: { type: "url", value: item.thumbnail },
					});
					continue;
				}
			}
		} else if (item.type === "material" && item.materialId != null) {
			// Resolve image from material assets if available
			const material = workbenchDb.getMaterial(item.materialId);
			const imageAsset = material?.assets?.find((a) => a.kind === "image");
			if (imageAsset) {
				dataUrl = readAssetAsDataUri(imageAsset.id) || "";
			}
		} else if (
			(item.type === "image" || item.type === "note") &&
			(Boolean(item.notePath) ||
				Boolean(item.thumbnail && item.thumbnail.includes("/api/obsidian/asset")))
		) {
			try {
				let targetPath = item.notePath || "";
				if (!targetPath && item.thumbnail) {
					const urlObj = new URL(item.thumbnail, "http://localhost");
					targetPath =
						urlObj.searchParams.get("path") ||
						urlObj.searchParams.get("name") ||
						"";
				}
				if (targetPath) {
					const { path: vaultRoot } = resolveObsidianVaultDir();
					let absPath = path.resolve(vaultRoot, targetPath);
					if (!fs.existsSync(absPath)) {
						const base = path.basename(targetPath);
						const findAsset = (dir: string, depth = 0): string | null => {
							if (depth > 6) return null;
							try {
								const entries = fs.readdirSync(dir, { withFileTypes: true });
								for (const e of entries) {
									if (e.name.startsWith(".")) continue;
									const p = path.join(dir, e.name);
									if (e.isDirectory()) {
										const hit = findAsset(p, depth + 1);
										if (hit) return hit;
									} else if (e.name === base) {
										return p;
									}
								}
							} catch {}
							return null;
						};
						const found = findAsset(vaultRoot);
						if (found) absPath = found;
					}
					if (fs.existsSync(absPath) && fs.statSync(absPath).isFile()) {
						const ext = path.extname(absPath).replace(".", "").toLowerCase();
						const mime = MIME_BY_EXT[ext] || "image/png";
						const data = fs.readFileSync(absPath);
						dataUrl = `data:${mime};base64,${data.toString("base64")}`;
					}
				}
			} catch (err) {
				console.warn("[resolveImages] Read vault image error:", err);
			}
		}

		if (dataUrl) {
			const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
			if (match) {
				parts.push({
					type: "image",
					source: { type: "data", value: match[2], mimeType: match[1] },
				});
			} else {
				parts.push({
					type: "image",
					source: { type: "url", value: dataUrl },
				});
			}
		}
	}

	return parts;
}

