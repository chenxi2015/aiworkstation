import { chat } from "@tanstack/ai";
import { openaiCompatibleText } from "@tanstack/ai-openai/compatible";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { resolveLlmConfig } from "../ai/ragContext.ts";

const metadataOutputSchema = z.object({
	titles: z
		.array(z.string())
		.describe("3个吸引眼球、适合社交分发的优质标题候选"),
	tags: z.array(z.string()).describe("3-6个适合传播的标签话题，不带#号"),
	summary: z.string().describe("1句100字左右的核心亮点提炼"),
});

export interface PublishMetadataInput {
	title: string;
	contentText: string;
	mode?: "title" | "tags" | "both";
	platform?: "wechat" | "redbook" | "zhihu" | "twitter";
}

/** Server Function: 快速提炼/生成发布标题与标签 */
export const generatePublishMetadata = createServerFn({ method: "POST" })
	.validator((data: PublishMetadataInput) => data)
	.handler(
		async ({
			data,
		}): Promise<{
			titles: string[];
			tags: string[];
			summary: string;
			aiGenerated: boolean;
		}> => {
			const { apiKey, baseUrl, model } = resolveLlmConfig();
			if (!apiKey) {
				const fallbackSummary =
					data.platform === "redbook"
						? `✨ 宝子们！今天给大家整理了这篇干货：\n${data.contentText.slice(0, 100).trim()}...\n💡 建议先点赞收藏防走丢哦～`
						: data.contentText.slice(0, 100).trim();
				return {
					titles: [data.title ? data.title.slice(0, 20) : "干货分享"],
					tags: data.platform === "redbook" ? ["小红书干货", "宝藏分享", "日常分享"] : ["知识分享", "文章推荐"],
					summary: fallbackSummary,
					aiGenerated: false,
				};
			}

			const adapter = openaiCompatibleText(model, {
				baseURL: baseUrl,
				apiKey,
			});

			const isRedbook = data.platform === "redbook";

			let systemPrompt = "";
			if (isRedbook) {
				systemPrompt = `你是小红书头部爆款博主与自媒体内容运营总监，深谙小红书推荐算法、爆款笔记网感与受众心理。
请针对【小红书图文笔记】进行专门提炼，要求必须具有浓郁、纯正的「小红书味道」：

1. 【标题（titles）】：
   - 严格限制在 20 个字以内（绝不能超过 20 字，否则小红书无法输入）！
   - 极具小红书网感，善用制造好奇、痛点共鸣、反差感、数字、情绪价值（如“后悔才发现...”、“熬夜整理！新手必看...”、“答应我！一定要看完...”）。

2. 【标签（tags）】：
   - 提取 3-6 个精准且具有热搜潜质的小红书热门话题词（例如：“干货分享”、“提升自己”、“宝藏技巧”等），不要包含 # 符号。

3. 【正文导读 / 开篇（summary）】：
   - 必须是纯正的小红书文风！
   - 开篇第一句要有强吸睛钩子（Hook），迅速抓人眼球，唤醒好奇或共鸣（如“家人们/宝子们谁懂啊”、“真的一整个被惊艳到”、“被问爆了的...”）。
   - 恰到好处地穿插小红书爆款 Emoji（✨、💡、🔥、📌、👀、⚠️ 等），视觉节奏轻快、有呼吸感。
   - 语言真诚接地气、像朋友分享，拒绝生硬枯燥的公文说教感。
   - 概括出文章最硬核、最颠覆认知或最有价值的亮点，篇幅控制在 120-200 字左右，让人忍不住想看后面的图文配图。

严禁胡编乱造，紧密结合原文内容进行提炼。`;
			} else {
				const promptModeDesc =
					data.mode === "title"
						? "重点生成 3 个具有强烈吸引力、富有网感但不低俗标题党的优质标题候选。"
						: data.mode === "tags"
							? "重点提炼 3-6 个精准且具有热度的话题标签。"
							: "同时生成标题、标签与核心摘要。";

				systemPrompt = `你是资深自媒体爆款内容运营专家。请基于用户文章提炼标题与标签。\n${promptModeDesc}\n严禁编造事实，紧扣文章主题。`;
			}

			try {
				const result = (await chat({
					adapter,
					systemPrompts: [systemPrompt],
					messages: [
						{
							role: "user",
							content: `文章现有标题：${data.title}\n目标发布平台：${data.platform || "通用"}\n\n文章正文前段：\n${data.contentText.slice(0, 8000)}`,
						},
					],
					outputSchema: metadataOutputSchema,
				})) as z.infer<typeof metadataOutputSchema>;

				const formattedTitles = (result.titles || [data.title]).map((t) =>
					isRedbook ? t.slice(0, 20).trim() : t.trim(),
				);

				return {
					titles: formattedTitles,
					tags: result.tags || [],
					summary: result.summary || "",
					aiGenerated: true,
				};
			} catch (err) {
				console.warn("[publishAi] generatePublishMetadata failed:", err);
				const fallbackSummary =
					isRedbook
						? `✨ 宝子们！今天给大家整理了这篇干货：\n${data.contentText.slice(0, 100).trim()}...\n💡 建议先点赞收藏防走丢哦～`
						: data.contentText.slice(0, 100).trim();
				return {
					titles: [data.title ? data.title.slice(0, isRedbook ? 20 : 64) : "未命名文章"],
					tags: isRedbook ? ["小红书干货", "日常分享"] : ["知识分享", "热点观察"],
					summary: fallbackSummary,
					aiGenerated: false,
				};
			}
		},
	);
