import type {
	DraftPlatform,
	Material,
} from "../../components/creator/types.ts";

/**
 * 平台风格 preset（docs/creator-plan.md 第五节）。
 * α 阶段先用通用模板跑通，β 阶段支持 settings 自定义覆盖 + 文风反哺。
 */
export const PLATFORM_PRESETS: Record<DraftPlatform, string> = {
	xhs: [
		"【小红书】",
		"- emoji 分段，每段 1-3 行，视觉节奏轻快",
		"- 种草/分享口吻，像朋友推荐而不是官方宣传",
		"- 结尾用互动提问引导评论",
		"- 文末附 3-6 个 #话题标签",
	].join("\n"),
	twitter: [
		"【Twitter/X 线程】",
		"- 拆分为多条推文组成的线程，用「1/」「2/」编号",
		"- 每条 ≤280 字符",
		"- 第一条必须是钩子，让人想点开整个线程",
	].join("\n"),
	wechat: [
		"【微信公众号长文】",
		"- 观点先行，开篇直接给结论",
		"- 用小标题分层组织（## 二级标题）",
		"- 段落精炼，适合手机端长阅读",
	].join("\n"),
	script: [
		"【口播短视频脚本】",
		"- 严格四段结构：开场钩子 → 痛点共鸣 → 干货主体 → CTA 行动号召",
		"- 用「【钩子】」「【痛点】」「【干货】」「【CTA】」标注分段",
		"- 口语化短句，适合直接照着念",
	].join("\n"),
};

export function buildDraftsSystemPrompt(platforms: DraftPlatform[]): string {
	const presetBlock = platforms.map((p) => PLATFORM_PRESETS[p]).join("\n\n");
	const platformsJson = platforms.map((p) => `"${p}"`).join(" | ");
	return [
		"你是一名资深的自媒体内容二创专家，擅长把一份素材改写成适配不同平台调性的文案。",
		"",
		"你需要为用户选中的每个平台各产出一条变体，平台风格要求如下：",
		"",
		presetBlock,
		"",
		"要求：",
		"- 忠实于素材事实，不编造素材中没有的数据、人名与结论",
		"- 用户的「创作意图批注」是二创的灵魂，优先围绕它组织表达角度",
		"- 直接产出成品文案，不要解释创作思路，不要复述素材",
		"- 每条变体必须是完整可发布的成稿",
		"",
		"输出格式：只输出一个 json 对象（不要输出任何其他文字、不要用 markdown 代码围栏包裹），结构如下：",
		`{ "variants": [ { "platform": ${platformsJson}, "content": "成稿全文" } ] }`,
		`variants 数组必须恰好包含以下每个平台各一条：${platforms.join(", ")}`,
	].join("\n");
}

export function buildDraftsUserPrompt(
	material: Material,
	platforms: DraftPlatform[],
): string {
	const note = material.note?.trim();
	return [
		`素材标题：${material.title}`,
		"",
		"素材正文：",
		material.content,
		...(material.assets && material.assets.length > 0
			? [
					"",
					`（该素材附带 ${material.assets.length} 个文件资产：${material.assets
						.map((a) => a.filename)
						.join("、")}，文案中可提及但无法引用其内容）`,
				]
			: []),
		"",
		note ? `创作意图批注（重点参考）：${note}` : "（用户未填写创作意图批注）",
		"",
		`请为以下平台各产出一条变体：${platforms.join(", ")}`,
	].join("\n");
}
