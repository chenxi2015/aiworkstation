import fs from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import { assertPathWithinRoot } from "../../ai/fs/fsSafety.ts";
import { getFilesRootDir } from "../../services/filesRoot.ts";

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
	pdf: "application/pdf",
};

/**
 * GET /api/files/<relPath>
 * 以只读方式回读 filesRootDir 内的文件（编辑器媒体、素材资产等），
 * relPath 必须解析在 filesRootDir 之内（路径穿越防护）。
 */
export async function handleFileServeRequest(
	req: IncomingMessage,
	res: ServerResponse,
	pathname: string,
): Promise<void> {
	if (req.method !== "GET") {
		res.statusCode = 405;
		res.end("Method not allowed");
		return;
	}
	try {
		const relPath = decodeURIComponent(
			pathname.replace(/^\/api\/files\/?/, ""),
		);
		if (!relPath) {
			res.statusCode = 400;
			res.end("缺少文件路径");
			return;
		}
		const filesRoot = getFilesRootDir();
		const absPath = path.resolve(filesRoot, relPath);
		assertPathWithinRoot(absPath, filesRoot);
		if (!fs.existsSync(absPath) || !fs.statSync(absPath).isFile()) {
			res.statusCode = 404;
			res.end("文件不存在");
			return;
		}
		const ext = path.extname(absPath).replace(/^\./, "").toLowerCase();
		res.setHeader(
			"Content-Type",
			MIME_BY_EXT[ext] ?? "application/octet-stream",
		);
		res.setHeader("Content-Length", fs.statSync(absPath).size);
		res.setHeader("Cache-Control", "private, max-age=3600");
		fs.createReadStream(absPath).pipe(res);
	} catch (err: unknown) {
		const errMsg = err instanceof Error ? err.message : String(err);
		res.statusCode = 403;
		res.end(errMsg);
	}
}
