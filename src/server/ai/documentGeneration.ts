import { chat } from "@tanstack/ai";
import { openaiCompatibleText } from "@tanstack/ai-openai/compatible";
import { resolveLlmConfig } from "./ragContext.ts";

/**
 * Shared long-form article generation core, extracted from the editor rewrite
 * stream handler so both the interactive SSE pipeline (browser live-typing)
 * and the headless document creation tool (server-side full generation into
 * the documents table) use the same prompting and cleanup rules.
 */

/** Strips accidental LLM meta-chatter or explanation lines */
export function stripMetaChatter(text: string): string {
	let cleaned = text.trim();
	cleaned = cleaned
		.replace(
			/^(好的[，,！!]?|好的，我来为你.*?[：:\n]|根据你的要求[，,].*?[：:\n]|为您润色如下[：:\n]|你未附完整现稿.*?[：:\n]|我先按.*?压缩如下[：:\n])/i,
			"",
		)
		.trim();
	cleaned = cleaned
		.replace(/(\n\s*(如需全篇|若需更多|以上是针对|如有其他需求).*$)/s, "")
		.trim();
	return cleaned;
}

/** System prompt for full-article creation (mirrors the editor creation pipeline) */
export function buildCreationSystemHint(): string {
	return `你是一名顶级资深专栏作家与研究员。请根据用户给出的文章标题与创作要求，直接创作一篇深度长文。
【格式排版铁律】：
1. 采用规范的 Markdown 格式排版（加粗、引用、列表等），结构标题一律使用 ## / ### 等二级及以下标题；
2. 输出形态全篇统一为纯 Markdown：正文任何位置严禁出现 HTML 标签，严禁用 \`\`\` 代码围栏包裹任何排版内容（真正的代码示例除外）；严禁输出任何问候语、开场白、确认语（例如严禁输出“好的”、“我为你撰写如下”等）或尾部闲话；
3. 文章标题已由文档标题承载，正文开头严禁以一级标题（# ...）重复输出文章标题，第一行直接就是正文；
4. 直接输出文章正文内容，保持文字质感饱满、论证严密、文风契合。`;
}

export interface GenerateArticleParams {
	title: string;
	prompt: string;
	stylePreset?: string;
}

/**
 * Generate a complete long-form article in one shot (non-streaming consumer).
 * Returns sanitized Markdown body text.
 */
export async function generateArticleContent(
	params: GenerateArticleParams,
	presetPrompt: string,
): Promise<string> {
	const { apiKey, baseUrl, model } = resolveLlmConfig();
	if (!apiKey) {
		throw new Error("请先在设置中填入 LLM API Key");
	}

	const adapter = openaiCompatibleText(model, { baseURL: baseUrl, apiKey });
	const systemPrompt = buildCreationSystemHint() + presetPrompt;
	const effectivePrompt =
		params.prompt?.trim() ||
		`请围绕主题《${params.title}》展开创作一篇全面深刻、结构严密的专业长文。`;

	const stream = await chat({
		adapter,
		systemPrompts: [systemPrompt],
		messages: [{ role: "user", content: effectivePrompt }],
		stream: true,
	});

	let fullText = "";
	for await (const chunk of stream as AsyncIterable<Record<string, unknown>>) {
		if (chunk.type === "RUN_ERROR") {
			const errMsg =
				(chunk.error as { message?: string })?.message ||
				(typeof chunk.error === "string"
					? chunk.error
					: JSON.stringify(chunk.error ?? "模型生成出错"));
			throw new Error(errMsg);
		}
		if (chunk.type !== "TEXT_MESSAGE_CONTENT") continue;
		const delta = (chunk.delta ?? chunk.content ?? "") as string;
		if (delta) fullText += delta;
	}

	const sanitized = stripMetaChatter(fullText);
	if (!sanitized) {
		throw new Error("模型未返回任何内容，请检查模型配置或重试");
	}
	return sanitized;
}
