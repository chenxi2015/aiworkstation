import type { PublishPlatform, PublishVariants } from "../types";

/**
 * 剪贴板降级通道（docs/creator-publish-plan.md 红线 6）：
 * 对所有平台永久保留，收进各平台卡片「…」菜单，断网/插件离线兜底。
 * 排版规则沿用 Editor-δ 既定适配。
 */

export interface ClipboardContext {
	title: string;
	contentHtml: string;
	contentText: string;
	markdown: string;
}

/** 公众号：富文本 + 纯文本双格式写入，粘贴到微信编辑器保留排版 */
export async function copyWechatFormatted(
	ctx: ClipboardContext,
): Promise<void> {
	const wechatHtml = `
		<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; font-size: 15px; line-height: 1.8; color: #333;">
			<h1 style="font-size: 22px; font-weight: bold; margin-bottom: 16px;">${ctx.title}</h1>
			${ctx.contentHtml}
			<hr style="margin: 24px 0; border: none; border-top: 1px solid #eee;" />
			<p style="font-size: 12px; color: #999; text-align: center;">本文由 AI Workstation 生成分发</p>
		</div>`;
	const blobHtml = new Blob([wechatHtml], { type: "text/html" });
	const blobText = new Blob([ctx.contentText], { type: "text/plain" });
	await navigator.clipboard.write([
		new ClipboardItem({ "text/html": blobHtml, "text/plain": blobText }),
	]);
}

/** 小红书：标题 + 正文 + 话题 */
export async function copyRedbookText(
	variant: PublishVariants["redbook"],
): Promise<void> {
	const topics = variant.topics.map((t) => `#${t}`).join(" ");
	await navigator.clipboard.writeText(
		`${variant.title}\n\n${variant.body}\n\n${topics}`,
	);
}

/** 知乎：Markdown 全文 */
export async function copyZhihuMarkdown(
	variant: PublishVariants["zhihu"],
	markdown: string,
): Promise<void> {
	await navigator.clipboard.writeText(
		`# ${variant.title}\n\n> ${variant.intro}\n\n${markdown}`,
	);
}

/** X / Twitter：短文 */
export async function copyTwitterText(
	variant: PublishVariants["twitter"],
): Promise<void> {
	await navigator.clipboard.writeText(variant.text);
}

export const CLIPBOARD_ACTION_LABEL: Record<PublishPlatform, string> = {
	wechat: "复制适配排版",
	redbook: "复制文案（含话题）",
	zhihu: "复制 Markdown",
	twitter: "复制推文",
};
