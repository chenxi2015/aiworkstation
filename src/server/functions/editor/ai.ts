import { chat } from "@tanstack/ai";
import { openaiCompatibleText } from "@tanstack/ai-openai/compatible";
import { createServerFn } from "@tanstack/react-start";
import { resolveEditorPresetPrompt } from "../../ai/editorPresets.ts";
import { resolveLlmConfig } from "../../ai/ragContext.ts";

/**
 * Server Function: AI bar 文本生成（非流式，快速返回改写结果）。
 * BubbleMenu 动作条专用；复用 ragContext LLM 配置，不走 agent loop，省 latency。
 */
export const generateAiBarText = createServerFn({ method: "POST" })
	.validator(
		(data: { prompt: string; systemHint?: string; stylePreset?: string }) =>
			data,
	)
	.handler(async ({ data }): Promise<{ text: string }> => {
		const { apiKey, baseUrl, model } = resolveLlmConfig();
		if (!apiKey) {
			return {
				text: "（请先在设置中填入 LLM API Key 才能使用 AI bar 功能）",
			};
		}

		const adapter = openaiCompatibleText(model, { baseURL: baseUrl, apiKey });
		const presetPrompt = resolveEditorPresetPrompt(data.stylePreset);
		const defaultSystemHint =
			"你是一名专业高效的写作与文本处理助手。你的任务是直接对用户选中的文本进行处理并输出最终正文。\n【核心准则】：\n1. 直接输出处理后的正文内容，严禁输出任何思考过程、自我问答、字数统计、前缀标签或客套话。\n2. 严禁添加 Markdown 代码块围栏（如 ``` 或 ~~~）包裹全篇。";
		const systemPrompt = (data.systemHint || defaultSystemHint) + presetPrompt;

		const stream = chat({
			adapter,
			systemPrompts: [systemPrompt],
			messages: [{ role: "user", content: data.prompt }],
			stream: true,
		});

		let result = "";
		for await (const chunk of stream as AsyncIterable<
			Record<string, unknown>
		>) {
			// Skip reasoning/thinking events emitted by models like DeepSeek-R1, QwQ, etc.
			if (chunk.type && chunk.type !== "TEXT_MESSAGE_CONTENT") {
				continue;
			}
			const delta = (chunk.delta ?? chunk.content ?? "") as string;
			if (delta) result += delta;
		}

		// Strip accidental <think>...</think> tags and common conversational preambles
		let cleaned = result.trim();
		cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
		cleaned = cleaned
			.replace(
				/^(好的[，,！!]?|好的，我来为你.*?[：:\n]|根据你的要求[，,].*?[：:\n]|为您润色如下[：:\n]|改写结果如下[：:\n]|缩写结果如下[：:\n]|以下是.*?内容[：:\n])/i,
				"",
			)
			.trim();

		return { text: cleaned };
	});

