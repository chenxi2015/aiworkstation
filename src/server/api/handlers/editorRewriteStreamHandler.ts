import type { IncomingMessage, ServerResponse } from "node:http";
import { readJsonBody, sendJson } from "../utils.ts";

export interface EditorRewriteStreamParams {
	prompt: string;
	systemHint?: string;
	stylePreset?: string;
}

/**
 * Handles /api/editor/rewrite/stream SSE requests for realtime streaming AI rewrite
 */
export async function handleEditorRewriteStreamRequest(
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

	res.write(": sse-connected\n\n");

	const abortController = new AbortController();
	res.on("close", () => {
		if (!res.writableEnded) {
			abortController.abort();
		}
	});

	try {
		const rawBody = await readJsonBody(req);
		const params = rawBody as EditorRewriteStreamParams;

		const { chat } = await import("@tanstack/ai");
		const { openaiCompatibleText } = await import(
			"@tanstack/ai-openai/compatible"
		);
		const { resolveLlmConfig } = await import("../../ai/ragContext.ts");
		const { resolveEditorPresetPrompt } = await import(
			"../../ai/editorPresets.ts"
		);

		const { apiKey, baseUrl, model } = resolveLlmConfig();
		if (!apiKey) {
			res.write(
				`data: ${JSON.stringify({ type: "error", message: "请先在设置中填入 LLM API Key" })}\n\n`,
			);
			return;
		}

		const adapter = openaiCompatibleText(model, { baseURL: baseUrl, apiKey });
		const presetPrompt = resolveEditorPresetPrompt(params.stylePreset);
		const systemPrompt =
			(params.systemHint ||
				"你是一名专业中文写作助手。直接输出改写后的内容，不要加前缀说明，不要输出任何多余的引言。") +
			presetPrompt;

		const stream = await chat({
			adapter,
			systemPrompts: [systemPrompt],
			messages: [{ role: "user", content: params.prompt }],
			stream: true,
		});

		let fullText = "";

		for await (const chunk of stream as AsyncIterable<
			Record<string, unknown>
		>) {
			if (abortController.signal.aborted || res.writableEnded || res.closed) {
				break;
			}
			const delta = (chunk.delta ?? chunk.content ?? "") as string;
			if (delta) {
				fullText += delta;
				res.write(
					`data: ${JSON.stringify({ type: "chunk", delta, fullText })}\n\n`,
				);
			}
		}

		if (!res.writableEnded && !res.closed) {
			res.write(`data: ${JSON.stringify({ type: "done", fullText })}\n\n`);
		}
	} catch (err: unknown) {
		const errMsg = err instanceof Error ? err.message : String(err);
		if (!res.writableEnded && !res.closed) {
			res.write(
				`data: ${JSON.stringify({ type: "error", message: errMsg })}\n\n`,
			);
		}
	} finally {
		if (!res.writableEnded && !res.closed) {
			res.end();
		}
	}
}
