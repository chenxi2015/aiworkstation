import type { IncomingMessage, ServerResponse } from "node:http";
import { dispatchExtensionApiRequest } from "./router.ts";

/**
 * Nitro production handler for the extension API (registered with
 * `format: "node"` in vite.config.ts, so the default export receives
 * raw Node req/res — identical to the Vite dev middleware).
 *
 * Unmatched /api/* paths get a JSON 404 instead of falling through
 * to the SSR catch-all HTML page.
 */
export default async function extensionApiHandler(
	req: IncomingMessage,
	res: ServerResponse,
): Promise<void> {
	const handled = await dispatchExtensionApiRequest(req, res);
	if (!handled && !res.headersSent) {
		res.statusCode = 404;
		res.setHeader("Content-Type", "application/json");
		res.end(JSON.stringify({ success: false, error: "API not found" }));
	}
}
