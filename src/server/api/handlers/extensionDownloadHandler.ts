import { createReadStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import { sendJson } from "../utils.ts";

const EXTENSION_OUTPUT_DIR = path.join(
	process.cwd(),
	"extensions/aicollector/.output",
);

/**
 * Handles GET /api/extension/download
 * Serves the latest packaged AI Collector Chrome extension zip
 * from extensions/aicollector/.output as an attachment download.
 */
export async function handleExtensionDownloadRequest(
	req: IncomingMessage,
	res: ServerResponse,
): Promise<void> {
	if (req.method !== "GET") {
		sendJson(res, { success: false, error: "Method not allowed" }, 405);
		return;
	}

	try {
		const files = await readdir(EXTENSION_OUTPUT_DIR);
		const zipFiles = files.filter(
			(name) => name.endsWith(".zip") && name.includes("chrome"),
		);
		if (zipFiles.length === 0) {
			sendJson(
				res,
				{
					success: false,
					error: "暂未找到已打包的插件安装包，请先执行插件构建",
				},
				404,
			);
			return;
		}

		// Pick the most recently modified zip package
		let latestZip = zipFiles[0];
		let latestMtime = 0;
		for (const name of zipFiles) {
			const fileStat = await stat(path.join(EXTENSION_OUTPUT_DIR, name));
			if (fileStat.mtimeMs > latestMtime) {
				latestMtime = fileStat.mtimeMs;
				latestZip = name;
			}
		}

		const filePath = path.join(EXTENSION_OUTPUT_DIR, latestZip);
		res.setHeader("Content-Type", "application/zip");
		res.setHeader(
			"Content-Disposition",
			`attachment; filename="${encodeURIComponent(latestZip)}"`,
		);
		res.statusCode = 200;
		createReadStream(filePath).pipe(res);
	} catch (err: any) {
		sendJson(
			res,
			{ success: false, error: err?.message || "读取插件安装包失败" },
			500,
		);
	}
}
