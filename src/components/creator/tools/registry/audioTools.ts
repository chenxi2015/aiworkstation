import { Mic, Music, Scissors, Sliders } from "lucide-react";
import type { ToolDefinition } from "../types";

/**
 * Registry of audio processing tools.
 */
export const AUDIO_TOOLS: ToolDefinition[] = [
	{
		id: "audio-stem-separation",
		name: "人声 / 伴奏分离",
		category: "audio",
		icon: Music,
		description:
			"运用 AI 声学模型分离音频中的纯人声对白与背景音乐伴奏轨道，做二创解说与翻唱利器。",
		engine: "ai",
		engineLabel: "AI 声学分离",
		status: "developing",
		supportedFormats: ["MP3", "WAV", "M4A", "FLAC", "MP4"],
		acceptTypes: "audio/*,video/*",
		badges: ["AI 算法", "双轨导出"],
		features: [
			"分离提取干净干音，去除 BGM 干扰便于转写与重新混音",
			"提取纯伴奏音轨，可直接作为剪辑背景音乐",
			"支持同时导出 Vocal 轨与 Instrumental 轨",
		],
		params: [
			{
				id: "model",
				label: "分离质量模式",
				type: "select",
				defaultValue: "vocal_instrumental",
				options: [
					{ label: "人声 + 伴奏 (2轨标准模式)", value: "vocal_instrumental" },
					{
						label: "人声 + 鼓点 + 贝斯 + 其它 (4轨深度模式)",
						value: "full_stems",
					},
				],
			},
		],
	},
	{
		id: "audio-trim",
		name: "音频极速裁剪与拼接",
		category: "audio",
		icon: Scissors,
		description:
			"可视化毫秒级波形图音频修剪，截取热门 BGM 高潮片段或口播录音切片。",
		engine: "wasm",
		engineLabel: "WASM 快速截取",
		status: "developing",
		supportedFormats: ["MP3", "WAV", "M4A", "AAC"],
		acceptTypes: "audio/*",
		features: [
			"波形峰值可视化定位，支持添加淡入淡出曲线",
			"无损裁剪并保留 ID3 元信息",
		],
		params: [
			{
				id: "fadeInOut",
				label: "自动添加 0.5s 头尾平滑淡入淡出",
				type: "switch",
				defaultValue: true,
			},
		],
	},
	{
		id: "audio-denoise",
		name: "录音降噪与人声增强",
		category: "audio",
		icon: Mic,
		description:
			"过滤手机录音的空调底噪、电流麦嗡嗡声与房间混响，让口播原声饱满干净。",
		engine: "browser",
		engineLabel: "智能降噪",
		status: "developing",
		supportedFormats: ["MP3", "WAV", "M4A"],
		acceptTypes: "audio/*",
		features: [
			"谱减法与动态压缩，智能压制平稳噪音",
			"人声频段 EQ 自动提升，提高听感清晰度",
		],
	},
	{
		id: "audio-loudnorm",
		name: "工业级音频响度标准化",
		category: "audio",
		icon: Sliders,
		description:
			"执行国际广播与流媒体 EBU R128 响度统一标准，消灭忽大忽小、爆音与微弱听不清，达到专业节目级听感。",
		engine: "native",
		engineLabel: "EBU R128 标准",
		status: "completed",
		supportedFormats: ["MP3", "WAV", "M4A", "AAC", "FLAC"],
		acceptTypes: "audio/*,video/*",
		badges: ["防爆音", "流媒体标准"],
		features: [
			"智能测算整体响度积分与真峰值 (True Peak)，对齐流媒体发布标准",
			"防止各平台算法二次压缩导致的音质发闷或被系统限制音量",
			"自媒体口播、播客电台、影视二创混剪音频必备",
		],
		params: [
			{
				id: "targetStandard",
				label: "目标平台发布标准",
				type: "select",
				defaultValue: "-14",
				options: [
					{
						label: "抖音 / 快手 / 视频号短视频 (-14 LUFS 饱满通透)",
						value: "-14",
					},
					{ label: "播客电台 / 小红书语音 (-16 LUFS 舒适自然)", value: "-16" },
					{
						label: "B站 / YouTube 影视标准 (-14 LUFS 影院质感)",
						value: "-14_film",
					},
				],
			},
		],
	},
];
