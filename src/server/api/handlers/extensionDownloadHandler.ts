import { createReadStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import { REPO_CONFIG } from "../../../config/app.ts";
import { sendJson } from "../utils.ts";

const EXTENSION_OUTPUT_DIR = path.join(
	process.cwd(),
	"extensions/aicollector/.output",
);

/**
 * Handles GET /api/extension/download
 * Serves the latest packaged AI Collector Chrome extension zip
 * from extensions/aicollector/.output as an attachment download,
 * or redirects to GitHub Releases if local package is missing.
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
			res.setHeader("Location", REPO_CONFIG.RELEASES_URL);
			res.statusCode = 302;
			res.end();
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
	} catch (err: unknown) {
		console.warn(
			"Local extension package not found, redirecting to GitHub Releases:",
			err,
		);
		res.setHeader("Location", REPO_CONFIG.RELEASES_URL);
		res.statusCode = 302;
		res.end();
	}
}
