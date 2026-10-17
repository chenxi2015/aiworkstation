import { createServerFn } from "@tanstack/react-start";
import type {
	VisualAspectRatio,
	VisualMediaType,
	VisualQuality,
	VisualResolution,
} from "../../types/visualGeneration.ts";
import { ASPECT_RATIO_OPTIONS } from "../../types/visualGeneration.ts";
import {
	resolveImageGenConfig,
	resolveLlmConfig,
} from "../ai/context/config.ts";

export interface GenerateVisualImageInput {
	prompt: string;
	previousPrompt?: string; // Prompt of previous turn in the same session
	mediaType?: VisualMediaType; // "image" | "video"
	aspectRatio?: VisualAspectRatio | string;
	resolution?: VisualResolution | string;
	quality?: VisualQuality;
	duration?: number; // Video duration in seconds
	referenceImage?: string; // Optional base64 or remote URL
	configOverrides?: {
		provider?: string;
		apiKey?: string;
		baseUrl?: string;
		model?: string;
	};
}

export interface GenerateVisualImageResult {
	success: boolean;
	images: Array<{
		id: string;
		url: string;
		mediaType?: VisualMediaType;
		aspectRatio: string;
		resolution: string;
		quality?: string;
		duration?: number;
	}>;
	prompt: string;
	model: string;
	provider: string;
	error?: string;
}

/**
 * Detect whether current user prompt is a contextual modification of the previous image
 * (e.g. "上面的图片不喜欢 再给我优化一下", "换成夜晚", "再生成一个版本", "把人换成猫咪").
 */
function isContextualModification(prompt: string): boolean {
	const p = prompt.toLowerCase();
	const keywords = [
		"上面",
		"上一张",
		"前一张",
		"前一个",
		"这幅",
		"这个",
		"它",
		"重新",
		"优化",
		"修改",
		"调整",
		"微调",
		"再来",
		"再生成",
		"不喜欢",
		"换成",
		"变成",
		"改为",
		"增加",
		"加一个",
		"去掉",
		"删掉",
		"不要",
		"更",
		"版本",
		"风格",
	];
	if (keywords.some((kw) => p.includes(kw))) {
		return true;
	}
	// Very short prompt in an ongoing multi-turn session is usually a refinement directive
	return p.length <= 15;
}

/**
 * Fuse previous turn prompt and current refinement directive into a cohesive prompt.
 */
async function fuseContextPrompt(
	currentPrompt: string,
	previousPrompt?: string,
): Promise<string> {
	if (!previousPrompt || !previousPrompt.trim()) {
		return currentPrompt;
	}

	const trimmedCurrent = currentPrompt.trim();
	const trimmedPrev = previousPrompt.trim();

	// If current prompt doesn't look like an incremental modification, keep as is
	if (!isContextualModification(trimmedCurrent)) {
		return trimmedCurrent;
	}

	// Try fast LLM prompt refinement if LLM key is available
	try {
		const llmConfig = resolveLlmConfig();
		if (llmConfig.apiKey) {
			const res = await fetch(`${llmConfig.baseUrl}/chat/completions`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${llmConfig.apiKey}`,
				},
				body: JSON.stringify({
					model: llmConfig.model,
					messages: [
						{
							role: "system",
							content:
								"你是一个文生图提示词专家。用户正在对上一轮的图片进行连续迭代修改。上一轮画面的完整提示词是已知上下文，用户提出了新的修改或重绘要求。请根据用户的要求，将修改意图精准融入上一轮提示词中，输出一段用于文生图模型的完整高质量中文提示词。注意：直接输出融合后的提示词正文，严禁包含任何前缀、解释、引号或无关说明。",
						},
						{
							role: "user",
							content: `上一轮提示词：${trimmedPrev}\n当前修改要求：${trimmedCurrent}`,
						},
					],
					temperature: 0.6,
					max_tokens: 300,
				}),
				signal: AbortSignal.timeout(4000), // Max 4 seconds timeout
			});

			if (res.ok) {
				const json = await res.json();
				const content = json.choices?.[0]?.message?.content?.trim();
				if (content) {
					return content;
				}
			}
		}
	} catch (err) {
		console.warn("[visualGen] LLM prompt fusion fallback:", err);
	}

	// Heuristic fusion fallback: combine context seamlessly
	return `${trimmedPrev}，画面修改与优化要求：${trimmedCurrent}`;
}

/**
 * Server Function: Generate visual images/videos using user configured models (Doubao, SiliconFlow, OpenAI, Custom).
 */
export const generateVisualImage = createServerFn({ method: "POST" })
	.validator((data: GenerateVisualImageInput) => data)
	.handler(async ({ data }): Promise<GenerateVisualImageResult> => {
		const config = resolveImageGenConfig(data.configOverrides);
		const rawPrompt = data.prompt.trim();
		const mediaType: VisualMediaType = data.mediaType || "image";

		if (!config.apiKey) {
			return {
				success: false,
				images: [],
				prompt: rawPrompt,
				model: config.model,
				provider: config.provider,
				error:
					"未检测到多媒体 API Key，请在系统设置 -> 视觉模型中配置对应的服务商与密钥。",
			};
		}

		if (!rawPrompt) {
			return {
				success: false,
				images: [],
				prompt: "",
				model: config.model,
				provider: config.provider,
				error: "提示词不能为空，请输入要生成的画面描述。",
			};
		}

		// Intelligent context fusion for multi-turn conversations
		const prompt = await fuseContextPrompt(rawPrompt, data.previousPrompt);

		const ratio = data.aspectRatio || (mediaType === "video" ? "16:9" : "auto");
		const resolution =
			data.resolution || (mediaType === "video" ? "720p" : "2K");
		const quality = data.quality || "Medium";
		const duration = data.duration || 5;

		// Map ratio to width x height
		const matchedRatio =
			ASPECT_RATIO_OPTIONS.find((r) => r.id === ratio) ||
			ASPECT_RATIO_OPTIONS[0];
		const pixelSize = matchedRatio.pixelSize;

		const isDoubao =
			config.provider === "doubao" ||
			config.model.includes("doubao") ||
			config.baseUrl.includes("volces.com");

		const isSiliconFlow =
			config.provider === "siliconflow" ||
			config.baseUrl.includes("siliconflow.cn");

		const isDallE =
			config.provider === "openai" ||
			config.model.includes("dall-e") ||
			config.baseUrl.includes("openai.com");

		// Endpoint selection: if video generation
		const endpoint =
			mediaType === "video"
				? `${config.baseUrl}/videos/generations`
				: `${config.baseUrl}/images/generations`;

		let requestBody: Record<string, unknown>;

		if (mediaType === "video") {
			// Video generation payload
			requestBody = {
				model: config.model.includes("video")
					? config.model
					: "doubao-seed-video",
				prompt,
				aspect_ratio: ratio === "auto" ? "16:9" : ratio,
				resolution: resolution,
				duration: duration,
			};
			if (data.referenceImage) {
				requestBody.image = data.referenceImage;
			}
		} else if (isDoubao) {
			requestBody = {
				model: config.model,
				prompt,
				response_format: "url",
				size: resolution === "1K" ? "1024x1024" : "2K",
				watermark: false,
				stream: false,
			};
			if (data.referenceImage) {
				requestBody.image = data.referenceImage;
			}
		} else if (isSiliconFlow) {
			requestBody = {
				model: config.model,
				prompt,
				image_size: pixelSize,
				num_inference_steps:
					quality === "Max"
						? 40
						: quality === "xHigh"
							? 30
							: quality === "High"
								? 25
								: 20,
			};
			if (data.referenceImage) {
				requestBody.image = data.referenceImage;
			}
		} else if (isDallE) {
			let dallESize = "1024x1024";
			if (
				ratio === "9:16" ||
				ratio === "2:3" ||
				ratio === "3:4" ||
				ratio === "4:5"
			) {
				dallESize = "1024x1792";
			} else if (
				ratio === "16:9" ||
				ratio === "3:2" ||
				ratio === "4:3" ||
				ratio === "21:9"
			) {
				dallESize = "1792x1024";
			}
			requestBody = {
				model: config.model,
				prompt,
				n: 1,
				size: dallESize,
				quality:
					quality === "High" || quality === "xHigh" || quality === "Max"
						? "hd"
						: "standard",
				response_format: "url",
			};
		} else {
			requestBody = {
				model: config.model,
				prompt,
				n: 1,
				size: pixelSize,
				response_format: "url",
			};
			if (data.referenceImage) {
				requestBody.image = data.referenceImage;
			}
		}

		try {
			const res = await fetch(endpoint, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${config.apiKey}`,
				},
				body: JSON.stringify(requestBody),
			});

			if (!res.ok) {
				const errText = await res.text();
				let parsedMsg = errText;
				try {
					const json = JSON.parse(errText);
					parsedMsg = json?.error?.message || json?.message || errText;
				} catch {
					// Fallback to raw text
				}
				return {
					success: false,
					images: [],
					prompt,
					model: config.model,
					provider: config.provider,
					error: `[${res.status}] ${parsedMsg}`,
				};
			}

			const json = (await res.json()) as {
				data?: Array<{ url?: string; b64_json?: string; video_url?: string }>;
				video_url?: string;
				url?: string;
			};

			const rawList =
				json.data ||
				(json.video_url || json.url
					? [{ url: json.video_url || json.url }]
					: []);

			const items = rawList
				.map((item, idx) => {
					let mediaUrl = item.url || item.video_url;
					if (!mediaUrl && item.b64_json) {
						mediaUrl = `data:image/png;base64,${item.b64_json}`;
					}
					if (!mediaUrl) return null;
					return {
						id: `visual-${Date.now()}-${idx}`,
						url: mediaUrl,
						mediaType,
						aspectRatio: ratio,
						resolution,
						quality,
						duration: mediaType === "video" ? duration : undefined,
					};
				})
				.filter(Boolean) as Array<{
				id: string;
				url: string;
				mediaType: VisualMediaType;
				aspectRatio: string;
				resolution: string;
				quality?: string;
				duration?: number;
			}>;

			if (items.length === 0) {
				return {
					success: false,
					images: [],
					prompt,
					model: config.model,
					provider: config.provider,
					error: "服务商未返回有效的媒体数据，请检查所选模型或提示词。",
				};
			}

			return {
				success: true,
				images: items,
				prompt,
				model: config.model,
				provider: config.provider,
			};
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			return {
				success: false,
				images: [],
				prompt,
				model: config.model,
				provider: config.provider,
				error: `请求多媒体生成服务异常: ${msg}`,
			};
		}
	});
