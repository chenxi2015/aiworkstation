import { FileText, ShieldAlert, Sparkles, Wand2 } from "lucide-react";
import { ComplianceChecker } from "../features/ComplianceChecker";
import type { ToolDefinition } from "../types";

/**
 * Registry of text, compliance, and copywriting AI tools.
 */
export const TEXT_TOOLS: ToolDefinition[] = [
	{
		id: "text-video-to-script",
		name: "视频提取文案 (ASR)",
		category: "text",
		icon: FileText,
		description:
			"基于语音识别算法，将音视频口播原声一键转写为结构化文案、字幕 SRT 或 Markdown 笔记。",
		engine: "ai",
		engineLabel: "Whisper 识别",
		status: "developing",
		supportedFormats: ["MP4", "MOV", "MP3", "WAV", "M4A"],
		acceptTypes: "video/*,audio/*",
		badges: ["爆款拆解", "字幕导出"],
		features: [
			"自动标点与分段，过滤口癖重复词（如'嗯、啊、然后'）",
			"一键导出带时间轴的 SRT 字幕或纯文本稿",
			"转写文案可直接【一键导入创作台】重组二创",
		],
		params: [
			{
				id: "filterFillers",
				label: "自动清洗口癖与停顿词 (嗯/啊/这个/那个)",
				type: "switch",
				defaultValue: true,
			},
			{
				id: "outputFormat",
				label: "导出格式",
				type: "radio",
				defaultValue: "markdown",
				options: [
					{ label: "Markdown 文稿 (带大纲整理)", value: "markdown" },
					{ label: "SRT 时间轴字幕文件", value: "srt" },
					{ label: "TXT 纯文本段落", value: "txt" },
				],
			},
		],
	},
	{
		id: "text-compliance-check",
		name: "违禁词与广告法排查",
		category: "text",
		icon: ShieldAlert,
		description:
			"全方位扫描新广告法极限词（如“第一、国家级、顶级”）、平台敏感词与违规词，防限流限曝光。",
		engine: "browser",
		engineLabel: "字典树毫秒检测",
		status: "completed",
		badges: ["防限流", "安全合规"],
		customComponent: ComplianceChecker,
		features: [
			"内置万级创作敏感词与广告法红线词汇库",
			"高亮标注风险等级并给出合规润色替换建议",
			"支持一键安全替换与复制净稿",
		],
	},
	{
		id: "text-title-generator",
		name: "爆款标题裂变器",
		category: "text",
		icon: Sparkles,
		description:
			"输入你的选题或内容简述，基于各平台爆款逻辑一键生成 10 个高点击率标题（悬念/情绪/干货）。",
		engine: "ai",
		engineLabel: "AI 大模型",
		status: "developing",
		badges: ["引流提点", "智能裂变"],
		features: [
			"匹配小红书“反常识/保姆级”、抖音“前3秒抓人”、公众号“深度情绪共鸣”标题风格",
			"附带爆款词和话题标签推荐",
		],
		params: [
			{
				id: "platform",
				label: "目标平台风格",
				type: "select",
				defaultValue: "xiaohongshu",
				options: [
					{
						label: "小红书 (痛点共鸣+情绪价值+数字清单)",
						value: "xiaohongshu",
					},
					{ label: "抖音 / 快手 (黄金前3秒+反差悬念)", value: "douyin" },
					{ label: "微信公众号 (深度认知+故事感)", value: "wechat" },
					{ label: "B 站 (梗文化+知识硬核)", value: "bilibili" },
				],
			},
		],
	},
	{
		id: "text-oral-rewrite",
		name: "文案口播化改写",
		category: "text",
		icon: Wand2,
		description:
			"将书面语、公文腔或官方稿件一键转换为自然、通俗、带停顿气口设计的短视频口播文案。",
		engine: "ai",
		engineLabel: "AI 口语重构",
		status: "developing",
		badges: ["短视频口播"],
		features: [
			"消解生僻书面长难句，替换为创作者自然说话的短句",
			"自动设计重音节奏与互动气口（如问答/递进/反问）",
		],
	},
];
