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
				return {
					titles: [data.title || "未命名文章"],
					tags: ["知识分享", "文章推荐"],
					summary: data.contentText.slice(0, 100).trim(),
					aiGenerated: false,
				};
			}

			const adapter = openaiCompatibleText(model, {
				baseURL: baseUrl,
				apiKey,
			});

			const promptModeDesc =
				data.mode === "title"
					? "重点生成 3 个具有强烈吸引力、富有网感但不低俗标题党的优质标题候选。"
					: data.mode === "tags"
						? "重点提炼 3-6 个精准且具有热度的话题标签。"
						: "同时生成标题、标签与摘要。";

			try {
				const result = (await chat({
					adapter,
					systemPrompts: [
						`你是资深自媒体爆款内容运营专家。请基于用户文章提炼标题与标签。\n${promptModeDesc}\n严禁编造事实，紧扣文章主题。`,
					],
					messages: [
						{
							role: "user",
							content: `现有标题：${data.title}\n\n文章正文前段：\n${data.contentText.slice(0, 8000)}`,
						},
					],
					outputSchema: metadataOutputSchema,
				})) as z.infer<typeof metadataOutputSchema>;

				return {
					titles: result.titles || [data.title],
					tags: result.tags || [],
					summary: result.summary || "",
					aiGenerated: true,
				};
			} catch (err) {
				console.warn("[publishAi] generatePublishMetadata failed:", err);
				return {
					titles: [data.title || "未命名文章"],
					tags: ["知识分享", "热点观察"],
					summary: data.contentText.slice(0, 100).trim(),
					aiGenerated: false,
				};
			}
		},
	);
