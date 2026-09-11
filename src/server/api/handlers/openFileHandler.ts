import type { IncomingMessage, ServerResponse } from "node:http";
import { openInOs } from "../../services/systemOpener.ts";
import { readJsonBody, sendJson } from "../utils.ts";

/**
 * POST /api/open-file  { path: string }
 * Opens a local file or folder with the OS default handler.
 * Called from workbench settings (DB folder), chat UI localfile:// links, etc.
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

		await openInOs(raw);
		sendJson(res, { success: true });
	} catch (err: unknown) {
		const errMsg = err instanceof Error ? err.message : String(err);
		const statusCode = errMsg.includes("仅允许打开")
			? 403
			: errMsg.includes("不存在")
				? 404
				: 400;
		sendJson(res, { success: false, error: errMsg }, statusCode);
	}
}
