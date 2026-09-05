import type { IncomingMessage, ServerResponse } from "node:http";
import type { AgentChatParams, AgentStreamEvent } from "../../ai/agentTypes.ts";
import { readJsonBody, sendJson } from "../utils.ts";

/**
 * Handles /api/chat/stream SSE requests with step-by-step Agent tracking
 */
export async function handleChatStreamRequest(
	req: IncomingMessage,
	res: ServerResponse,
): Promise<void> {
	if (req.method !== "POST") {
		sendJson(res, { success: false, error: "Method not allowed" }, 405);
		return;
	}

	// 1. Establish SSE headers
	res.writeHead(200, {
		"Content-Type": "text/event-stream; charset=utf-8",
		"Cache-Control": "no-cache, no-transform",
		Connection: "keep-alive",
		"X-Accel-Buffering": "no",
	});

	// Flush initial handshake
	res.write(": sse-connected\n\n");

	const abortController = new AbortController();
	req.on("close", () => {
		abortController.abort();
	});

	try {
		const rawBody = await readJsonBody(req);
		const params = rawBody as AgentChatParams;

		const { runAgentStream } = await import("../../ai/agentRunner.ts");

		const emit = (event: AgentStreamEvent) => {
			if (res.writableEnded || res.closed) return;
			res.write(`data: ${JSON.stringify(event)}\n\n`);
		};

		await runAgentStream(params, emit, abortController.signal);
	} catch (err: unknown) {
		const errMsg = err instanceof Error ? err.message : String(err);
		if (!res.writableEnded && !res.closed) {
			const errEvent: AgentStreamEvent = {
				type: "error",
				message: errMsg,
			};
			res.write(`data: ${JSON.stringify(errEvent)}\n\n`);
		}
	} finally {
		if (!res.writableEnded && !res.closed) {
			res.end();
		}
	}
}
