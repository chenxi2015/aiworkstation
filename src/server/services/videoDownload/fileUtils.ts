import { createReadStream, createWriteStream, existsSync } from "node:fs";

/** Progressive video file extensions that download directly without parsing */
export const VIDEO_FILE_URL_RE = /\.(mp4|webm|mov|m4v|flv)(\?|#|$)/i;

export function sanitizeFilename(name: string): string {
	const cleaned = name
		.replace(/[\\/:*?"<>|#\s]+/g, "_")
		.replace(/_+/g, "_")
		.replace(/^_+|_+$/g, "")
		.slice(0, 80);
	return cleaned || `video_${Date.now()}`;
}

/** Picks a sensible file extension from the URL or the response MIME type */
export function extensionForVideoFile(mime: string, url: string): string {
	const fromUrl = /\.([a-z0-9]{2,4})(?:\?|#|$)/i.exec(url)?.[1]?.toLowerCase();
	if (fromUrl && ["mp4", "webm", "mov", "m4v", "flv"].includes(fromUrl)) {
		return fromUrl === "m4v" ? "mp4" : fromUrl;
	}
	if (mime.includes("webm")) return "webm";
	if (mime.includes("quicktime")) return "mov";
	return "mp4";
}

/**
 * Concatenate multiple segment files on disk into one combined file without memory overhead.
 * Explicitly guards stream errors to prevent crashing the Node process.
 */
export function concatFilesOnDisk(
	files: string[],
	targetPath: string,
): Promise<void> {
	return new Promise((resolve, reject) => {
		const outStream = createWriteStream(targetPath);
		let index = 0;
		let isSettled = false;

		const cleanupAndReject = (err: Error) => {
			if (isSettled) return;
			isSettled = true;
			outStream.destroy();
			reject(err);
		};

		outStream.on("error", cleanupAndReject);

		function next() {
			if (isSettled) return;
			if (index >= files.length) {
				isSettled = true;
				outStream.end(resolve);
				return;
			}

			const file = files[index++];
			if (!file || !existsSync(file)) {
				cleanupAndReject(new Error(`分片临时文件缺失: ${file}`));
				return;
			}

			const inStream = createReadStream(file);
			inStream.on("error", cleanupAndReject);
			inStream.pipe(outStream, { end: false });
			inStream.on("end", next);
		}

		next();
	});
}
