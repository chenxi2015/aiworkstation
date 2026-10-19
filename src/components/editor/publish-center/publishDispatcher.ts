import { publishToWechat } from "../../../services/api/publishClient";
import { redbookService } from "../../../services/publish/redbookService";
import type { PublishPlatform } from "../types";
import { copyTwitterText, copyZhihuMarkdown } from "./clipboardChannels";
import type { PlatformPublishConfig, PlatformPublishResult } from "./types";
import { prepareWechatContent } from "./wechatFormatter";

export interface PublishContext {
	documentId: number;
	initialTitle: string;
	contentHtml: string;
	contentText: string;
	markdown: string;
	nowTime: string;
}

/**
 * Strategy interface for individual platform publishing implementations.
 */
type PlatformPublishStrategy = (
	cfg: PlatformPublishConfig,
	context: PublishContext,
) => Promise<PlatformPublishResult>;

/**
 * WeChat Official Account publish strategy (draft or direct publish).
 */
async function publishWechat(
	cfg: PlatformPublishConfig,
	context: PublishContext,
): Promise<PlatformPublishResult> {
	const { documentId, contentHtml, nowTime } = context;
	const selectedCover = cfg.covers[cfg.selectedCoverIndex]?.url || "";

	if (!cfg.accountId) {
		return {
			platform: "wechat",
			status: "error",
			message: "发布失败：未选择公众号账号，请在设置中心绑定",
			time: nowTime,
		};
	}
	if (!selectedCover) {
		return {
			platform: "wechat",
			status: "error",
			message: "发布失败：请先生成或选择一张封面图",
			time: nowTime,
		};
	}

	try {
		const preparedContentHtml = await prepareWechatContent(contentHtml);
		const record = await publishToWechat({
			documentId,
			accountId: cfg.accountId,
			title: cfg.title,
			author: cfg.author.trim() || "AI Workstation",
			digest: cfg.digest.trim(),
			contentHtml: preparedContentHtml,
			coverImageDataUrl: selectedCover,
			tags: cfg.tags,
			publishMode: "draft",
			confirmed: true,
		});

		return {
			platform: "wechat",
			status: "success",
			message: record.platformUrl
				? "已成功正式发布到微信公众号"
				: "已成功推送到微信公众号草稿箱",
			url: record.platformUrl || undefined,
			time: nowTime,
		};
	} catch (err) {
		return {
			platform: "wechat",
			status: "error",
			message: `发布失败：${err instanceof Error ? err.message : String(err)}`,
			time: nowTime,
		};
	}
}

/**
 * Xiaohongshu CDP browser automation publish strategy.
 */
async function publishRedbook(
	cfg: PlatformPublishConfig,
	context: PublishContext,
): Promise<PlatformPublishResult> {
	const { contentText, nowTime } = context;
	const selectedCover = cfg.covers[cfg.selectedCoverIndex]?.url || "";

	try {
		const images: string[] = [];
		const multiIndices = cfg.selectedCoverIndices;
		const resolveUrl = (rawUrl?: string): string => {
			if (!rawUrl) return "";
			if (rawUrl.startsWith("/") && typeof window !== "undefined") {
				return `${window.location.origin}${rawUrl}`;
			}
			return rawUrl;
		};

		if (multiIndices && multiIndices.length > 0) {
			for (const idx of multiIndices.slice(0, 9)) {
				const fullUrl = resolveUrl(cfg.covers[idx]?.url);
				if (fullUrl) images.push(fullUrl);
			}
		} else if (!multiIndices && cfg.covers && cfg.covers.length > 0) {
			for (const c of cfg.covers.slice(0, 9)) {
				const fullUrl = resolveUrl(c.url);
				if (fullUrl) images.push(fullUrl);
			}
		} else if (selectedCover) {
			const fullUrl = resolveUrl(selectedCover);
			if (fullUrl) images.push(fullUrl);
		}

		if (images.length === 0) {
			return {
				platform: "redbook",
				status: "error",
				message: "发布失败：请在【配图与封面】中至少选择 1 张图片发布",
				time: nowTime,
			};
		}

		const noteContent = (cfg.digest.trim() || contentText).slice(0, 1000);

		const res = await redbookService.publish({
			title: cfg.title,
			content: noteContent,
			topics: cfg.tags,
			images,
			mode: cfg.publishMode || "fill_only",
		});

		return {
			platform: "redbook",
			status: res.success ? "success" : "error",
			message: res.message,
			time: nowTime,
		};
	} catch (err) {
		return {
			platform: "redbook",
			status: "error",
			message: `处理失败：${err instanceof Error ? err.message : String(err)}`,
			time: nowTime,
		};
	}
}

/**
 * Zhihu column clipboard export strategy.
 */
async function publishZhihu(
	cfg: PlatformPublishConfig,
	context: PublishContext,
): Promise<PlatformPublishResult> {
	const { contentText, markdown, nowTime } = context;
	try {
		await copyZhihuMarkdown(
			{
				title: cfg.title,
				intro: cfg.digest || contentText.slice(0, 100),
			},
			markdown,
		);
		return {
			platform: "zhihu",
			status: "success",
			message: "知乎专栏 Markdown 内容已复制到剪贴板",
			time: nowTime,
		};
	} catch (err) {
		return {
			platform: "zhihu",
			status: "error",
			message: `处理失败：${err instanceof Error ? err.message : String(err)}`,
			time: nowTime,
		};
	}
}

/**
 * X (Twitter) tweet clipboard export strategy.
 */
async function publishTwitter(
	cfg: PlatformPublishConfig,
	context: PublishContext,
): Promise<PlatformPublishResult> {
	const { contentText, nowTime } = context;
	try {
		const tweetText = `${cfg.title}\n\n${contentText.slice(0, 180)}...\n\n${cfg.tags.map((t) => `#${t}`).join(" ")}`;
		await copyTwitterText({
			text: tweetText.slice(0, 260),
		});
		return {
			platform: "twitter",
			status: "success",
			message: "推文短文案已复制到剪贴板",
			time: nowTime,
		};
	} catch (err) {
		return {
			platform: "twitter",
			status: "error",
			message: `处理失败：${err instanceof Error ? err.message : String(err)}`,
			time: nowTime,
		};
	}
}

/**
 * Registry of platform publish strategies.
 */
const PUBLISH_STRATEGIES: Record<PublishPlatform, PlatformPublishStrategy> = {
	wechat: publishWechat,
	redbook: publishRedbook,
	zhihu: publishZhihu,
	twitter: publishTwitter,
};

/**
 * Dispatches publication to the target platform using Strategy Pattern.
 */
export async function executePlatformPublish(
	platform: PublishPlatform,
	cfg: PlatformPublishConfig,
	context: PublishContext,
): Promise<PlatformPublishResult> {
	const strategy = PUBLISH_STRATEGIES[platform];
	if (!strategy) {
		return {
			platform,
			status: "error",
			message: `未知发布平台: ${platform}`,
			time: context.nowTime,
		};
	}
	return strategy(cfg, context);
}
