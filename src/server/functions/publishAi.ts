import { chat } from "@tanstack/ai";
import { openaiCompatibleText } from "@tanstack/ai-openai/compatible";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { resolveLlmConfig } from "../ai/ragContext.ts";
import { loadSkillContextBundle } from "../services/skills/contextBundle.ts";

const metadataOutputSchema = z.object({
	titles: z
		.array(z.string())
		.describe("3个吸引眼球、适合社交分发的优质标题候选"),
	tags: z.array(z.string()).describe("3-6个适合传播的标签话题，不带#号"),
	summary: z.string().describe("核心亮点提炼或平台正文（小红书需网感文风，不超过1000字）"),
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
						? `✨ 宝子们！今天给大家整理了这篇干货：\n\n${data.contentText.slice(0, 800).trim()}...\n\n💡 建议先点赞收藏防走丢哦～`
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
   - 恰到好处地穿插小红书爆款 Emoji（✨、💡、🔥、📌、👀、⚠️ 等），排版有呼吸感，层次清晰。
   - 语言真诚接地气、像朋友分享，拒绝生硬枯燥的公文说教感。
   - 深入提炼文章最有价值的核心干货与亮点，条理分明，篇幅严格控制在 1000 字符以内（符合小红书后台正文字数限制）。

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

				const formattedSummary = isRedbook
					? (result.summary || "").slice(0, 1000).trim()
					: (result.summary || "").trim();

				return {
					titles: formattedTitles,
					tags: result.tags || [],
					summary: formattedSummary,
					aiGenerated: true,
				};
			} catch (err) {
				console.warn("[publishAi] generatePublishMetadata failed:", err);
				const fallbackSummary =
					isRedbook
						? `✨ 宝子们！今天给大家整理了这篇干货：\n\n${data.contentText.slice(0, 800).trim()}...\n\n💡 建议先点赞收藏防走丢哦～`
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

const storyboardOutputSchema = z.object({
	themeColor: z.string().describe("整套卡片的主题色系搭配，如克莱因蓝与冷灰、黑金极客、复古暖纸等"),
	styleTone: z.string().describe("视觉基调简短描述，如瑞士网格排版风、电子杂志风、3D极简空间等"),
	cards: z
		.array(
			z.object({
				pageIndex: z.number().describe("卡片序号，从 1 开始"),
				role: z.enum([
					"hook_cover",
					"pain_point",
					"actionable",
					"summary_cta",
					"general",
				]),
				roleLabel: z
					.string()
					.describe("卡片角色说明，如 P1 封面卡、P2 痛点共鸣、P3 干货实操、P4 总结行动"),
				headline: z.string().describe("卡片核心大标题（精炼醒目）"),
				subHeadline: z.string().optional().describe("卡片副标题或亮点抓手"),
				bulletPoints: z
					.array(z.string())
					.optional()
					.describe("要点拆解或金句清单（限2-4项）"),
				prompt: z
					.string()
					.describe(
						"针对文生图模型优化的高质量具体画面提示词（构图、主体、色彩、光影、艺术字体排版引导）",
					),
			}),
		)
		.describe("规划的多张视觉卡片列表"),
});

export interface StoryboardCardPlan {
	pageIndex: number;
	role: "hook_cover" | "pain_point" | "actionable" | "summary_cta" | "general";
	roleLabel: string;
	headline: string;
	subHeadline?: string;
	bulletPoints?: string[];
	prompt: string;
}

export interface GenerateStoryboardInput {
	title: string;
	contentText: string;
	digest?: string;
	platform?: "wechat" | "redbook" | "general" | "zhihu" | "twitter";
	count?: number; // Default: wechat = 1, redbook = 4
	customStylePrompt?: string; // User custom prompt or skills directive
	skillName?: string;
	skillDirPath?: string; // Absolute path to local skill directory
}

export interface GenerateStoryboardResult {
	themeColor: string;
	styleTone: string;
	cards: StoryboardCardPlan[];
	aiGenerated: boolean;
}

/**
 * Server Function: Generate visual storyboard plans for multi-card carousel (Redbook)
 * or single punchy cover (WeChat), decoupled from rigid prompts.
 */
export const generateVisualStoryboardPlan = createServerFn({ method: "POST" })
	.validator((data: GenerateStoryboardInput) => data)
	.handler(async ({ data }): Promise<GenerateStoryboardResult> => {
		const { apiKey, baseUrl, model } = resolveLlmConfig();
		const isRedbook = data.platform === "redbook";
		const isUnconstrained = !data.count || data.count <= 0;

		// Determine fallback count for offline or fallback generation
		let fallbackCount = 1;
		if (isUnconstrained) {
			if (isRedbook) {
				const len = data.contentText.length;
				fallbackCount = len > 1500 ? 6 : len > 800 ? 5 : len > 300 ? 4 : 3;
			} else {
				fallbackCount = 1;
			}
		} else {
			fallbackCount = data.count!;
		}

		const cleanTitle = data.title.replace(/[《》"']/g, "").trim() || "精选文章";

		// Resolve and load skill context if a skill identifier or path is provided
		let skillContextPrompt = "";
		let skillNameLabel = data.skillName;
		const targetSkillIdentifier = data.skillDirPath || data.skillName;
		if (targetSkillIdentifier) {
			try {
				const bundle = await loadSkillContextBundle(
					targetSkillIdentifier,
					`${cleanTitle} ${data.customStylePrompt || ""}`,
				);
				if (bundle) {
					skillNameLabel = bundle.skillName;
					let skillBlock = `### 【已激活专属视觉/图文技能: ${bundle.skillName}】\n本地目录: ${bundle.dirPath}\n\n#### 核心视觉设计与分镜规范 (SKILL.md):\n${bundle.skillMd}`;
					if (bundle.inlinedFiles.length > 0) {
						const inlinedSections = bundle.inlinedFiles
							.map((f) => `\n--- 关联设计参考文档: [${f.path}] ---\n${f.content}`)
							.join("\n");
						skillBlock += `\n\n#### 配套设计与提示词模板:\n${inlinedSections}`;
					}
					skillContextPrompt = `\n\n- 【用户指定激活的本地视觉设计 Skill 规范（最高优先级遵循）】:\n${skillBlock}\n\n★ 核心执行要求：你必须完全吸收上述技能中的视觉角色定位、版式结构、文字层级（Headline/SubHeadline）、配色原则以及文生图 Prompt 规范，以此来规划本次全套分镜头与每张卡片的具体生图提示词！`;
				}
			} catch (err) {
				console.warn("[publishAi] Failed to load skill context bundle:", err);
			}
		}

		// Fallback when LLM is offline or no API key is available
		const createFallbackPlan = (): GenerateStoryboardResult => {
			const fallbackCards: StoryboardCardPlan[] = [];
			if (fallbackCount === 1) {
				fallbackCards.push({
					pageIndex: 1,
					role: "hook_cover",
					roleLabel: "封面",
					headline: cleanTitle.slice(0, 16),
					subHeadline: "深度拆解 · 实操指南",
					prompt: `自媒体高质感封面设计，商业海报级排版，画面视觉中心突出创意艺术字体设计“${cleanTitle.slice(0, 12)}”，现代立体美术字，质感背景融合微光与高级空间感，专业设计总监水准。`,
				});
			} else {
				const roles: Array<{
					role: StoryboardCardPlan["role"];
					label: string;
					headline: string;
					sub: string;
					promptDesc: string;
				}> = [
					{
						role: "hook_cover",
						label: "P1 封面卡",
						headline: cleanTitle.slice(0, 14),
						sub: "熬夜整理 · 干货合集",
						promptDesc: "小红书爆款封面，视觉中心立体艺术大字，对比鲜明，吸睛钩子，极简质感空间与悬浮光影。",
					},
					{
						role: "pain_point",
						label: "P2 痛点共鸣",
						headline: "为什么这很重要？",
						sub: "核心洞察与认知破局",
						promptDesc: "极简现代排版卡片，大字号金句视觉重心，优雅留白，克莱因蓝或暖橘强调色，信息层级清晰。",
					},
					{
						role: "actionable",
						label: "P3 干货实操",
						headline: "核心步骤与落地清单",
						sub: "1-2-3 关键实操指南",
						promptDesc: "瑞士国际主义网格排版，结构化清单排版，几何线条与数据卡片质感，高信息密度与极致美感。",
					},
					{
						role: "summary_cta",
						label: "P4 总结行动",
						headline: "一页速览备忘",
						sub: "建议点赞收藏防走丢",
						promptDesc: "收官总结卡片，整洁的备忘清单边框，品牌质感图章，引导点赞收藏与关注。",
					},
				];

				for (let i = 0; i < fallbackCount; i++) {
					const tmpl = roles[i % roles.length];
					fallbackCards.push({
						pageIndex: i + 1,
						role: tmpl.role,
						roleLabel: `P${i + 1} ${tmpl.label.split(" ")[1] || "卡片"}`,
						headline: tmpl.headline,
						subHeadline: tmpl.sub,
						bulletPoints: ["核心要点清晰拆解", "高效实操避坑指南"],
						prompt: `${tmpl.promptDesc} 融入“${cleanTitle.slice(0, 10)}”主题元素，现代高级配色，全套视觉风格一致。`,
					});
				}
			}

			return {
				themeColor: "现代克莱因蓝与极简冷灰",
				styleTone: skillNameLabel
					? `${skillNameLabel} · 设计风格`
					: (data.customStylePrompt || "现代自媒体高质感卡片"),
				cards: fallbackCards,
				aiGenerated: false,
			};
		};

		if (!apiKey) {
			return createFallbackPlan();
		}

		const adapter = openaiCompatibleText(model, {
			baseURL: baseUrl,
			apiKey,
		});

		const styleGuidance = data.customStylePrompt?.trim()
			? `用户指定的风格与技能要求：${data.customStylePrompt.trim()}`
			: "用户未硬性指定风格，请根据文章内容气质提供审美在线的高质感推荐（如瑞士网格风、电子杂志风、3D立体空间感或极客黑金等，拒绝满屏低质花哨乱贴）。";

		const countInstruction = isUnconstrained
			? "【张数规划】：用户选择了【不限制张数】，请你深入通读文章正文，根据文章的信息密度、段落逻辑与要点层次，自主决定最合适的分镜张数（通常为 3~7 张，短篇 3~4 张，深度干货 5~6 张），让 AI 完全根据内容自由裁决，输出最契合本篇内容的完整分镜。"
			: `【张数规划】：用户指定了生成 ${data.count} 张图，请严格输出刚好 ${data.count} 张卡片的完整分镜方案。`;

		const skillRule = skillContextPrompt
			? "★ 【已激活技能为第一准则】：用户指定了专属视觉设计技能，其在版式构图、字体排版、配色方案和提示词生成上的指导具有最高优先级，请严格贯彻该技能的设计规范。"
			: "";

		const systemPrompt = `你是一位顶级自媒体视觉设计总监与故事线分镜专家。
你的任务是根据用户的文章内容，规划精准契合目标平台的视觉配图分镜头方案。
${skillContextPrompt}

分镜头规划规范：
1. 【微信公众号】：单张封面（16:9），视觉重心明确，艺术字标题有力，背景有高级空间意境与适当留白，适配订阅号小图与会话大卡片。
2. 【小红书图文组合（重点）】：3:4 竖版多图故事线（通常 3 张及以上），层层递进：
   - P1 封面卡：大字爆款标题（痛点/好奇/反差）+ 视觉主锚点，争取 0.5 秒滑动的停留率；
   - P2 痛点共鸣/核心观点卡：直击读者痛点或金句大字化，承接阅读动机；
   - P3 干货实操/清单卡：结构化步骤、对比图表或清单要点（激发收藏）；
   - P4 总结行动卡：全篇速览备忘 + 点赞收藏引导与品牌印记。
3. 【全套视觉一致性】：确保全套卡片的主题色系（themeColor）、设计语言与光影质感高度协调，严禁拼凑割裂感。
4. 【风格自由度】：${styleGuidance}
5. 【提示词质量】：每张卡片的 prompt 必须针对文生图模型（如 Midjourney/Flux/SD）专门构想，描述构图比例、画面主体、排版字样（Headline）、材质、色彩氛围与景深。
6. ${countInstruction}
${skillRule ? `7. ${skillRule}` : ""}`;

		try {
			const result = (await chat({
				adapter,
				systemPrompts: [systemPrompt],
				messages: [
					{
						role: "user",
						content: `文章标题：${cleanTitle}
目标平台：${data.platform || "通用自媒体"}
规划张数：${isUnconstrained ? "不限制（由 AI 根据文章篇幅与结构自主决定最适张数）" : `${data.count} 张`}
文章摘要：${data.digest || "暂无摘要"}
${skillNameLabel ? `关联 Skill：${skillNameLabel}` : ""}
${data.customStylePrompt ? `自定义风格偏好：${data.customStylePrompt}` : ""}

文章正文片段：
${data.contentText.slice(0, 6000)}`,
					},
				],
				outputSchema: storyboardOutputSchema,
			})) as z.infer<typeof storyboardOutputSchema>;

			if (result.cards && result.cards.length > 0) {
				const finalCards = isUnconstrained
					? result.cards
					: result.cards.slice(0, data.count!);

				return {
					themeColor: result.themeColor || "现代高质感色系",
					styleTone: result.styleTone || "自媒体视觉套图",
					cards: finalCards.map((c, idx) => ({
						pageIndex: idx + 1,
						role: c.role,
						roleLabel: c.roleLabel || `P${idx + 1} 卡片`,
						headline: c.headline,
						subHeadline: c.subHeadline,
						bulletPoints: c.bulletPoints,
						prompt: c.prompt,
					})),
					aiGenerated: true,
				};
			}

			return createFallbackPlan();
		} catch (err) {
			console.warn("[publishAi] generateVisualStoryboardPlan failed:", err);
			return createFallbackPlan();
		}
	});
