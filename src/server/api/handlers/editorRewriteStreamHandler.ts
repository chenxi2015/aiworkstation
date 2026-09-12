import type { IncomingMessage, ServerResponse } from "node:http";
import { readJsonBody, sendJson } from "../utils.ts";

export interface EditorRewriteStreamParams {
	prompt: string;
	systemHint?: string;
	stylePreset?: string;
	articleTitle?: string;
	fullArticleContext?: string;
	paragraphIndex?: number;
	totalParagraphs?: number;
	precedingText?: string;
	followingText?: string;
}

/**
 * Strips accidental LLM meta-chatter or explanation lines
 */
function stripMetaChatter(text: string): string {
	let cleaned = text.trim();
	// Remove leading common AI preambles
	cleaned = cleaned.replace(
		/^(好的[，,！!]?|好的，我来为你.*?[：:\n]|根据你的要求[，,].*?[：:\n]|为您润色如下[：:\n]|你未附完整现稿.*?[：:\n]|我先按.*?压缩如下[：:\n])/i,
		"",
	).trim();
	// Remove trailing meta notes like "如需全篇...请发来"
	cleaned = cleaned.replace(
		/(\n\s*(如需全篇|若需更多|以上是针对|如有其他需求).*$)/s,
		"",
	).trim();
	return cleaned;
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

		let contextSection = "";
		if (
			params.articleTitle ||
			params.totalParagraphs ||
			params.precedingText ||
			params.followingText
		) {
			contextSection = "\n\n【文章全篇脉络与上下文】：";
			if (params.articleTitle) {
				contextSection += `\n- 文章标题：《${params.articleTitle}》`;
			}
			if (params.paragraphIndex && params.totalParagraphs) {
				contextSection += `\n- 进度定位：全篇共 ${params.totalParagraphs} 段，当前正在改写第 ${params.paragraphIndex} 段。请保证与前后文承接自然。`;
			}
			if (params.precedingText) {
				contextSection += `\n- 上一段内容（仅供承上启下参考，严禁重复输出）："""\n${params.precedingText.slice(0, 500)}\n"""`;
			}
			if (params.followingText) {
				contextSection += `\n- 下一段内容（仅供逻辑参考，严禁重复输出）："""\n${params.followingText.slice(0, 500)}\n"""`;
			}
		}

		const strictRules = `\n\n【输出铁律（恪守不渝）】：
1. 你的任务是仅针对【当前段落】进行精细改写/润色/精简。
2. 严禁输出任何问候、开场白、确认语、解释或前后缀说明（例如严禁输出“你未附完整现稿”、“好的”、“我为你优化如下”、“如需全篇请发来”等）！
3. 直接输出改写后的正文段落内容，绝不要添加任何 Markdown 引用块包装或多余闲话！`;

		const baseHint =
			params.systemHint ||
			"你是一名专业中文写作助手。请对给定的一段正文进行精细润色与优化。保持原意与事实，提升修辞、逻辑连贯性与表达质感。";

		const systemPrompt =
			baseHint + presetPrompt + contextSection + strictRules;

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
			const sanitizedText = stripMetaChatter(fullText);
			res.write(
				`data: ${JSON.stringify({ type: "done", fullText: sanitizedText })}\n\n`,
			);
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
