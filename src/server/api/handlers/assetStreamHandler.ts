import fs from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import { assertPathWithinRoot } from "../../ai/fs/fsSafety.ts";
import { workbenchDb } from "../../db/sqlite.ts";
import { getFilesRootDir } from "../../services/filesRoot.ts";

export const ALLOWED_MEDIA_EXTS = new Set([
	"png",
	"jpg",
	"jpeg",
	"gif",
	"webp",
	"svg",
	"mp4",
	"mov",
	"webm",
	"mkv",
	"m4v",
	"mp3",
	"wav",
	"m4a",
	"ogg",
	"flac",
	"md",
	"markdown",
	"pdf",
	"txt",
]);

const MIME_BY_EXT: Record<string, string> = {
	png: "image/png",
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	gif: "image/gif",
	webp: "image/webp",
	svg: "image/svg+xml",
	mp4: "video/mp4",
	mov: "video/quicktime",
	webm: "video/webm",
	mkv: "video/x-matroska",
	m4v: "video/x-m4v",
	mp3: "audio/mpeg",
	wav: "audio/wav",
	m4a: "audio/mp4",
	ogg: "audio/ogg",
	flac: "audio/flac",
	md: "text/markdown; charset=utf-8",
	markdown: "text/markdown; charset=utf-8",
	pdf: "application/pdf",
	txt: "text/plain; charset=utf-8",
};

/**
 * Stream local file with HTTP Range support for seamless video/audio seeking
 */
export function streamLocalFile(
	req: IncomingMessage,
	res: ServerResponse,
	absPath: string,
	ext: string,
): void {
	const stat = fs.statSync(absPath);
	const fileSize = stat.size;
	const mime = MIME_BY_EXT[ext] ?? "application/octet-stream";
	const range = req.headers.range;

	res.setHeader("Accept-Ranges", "bytes");
	res.setHeader("Content-Type", mime);
	res.setHeader("Cache-Control", "private, max-age=3600");

	if (range) {
		const parts = range.replace(/bytes=/, "").split("-");
		const start = parseInt(parts[0], 10);
		const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

		if (
			Number.isNaN(start) ||
			start >= fileSize ||
			end >= fileSize ||
			start > end
		) {
			res.statusCode = 416; // Range Not Satisfiable
			res.setHeader("Content-Range", `bytes */${fileSize}`);
			res.end();
			return;
		}

		const chunkSize = end - start + 1;
		res.statusCode = 206;
		res.setHeader("Content-Range", `bytes ${start}-${end}/${fileSize}`);
		res.setHeader("Content-Length", chunkSize);

		const stream = fs.createReadStream(absPath, { start, end });
		stream.on("error", () => {
			if (!res.headersSent) res.statusCode = 500;
			res.end();
		});
		stream.pipe(res);
	} else {
		res.statusCode = 200;
		res.setHeader("Content-Length", fileSize);
		const stream = fs.createReadStream(absPath);
		stream.on("error", () => {
			if (!res.headersSent) res.statusCode = 500;
			res.end();
		});
		stream.pipe(res);
	}
}

/**
 * GET /api/assets/stream?id=<assetId>
 * Stream media asset from managed storage or external in-place reference
 */
export async function handleAssetStreamRequest(
	req: IncomingMessage,
	res: ServerResponse,
): Promise<void> {
	if (req.method !== "GET" && req.method !== "HEAD") {
		res.statusCode = 405;
		res.end("Method not allowed");
		return;
	}

	try {
		const url = new URL(req.url ?? "", "http://localhost");
		const idStr = url.searchParams.get("id");
		const assetId = idStr ? Number.parseInt(idStr, 10) : null;

		if (!assetId || Number.isNaN(assetId) || assetId <= 0) {
			res.statusCode = 400;
			res.end("缺少或无效的 assetId 参数");
			return;
		}

		const asset = workbenchDb.getAsset(assetId);
		if (!asset) {
			res.statusCode = 404;
			res.end("素材资产记录不存在");
			return;
		}

		let absPath: string;

		if (asset.storageMode === "external") {
			if (!asset.sourcePath) {
				res.statusCode = 404;
				res.end("外部素材未记录原始路径");
				return;
			}
			absPath = path.resolve(asset.sourcePath);
		} else {
			// Managed storage
			const filesRoot = getFilesRootDir();
			absPath = path.resolve(filesRoot, asset.relPath);
			assertPathWithinRoot(absPath, filesRoot);
		}

		if (!fs.existsSync(absPath) || !fs.statSync(absPath).isFile()) {
			res.statusCode = 404;
			res.end("原始文件不存在或已被移动/删除");
			return;
		}

		const ext = path.extname(absPath).replace(/^\./, "").toLowerCase();
		if (!ALLOWED_MEDIA_EXTS.has(ext)) {
			res.statusCode = 403;
			res.end("不支持或不允许访问该类型的文件");
			return;
		}

		streamLocalFile(req, res, absPath, ext);
	} catch (err: unknown) {
		const errMsg = err instanceof Error ? err.message : String(err);
		res.statusCode = 500;
		res.end(errMsg);
	}
}
