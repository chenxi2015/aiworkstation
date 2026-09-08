import type { IncomingMessage, ServerResponse } from "node:http";
import {
	type CrawlJobResult,
	completeJob,
	markExtensionPoll,
	takeJob,
} from "../crawlerJobQueue.ts";
import { readJsonBody, sendJson } from "../utils.ts";

const MAX_LONG_POLL_MS = 25_000;

/**
 * Handles /api/crawler endpoints polled by the AI Collector extension
 * background worker (silent crawler channel).
 *
 * - GET  /api/crawler/jobs/next?timeout=20000  long-poll for the next job
 * - POST /api/crawler/jobs/:id/result          post back crawl result
 */
export async function handleCrawlerRequest(
	req: IncomingMessage,
	res: ServerResponse,
	pathname: string,
): Promise<void> {
	const resultMatch = pathname.match(/^\/api\/crawler\/jobs\/([^/]+)\/result$/);

	if (req.method === "POST" && resultMatch) {
		try {
			const body = await readJsonBody<CrawlJobResult>(req);
			completeJob(resultMatch[1] ?? "", body);
			sendJson(res, { success: true });
		} catch (err: unknown) {
			const errMsg = err instanceof Error ? err.message : String(err);
			sendJson(res, { success: false, error: errMsg }, 400);
		}
		return;
	}

	if (req.method === "GET" && pathname === "/api/crawler/jobs/next") {
		const query = new URL(req.url || "", "http://localhost").searchParams;
		const requested = Number(query.get("timeout")) || 20_000;
		const timeout = Math.max(1_000, Math.min(requested, MAX_LONG_POLL_MS));

		markExtensionPoll();
		const job = await takeJob(timeout);
		sendJson(res, { success: true, job });
		return;
	}

	sendJson(res, { success: false, error: "Not found" }, 404);
}
