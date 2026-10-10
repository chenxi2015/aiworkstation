import fs from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";

/**
 * GET /api/local-file?path=<绝对路径>
 * 以只读方式回读本机任意路径的文件内容（批量工具服务端选文件的回读通道）。
 * 仅限绝对路径 + 存在的普通文件；服务绑定 127.0.0.1，与 openInOs 同级信任。
 */
export async function handleLocalFileRequest(
	req: IncomingMessage,
	res: ServerResponse,
): Promise<void> {
	if (req.method !== "GET") {
		res.statusCode = 405;
		res.end("Method not allowed");
		return;
	}
	try {
		const url = new URL(req.url || "", "http://localhost");
		const rawPath = url.searchParams.get("path") || "";
		if (!rawPath || !path.isAbsolute(rawPath)) {
			res.statusCode = 400;
			res.end("需要绝对路径");
			return;
		}
		const absPath = path.resolve(rawPath);
		if (!fs.existsSync(absPath) || !fs.statSync(absPath).isFile()) {
			res.statusCode = 404;
			res.end("文件不存在");
			return;
		}
		const ext = path.extname(absPath).replace(/^\./, "").toLowerCase();
		const { streamLocalFile } = await import("./assetStreamHandler.ts");
		streamLocalFile(req, res, absPath, ext);
	} catch (err: unknown) {
		res.statusCode = 500;
		res.end(err instanceof Error ? err.message : "读取失败");
	}
}
