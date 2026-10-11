import { sliceIntoRedbookCards } from "../cardExporter";
import type { PublishVariants, RedbookCardPlan } from "../types";

/**
 * 确定性回退（docs/creator-publish-plan.md P2）：
 * 未配置 LLM 或 AI 生成失败时，保证「一键发布」链路仍可用。
 * 切片复用 Editor-δ 机械规则，文案按平台字数硬限截断。
 */

/** 海报墙统一的卡片渲染模型（AI 文本卡 / 机械 HTML 卡归一） */
export interface SlideModel {
	type: "cover" | "body" | "outro";
	pageIndicator: string;
	/** cover / outro 用 */
	title?: string;
	summary?: string;
	/** body：AI 文本卡 */
	heading?: string;
	text?: string;
	/** body：机械回退 HTML 卡 */
	html?: string;
}

function pad2(n: number): string {
	return String(n).padStart(2, "0");
}

/** AI 拆卡结构 → 渲染模型 */
export function slidesFromAiPlan(plan: RedbookCardPlan): SlideModel[] {
	const total = plan.slides.length + 2;
	const slides: SlideModel[] = [
		{
			type: "cover",
			title: plan.coverTitle,
			summary: plan.coverSummary,
			pageIndicator: `01 / ${pad2(total)}`,
		},
	];
	plan.slides.forEach((slide, idx) => {
		slides.push({
			type: "body",
			heading: slide.heading,
			text: slide.text,
			pageIndicator: `${pad2(idx + 2)} / ${pad2(total)}`,
		});
	});
	slides.push({
		type: "outro",
		title: "欢迎交流探讨",
		summary: plan.outro,
		pageIndicator: `${pad2(total)} / ${pad2(total)}`,
	});
	return slides;
}

/** 机械切片（Editor-δ 规则）→ 渲染模型 */
export function slidesFromMechanical(
	title: string,
	contentHtml: string,
	author: string,
): SlideModel[] {
	return sliceIntoRedbookCards(title, contentHtml, author).map((card) => ({
		type: card.type,
		title: card.title,
		summary: card.summary,
		html: card.type === "body" ? card.contentHtml : undefined,
		pageIndicator: card.pageIndicator,
	}));
}

/** 全平台变体的确定性回退（AI 不可用时） */
export function buildFallbackVariants(
	title: string,
	contentText: string,
): Omit<PublishVariants, "cards"> {
	const cleanText = contentText.replace(/\s+/g, " ").trim();
	const safeTitle = title.trim() || "精选文章";
	return {
		wechat: {
			title: safeTitle,
			author: "",
			digest: cleanText.slice(0, 100),
		},
		redbook: {
			title: safeTitle.slice(0, 20),
			body: `${cleanText.slice(0, 800)}\n\n欢迎评论区交流～`,
			topics: ["干货分享", "AI生产力", "自我提升", "内容创作"],
		},
		zhihu: {
			title: safeTitle,
			intro: cleanText.slice(0, 120),
		},
		twitter: {
			text: `《${safeTitle}》\n\n${cleanText.slice(0, 180)}...\n\n#AIWorkstation #Productivity`,
		},
	};
}
