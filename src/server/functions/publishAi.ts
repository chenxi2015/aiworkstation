import { chat } from "@tanstack/ai";
import { openaiCompatibleText } from "@tanstack/ai-openai/compatible";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { resolveImageGenConfig, resolveLlmConfig } from "../ai/ragContext.ts";

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

export interface GenerateAiCoversInput {
	title: string;
	contentText: string;
	prompt?: string;
	style?: string;
	aspectRatio?: string;
	configOverrides?: {
		apiKey?: string;
		baseUrl?: string;
		model?: string;
		provider?: string;
	};
}

export interface CoverImageResultItem {
	id: string;
	url: string;
	ratioLabel: string;
	prompt?: string;
}

/** Server Function: 调用生图模型（如豆包/OpenAI/兼容模型）生成多张封面图 */
export const generateAiCoverImages = createServerFn({ method: "POST" })
	.validator((data: GenerateAiCoversInput) => data)
	.handler(
		async ({
			data,
		}): Promise<{
			images: CoverImageResultItem[];
			prompt: string;
			aiGenerated: boolean;
			error?: string;
		}> => {
			const config = resolveImageGenConfig(data.configOverrides);
			if (!config.apiKey) {
				return {
					images: [],
					prompt: "",
					aiGenerated: false,
					error:
						"未配置生图 API Key，请在生图设置中配置（如豆包、SiliconFlow 或 OpenAI）",
				};
			}

			// 1. 生成视觉生图 Prompt
			let visualPrompt = data.prompt?.trim() || "";
			if (!visualPrompt) {
				const styleDesc = data.style?.trim()
					? ` Visual art style requirement: ${data.style}.`
					: "";
				const llm = resolveLlmConfig();
				if (llm.apiKey) {
					try {
						const adapter = openaiCompatibleText(llm.model, {
							baseURL: llm.baseUrl,
							apiKey: llm.apiKey,
						});
						const promptRes = (await chat({
							adapter,
							systemPrompts: [
								`You are a master digital art director and photographer. Generate ONE concise English visual prompt describing an exquisite cover image capturing the core essence of the provided article.${styleDesc} Visual-focused only, no text overlays, no letters, cinematic lighting, modern aesthetic, 8k resolution.`,
							],
							messages: [
								{
									role: "user",
									content: `Title: ${data.title}\n\nContent snippet:\n${data.contentText.slice(0, 3000)}`,
								},
							],
							outputSchema: z.object({
								englishVisualPrompt: z
									.string()
									.describe("English visual prompt for image generation"),
							}),
						})) as { englishVisualPrompt: string };
						visualPrompt = promptRes.englishVisualPrompt || data.title;
					} catch {
						visualPrompt = `High quality cover illustration representing: ${data.title}${styleDesc}, cinematic lighting, elegant aesthetic`;
					}
				} else {
					visualPrompt = `High quality cover illustration about: ${data.title}${styleDesc}, beautiful lighting`;
				}
			}

			// 2. 根据用户选择的长宽比统一尺寸
			const RATIO_MAP: Record<string, { label: string; size: string }> = {
				"16:9": { label: "16:9 横版", size: "1024x576" },
				"3:4": { label: "3:4 竖版", size: "768x1024" },
				"1:1": { label: "1:1 方形", size: "1024x1024" },
				"4:3": { label: "4:3 比例", size: "1024x768" },
			};
			const chosenRatio = RATIO_MAP[data.aspectRatio || "16:9"] || RATIO_MAP["16:9"];
			const targetSize = chosenRatio.size;
			const baseLabel = chosenRatio.label;

			const candidateVariations = [
				{ label: `${baseLabel} · 方案 1`, angle: "close-up dynamic perspective" },
				{ label: `${baseLabel} · 方案 2`, angle: "wide cinematic establishing angle" },
				{ label: `${baseLabel} · 方案 3`, angle: "dramatic artistic lighting and depth" },
				{ label: `${baseLabel} · 方案 4`, angle: "minimalist balanced elegant framing" },
			];

			const generatedImages: CoverImageResultItem[] = [];
			const endpoint = `${config.baseUrl}/images/generations`;
			let lastErrorMessage = "";

			const extractErrorDetail = (status: number, errTxt: string): string => {
				let msg = errTxt;
				try {
					const json = JSON.parse(errTxt);
					if (json?.error?.message) {
						msg = json.error.message;
					} else if (json?.message) {
						msg = json.message;
					}
				} catch {
					// Fallback to raw text if not JSON
				}
				if (msg.includes("ModelNotOpen") || msg.includes("not activated the model")) {
					return `[${status} 未开通模型] 账号尚未在控制台激活模型 ${config.model}。请登录火山方舟/服务商控制台开通该模型服务或创建推理接入点。(${msg})`;
				}
				return `[${status}] ${msg}`;
			};

			const isDoubao =
				config.provider === "doubao" ||
				config.model.includes("doubao") ||
				config.model.includes("seedream") ||
				config.baseUrl.includes("volces.com");

			const buildRequestBody = (
				promptText: string,
				n = 1,
				size = "1024x1024",
			): Record<string, unknown> => {
				if (isDoubao) {
					return {
						model: config.model,
						prompt: promptText,
						response_format: "url",
						size: "2K",
						stream: false,
						watermark: true,
					};
				}
				return {
					model: config.model,
					prompt: promptText,
					n,
					response_format: "url",
					size,
				};
			};

			// 针对支持批量生成的通用模型（如 OpenAI/SiliconFlow），优先尝试一次性批量生成（n: 4）
			let batchSuccess = false;
			if (!isDoubao) {
				try {
					const res = await fetch(endpoint, {
						method: "POST",
						headers: {
							"Content-Type": "application/json",
							Authorization: `Bearer ${config.apiKey}`,
						},
						body: JSON.stringify(buildRequestBody(visualPrompt, 4, targetSize)),
					});

					if (res.ok) {
						const body = (await res.json()) as {
							data?: Array<{ url?: string; b64_json?: string }>;
						};
						if (body.data && body.data.length > 0) {
							body.data.forEach((item, idx) => {
								const url =
									item.url ||
									(item.b64_json ? `data:image/png;base64,${item.b64_json}` : "");
								if (url) {
									generatedImages.push({
										id: `ai-cover-${Date.now()}-${idx}`,
										url,
										ratioLabel: candidateVariations[idx]?.label || `${baseLabel} · 方案 ${idx + 1}`,
										prompt: visualPrompt,
									});
								}
							});
							if (generatedImages.length >= 2) {
								batchSuccess = true;
							}
						}
					} else {
						const errTxt = await res.text();
						lastErrorMessage = extractErrorDetail(res.status, errTxt);
					}
				} catch (err) {
					console.warn("[publishAi] batch image gen error:", err);
				}
			}

			// 若批量生成不支持（如豆包只返回单图）或未成功，并发调用生成不同构图
			if (!batchSuccess) {
				const requests = candidateVariations.map(async (v, idx) => {
					try {
						const res = await fetch(endpoint, {
							method: "POST",
							headers: {
								"Content-Type": "application/json",
								Authorization: `Bearer ${config.apiKey}`,
							},
							body: JSON.stringify(
								buildRequestBody(
									`${visualPrompt}, ${v.angle}`,
									1,
									targetSize,
								),
							),
						});
						if (!res.ok) {
							const errTxt = await res.text();
							const detailed = extractErrorDetail(res.status, errTxt);
							lastErrorMessage = detailed;
							throw new Error(detailed);
						}
						const body = (await res.json()) as {
							data?: Array<{ url?: string; b64_json?: string }>;
						};
						const item = body.data?.[0];
						const url =
							item?.url ||
							(item?.b64_json ? `data:image/png;base64,${item.b64_json}` : "");
						if (url) {
							return {
								id: `ai-cover-${Date.now()}-${idx}`,
								url,
								ratioLabel: v.label,
								prompt: visualPrompt,
							};
						}
						return null;
					} catch (e) {
						console.warn(`[publishAi] image gen request ${idx} failed:`, e);
						return null;
					}
				});

				const results = await Promise.allSettled(requests);
				results.forEach((r) => {
					if (r.status === "fulfilled" && r.value) {
						generatedImages.push(r.value);
					}
				});
			}

			if (generatedImages.length === 0) {
				return {
					images: [],
					prompt: visualPrompt,
					aiGenerated: false,
					error: lastErrorMessage || "AI 生图请求未返回图片，请检查生图模型配置或额度",
				};
			}

			return {
				images: generatedImages,
				prompt: visualPrompt,
				aiGenerated: true,
			};
		},
	);
