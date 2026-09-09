import { execFile } from "node:child_process";
import fs from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import os from "node:os";
import path from "node:path";
import { DB_DIR } from "../../db/connection.ts";
import { workbenchDb } from "../../db/sqlite.ts";
import { readJsonBody, sendJson } from "../utils.ts";

/**
 * Build the list of allowed roots dynamically:
 * always includes DB_DIR and system Downloads;
 * also includes the user-configured downloadsDir (for Windows Docker users).
 */
function getAllowedRoots(): string[] {
	const roots = [DB_DIR, path.join(os.homedir(), "Downloads")];
	try {
		const raw = workbenchDb.getSetting("workbench_settings");
		const parsed = raw ? JSON.parse(raw) : null;
		const custom = parsed?.downloadsDir?.trim();
		if (custom) roots.push(custom);
	} catch {
		// ignore db read error
	}
	return roots.map((p) => path.resolve(p));
}

function resolveOpenCommand(): { cmd: string; args: (p: string) => string[] } {
	switch (process.platform) {
		case "darwin":
			return { cmd: "open", args: (p) => [p] };
		case "win32":
			return { cmd: "explorer", args: (p) => [p] };
		default:
			return { cmd: "xdg-open", args: (p) => [p] };
	}
}

/**
 * POST /api/open-file  { path: string }
 * Opens a local file with the OS default handler (macOS `open`, etc.).
 * Called from the workbench chat UI when clicking a localfile:// link
 * or an absolute-path code chip in AI answers.
 */
export async function handleOpenFileRequest(
	req: IncomingMessage,
	res: ServerResponse,
): Promise<void> {
	if (req.method !== "POST") {
		sendJson(res, { success: false, error: "Method not allowed" }, 405);
		return;
	}
	try {
		const body = await readJsonBody<{ path?: string }>(req);
		const raw = (body.path || "").trim();
		if (!raw) {
			sendJson(res, { success: false, error: "缺少 path 参数" }, 400);
			return;
		}
		const resolved = path.resolve(raw);
		const allowed = getAllowedRoots().some(
			(root) => resolved === root || resolved.startsWith(`${root}${path.sep}`),
		);
		if (!allowed) {
			sendJson(
				res,
				{ success: false, error: "仅允许打开工作台数据目录与下载目录内的文件" },
				403,
			);
			return;
		}
		if (!fs.existsSync(resolved)) {
			sendJson(res, { success: false, error: "文件不存在或已被移动" }, 404);
			return;
		}
		const { cmd, args } = resolveOpenCommand();
		execFile(cmd, args(resolved), (err) => {
			if (err) {
				sendJson(
					res,
					{ success: false, error: String(err.message || err) },
					500,
				);
				return;
			}
			sendJson(res, { success: true });
		});
	} catch (err: unknown) {
		const errMsg = err instanceof Error ? err.message : String(err);
		sendJson(res, { success: false, error: errMsg }, 400);
	}
}
