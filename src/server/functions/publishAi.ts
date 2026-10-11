import { chat } from "@tanstack/ai";
import { openaiCompatibleText } from "@tanstack/ai-openai/compatible";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type {
	PublishVariants,
	VariantFocus,
} from "../../components/editor/types.ts";
import { resolveLlmConfig } from "../ai/ragContext.ts";

/**
 * 内容层 AI：一次生成全平台发布变体 + 小红书智能拆卡
 * （docs/creator-publish-plan.md P2，v2 交互「AI 一把梭」）
 *
 * - chat() + outputSchema（zod），provider 差异由适配器透明处理；
 * - 未配置 API Key 或生成失败时返回 aiGenerated=false，客户端走确定性回退，
 *   保证「一键发布」链路永远可用；
 * - focus 用于海报墙「换一版」：只重生成单个平台/卡片结构，省 token 省延迟。
 */

const wechatSchema = z.object({
	title: z.string().describe("公众号标题，≤64字，有信息量、不标题党"),
	author: z.string().describe("署名，无法判断时留空字符串"),
	digest: z.string().describe("摘要，≤120字，概括文章核心价值"),
});

const redbookSchema = z.object({
	title: z.string().describe("小红书标题，≤20字硬限，口语化、带钩子"),
	body: z.string().describe("正文，口语化短句分段，emoji 适度，≤1000字"),
	topics: z.array(z.string()).describe("3-6 个话题标签，不带 # 号"),
});

const zhihuSchema = z.object({
	title: z.string().describe("知乎专栏标题，理性专业"),
	intro: z.string().describe("开篇导语一段，建立问题意识，≤150字"),
});

const twitterSchema = z.object({
	text: z.string().describe("推文正文，≤260字符，可含 1-2 个英文 hashtag"),
});

const cardsSchema = z.object({
	coverTitle: z.string().describe("封面卡大标题，≤16字，点明主题有钩子"),
	coverSummary: z.string().describe("封面副标题一句，≤40字"),
	slides: z
		.array(
			z.object({
				heading: z.string().describe("本页小标题，≤14字"),
				text: z.string().describe("本页正文，80-160字，口语短句"),
			}),
		)
		.describe("正文卡片 3-8 张，每张一个独立要点，按叙事顺序"),
	outro: z.string().describe("封底互动引导语，≤40字"),
});

const fullSchema = z.object({
	wechat: wechatSchema,
	redbook: redbookSchema,
	zhihu: zhihuSchema,
	twitter: twitterSchema,
	cards: cardsSchema,
});

const FOCUS_SCHEMAS: Record<VariantFocus, z.ZodTypeAny> = {
	wechat: z.object({ wechat: wechatSchema }),
	redbook: z.object({ redbook: redbookSchema }),
	zhihu: z.object({ zhihu: zhihuSchema }),
	twitter: z.object({ twitter: twitterSchema }),
	cards: z.object({ cards: cardsSchema }),
};

interface GenerateInput {
	documentId: number;
	title: string;
	contentText: string;
	focus?: VariantFocus;
}

/** Server Function: 生成全平台发布变体（或按 focus 重生成单个部分） */
export const generatePublishVariants = createServerFn({ method: "POST" })
	.validator((data: GenerateInput) => data)
	.handler(
		async ({
			data,
		}): Promise<{
			variants: Partial<PublishVariants>;
			aiGenerated: boolean;
		}> => {
			const { apiKey, baseUrl, model } = resolveLlmConfig();
			if (!apiKey) return { variants: {}, aiGenerated: false };

			const text = data.contentText.trim();
			if (!text) throw new Error("文档内容为空，无法生成发布变体");

			const adapter = openaiCompatibleText(model, {
				baseURL: baseUrl,
				apiKey,
			});
			const focus =
				data.focus && data.focus in FOCUS_SCHEMAS ? data.focus : undefined;
			const schema = focus ? FOCUS_SCHEMAS[focus] : fullSchema;
			const focusInstruction = focus
				? `\n5. 本次只需输出 ${focus} 部分（「换一版」场景）：与最常规的写法拉开差异，换一个切入角度或表达风格，避免套路化。`
				: "";
			const systemPrompt = `你是顶尖的中文自媒体分发专家，深谙公众号、小红书、知乎、X（Twitter）各平台的内容调性与传播规律。基于用户提供的文章生成各平台发布变体，并把文章拆成小红书图文卡片叙事结构。
【硬性要求】
1. 严格依据原文事实，不捏造信息；
2. 字数硬限必须遵守：小红书标题≤20字、公众号摘要≤120字、推文≤260字符；
3. 内容主体只有一份，各平台差异只体现在包装层（标题/摘要/话题/语气）；
4. 卡片拆分要有叙事节奏：每页一个要点，封面有钩子，封底有互动引导。${focusInstruction}`;

			try {
				const result = await chat({
					adapter,
					systemPrompts: [systemPrompt],
					messages: [
						{
							role: "user",
							content: `文章标题：${data.title || "未命名"}\n\n正文：\n${text.slice(0, 12000)}`,
						},
					],
					outputSchema: schema,
				});
				return {
					variants: result as Partial<PublishVariants>,
					aiGenerated: true,
				};
			} catch (err) {
				console.warn("[publishAi] generatePublishVariants failed:", err);
				return { variants: {}, aiGenerated: false };
			}
		},
	);
