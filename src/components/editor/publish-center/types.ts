import type { VisualAspectRatio } from "../../../types/visualGeneration";
import type { PublishPlatform } from "../types";

export interface CoverItem {
	id: string;
	url: string;
	ratioLabel: string;
	prompt?: string;
	isUploaded?: boolean;
}

export interface PlatformPublishConfig {
	enabled: boolean;
	title: string;
	tags: string[];
	author: string;
	digest: string;
	covers: CoverItem[];
	selectedCoverIndex: number;
	accountId?: number | null; // WeChat MP specific account ID
	publishMode?: "auto" | "fill_only"; // Redbook specific publishing mode
}

export interface PlatformPublishResult {
	platform: PublishPlatform;
	status: "idle" | "publishing" | "success" | "error";
	message?: string;
	url?: string;
	time?: string;
}

export interface PlatformMeta {
	id: PublishPlatform;
	name: string;
	badge: string;
	iconPath: string;
	defaultRatio: VisualAspectRatio;
	titleMaxLength: number;
	titlePlaceholder: string;
	digestPlaceholder: string;
	digestLabel: string;
	isDigestSupported: boolean;
}

export const PLATFORM_METAS: PlatformMeta[] = [
	{
		id: "wechat",
		name: "微信公众号",
		badge: "官方 API 直连",
		iconPath: "/media/gongzhonghao.svg",
		defaultRatio: "16:9",
		titleMaxLength: 64,
		titlePlaceholder: "输入公众号图文标题（建议30字以内）...",
		digestPlaceholder: "输入文章核心摘要，将作为卡片导语（建议120字以内）...",
		digestLabel: "文章摘要（公众号图文卡片）",
		isDigestSupported: true,
	},
	{
		id: "redbook",
		name: "小红书",
		badge: "客户端原生直发",
		iconPath: "/media/xiaohongshu.svg",
		defaultRatio: "3:4",
		titleMaxLength: 20,
		titlePlaceholder: "小红书爆款标题（限20字内）...",
		digestPlaceholder: "输入或提炼具有小红书网感的开篇导读文案（将作为笔记正文描述）...",
		digestLabel: "正文导读 / 开篇",
		isDigestSupported: true,
	},
	// Temporarily hidden: Zhihu & Twitter
	// {
	// 	id: "zhihu",
	// 	name: "知乎",
	// 	badge: "专栏发布包",
	// 	iconPath: "/media/zhihu.svg",
	// 	defaultRatio: "16:9",
	// 	titleMaxLength: 80,
	// 	titlePlaceholder: "知乎专栏标题...",
	// 	digestPlaceholder: "输入专栏引言或导语...",
	// 	digestLabel: "专栏导言",
	// 	isDigestSupported: true,
	// },
	// {
	// 	id: "twitter",
	// 	name: "X / Twitter",
	// 	badge: "社交推文包",
	// 	iconPath: "/media/TwitterX.svg",
	// 	defaultRatio: "16:9",
	// 	titleMaxLength: 100,
	// 	titlePlaceholder: "推文主标题或金句...",
	// 	digestPlaceholder: "推文核心观点或段落摘录...",
	// 	digestLabel: "推文要点提炼",
	// 	isDigestSupported: true,
	// },
];

export interface PublishCenterDraft {
	docId: number;
	version: 2;
	activePlatform: PublishPlatform;
	platforms: Record<PublishPlatform, PlatformPublishConfig>;
	updatedAt: number;
	// Legacy fields for backward compatibility
	publishTitle?: string;
	tags?: string[];
	author?: string;
	digest?: string;
	covers?: CoverItem[];
	selectedCoverIndex?: number;
	selectedPlatforms?: Record<PublishPlatform, boolean>;
	accountId?: number | null;
}

