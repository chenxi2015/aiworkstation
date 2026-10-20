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
export function buildCreationSystemHint(stylePreset?: string): string {
	return `你是一名具备敏锐传播网感与扎实深度功底的顶级内容主笔。请根据给定的文章标题、创作要求与素材，直接创作一篇立论鲜明、首版即高质量可用的成品长文。

【内容质感与去 AI 味核心准则（恪守不渝）】：
1. 彻底告别 AI 公关套话：严禁出现“在当今数字化浪潮中”、“具有里程碑意义”、“为行业注入了强劲动力”、“不仅如此…更重要的是…”等空洞套话；
2. 事实与第一手细节下沉：多用具体数字、真实成本/账本对比、版本号、按键/指令路径与真实实测场景，用硬核信息密度说话，少用抽象形容词；
3. 人类呼吸感与生动叙事：开篇用鲜明的情境、反差或认知痛点（Hook）快速切入；长短句交错，语言自然流畅、有思考主见与锋芒，拒绝端水平庸；
4. 结构严密与规范排版：全篇采用标准 Markdown 排版（加粗提炼、引述金句、对比表格）；文章标题已由外层承载，正文第一行直接进入内容，章节标题一律从二级（##）起步；
5. 主题网络原图穿插（直接嵌入）：
   - 若上下文中提供了主题相关的真实网络配图 URL，请直接挑选最贴合段落语义的图片，嵌入到相应段落之间，格式为 \`![图题：简明描述图中内容](图片URL)\`；
   - 绝不凭空臆造 unsplash、pexels 等假图库链接；若无真实网络图，依靠逻辑排版、列表与 Markdown 表格表达，宁缺毋滥；
   - 严禁在图片外添加多余代码围栏；
6. 数据图表原生嵌入（趋势/对比/占比/多维）：
   - 当涉及时间趋势、机构/竞品对比、结构占比或评分数据时，直接嵌入图表代码块（严禁假图），格式如下：
     \`\`\`chart
     {"type":"line","title":"图表标题","categories":["10/1","10/2"],"series":[{"name":"系列名","data":[100,200]}]}
     \`\`\`
   - 图表类型仅限：bar (柱状对比) / line (折线趋势) / area (面积趋势) / pie (饼图占比) / radar (雷达对比)；
   - 围栏内必须为单行或标准 JSON 字符串，严禁在围栏内混入任何解释文字或 JS 注释；
7. 交付纯粹：正文严禁出现任何“好的”、“这是为您撰写的文章”等开场白或结尾闲聊，直接输出文章正文内容。`;
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
	const systemPrompt = buildCreationSystemHint(params.stylePreset) + presetPrompt;
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
