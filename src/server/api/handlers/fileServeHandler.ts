import fs from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import { assertPathWithinRoot } from "../../ai/fs/fsSafety.ts";
import { getFilesRootDir } from "../../services/filesRoot.ts";

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
		const { streamLocalFile } = await import("./assetStreamHandler.ts");
		streamLocalFile(req, res, absPath, ext);
	} catch (err: unknown) {
		const errMsg = err instanceof Error ? err.message : String(err);
		res.statusCode = 403;
		res.end(errMsg);
	}
}
