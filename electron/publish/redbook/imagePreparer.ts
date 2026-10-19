import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { app } from "electron";
import { resolveDataDir, SERVER_CONFIG } from "../../config.js";
import { getServerPort } from "../../server.js";

/**
 * Handles image discovery, downloading, and local caching for Xiaohongshu CDP upload.
 */
export class RedbookImagePreparer {
	/**
	 * Try resolving a relative file route directly from known local storage directories.
	 */
	public resolveLocalFileOnDisk(imgUrl: string): string | null {
		if (!imgUrl.startsWith("/api/files/")) return null;
		try {
			const rel = decodeURIComponent(imgUrl.slice("/api/files/".length));
			const home =
				(typeof app !== "undefined" && app?.getPath
					? app.getPath("home")
					: "") ||
				process.env.HOME ||
				os.homedir();
			const candidateDirs = [
				path.join(home, "Downloads", "aiworkstation"),
				path.join(home, "Downloads"),
				resolveDataDir(),
			];
			for (const dir of candidateDirs) {
				const fullPath = path.resolve(dir, rel);
				if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
					return fullPath;
				}
			}
		} catch {
			// Fallback to HTTP fetch
		}
		return null;
	}

	/**
	 * Ensure all image inputs are saved as concrete local files on disk
	 * so Chrome DevTools Protocol can inject them directly into file inputs.
	 */
	public async prepareLocalImages(images: string[]): Promise<string[]> {
		const cacheDir = path.join(resolveDataDir(), "publish-cache", "redbook");
		if (!fs.existsSync(cacheDir)) {
			fs.mkdirSync(cacheDir, { recursive: true });
		}

		const resolvedPaths: string[] = [];

		for (let i = 0; i < images.length; i++) {
			const img = images[i]?.trim();
			if (!img) continue;

			// 1. Existing local file on disk
			if (
				!img.startsWith("data:") &&
				!img.startsWith("http://") &&
				!img.startsWith("https://") &&
				!img.startsWith("/api/") &&
				fs.existsSync(img) &&
				fs.statSync(img).isFile()
			) {
				resolvedPaths.push(img);
				continue;
			}

			// 2. Relative file route (/api/files/...) resolved directly on disk if available
			const localDiskFile = this.resolveLocalFileOnDisk(img);
			if (localDiskFile) {
				resolvedPaths.push(localDiskFile);
				continue;
			}

			// 3. Data URL (Base64)
			if (img.startsWith("data:")) {
				try {
					const base64Index = img.indexOf(";base64,");
					if (base64Index !== -1) {
						const meta = img.slice(5, base64Index).toLowerCase();
						let ext = "png";
						if (meta.includes("jpeg") || meta.includes("jpg")) ext = "jpg";
						else if (meta.includes("webp")) ext = "webp";

						const rawBase64 = img.slice(base64Index + 8).replace(/\s/g, "");
						const buffer = Buffer.from(rawBase64, "base64");
						const filePath = path.join(
							cacheDir,
							`note_img_${Date.now()}_${i}.${ext}`,
						);
						fs.writeFileSync(filePath, buffer);
						resolvedPaths.push(filePath);
						continue;
					}
				} catch (err) {
					console.warn(
						`[RedbookImagePreparer] Failed to decode base64 image ${i}:`,
						err,
					);
				}
			}

			// 4. Remote HTTP URL or relative route (/api/files/...) resolved via local server
			const fetchUrl = img.startsWith("/")
				? `http://${SERVER_CONFIG.HOST}:${getServerPort()}${img}`
				: img;

			if (fetchUrl.startsWith("http://") || fetchUrl.startsWith("https://")) {
				try {
					const response = await fetch(fetchUrl);
					if (response.ok) {
						const arrayBuffer = await response.arrayBuffer();
						const buffer = Buffer.from(arrayBuffer);

						let ext = "png";
						const contentType = (
							response.headers.get("content-type") || ""
						).toLowerCase();
						if (contentType.includes("jpeg") || contentType.includes("jpg")) {
							ext = "jpg";
						} else if (contentType.includes("webp")) {
							ext = "webp";
						} else {
							try {
								const parsedUrl = new URL(fetchUrl);
								const pathExt = path
									.extname(parsedUrl.pathname)
									.replace(/^\./, "")
									.toLowerCase();
								if (["png", "jpg", "jpeg", "webp"].includes(pathExt)) {
									ext = pathExt === "jpeg" ? "jpg" : pathExt;
								}
							} catch {
								// Keep default png
							}
						}

						const filePath = path.join(
							cacheDir,
							`note_img_${Date.now()}_${i}.${ext}`,
						);
						fs.writeFileSync(filePath, buffer);
						resolvedPaths.push(filePath);
					} else {
						console.warn(
							`[RedbookImagePreparer] Failed to fetch image ${i} (${response.status}):`,
							fetchUrl,
						);
					}
				} catch (err) {
					console.warn(
						`[RedbookImagePreparer] Failed to download image ${i}:`,
						err,
					);
				}
			}
		}

		return resolvedPaths;
	}
}

export const redbookImagePreparer = new RedbookImagePreparer();

