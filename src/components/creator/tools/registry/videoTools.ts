import {
	Camera,
	Combine,
	Download,
	FastForward,
	FileAudio,
	Film,
	Layers,
	Minimize2,
	Scissors,
	Subtitles,
	VolumeX,
} from "lucide-react";
import { AudioExtractor } from "../features/AudioExtractor";
import type { ToolDefinition } from "../types";

/**
 * Registry of video processing tools.
 */
export const VIDEO_TOOLS: ToolDefinition[] = [
	{
		id: "video-extract-audio",
		name: "视频提取音频",
		category: "video",
		icon: FileAudio,
		description:
			"利用本地 FFmpeg 核心秒级提取视频中的口播音轨或伴奏，无音质损耗。",
		engine: "wasm",
		engineLabel: "Web Audio 纯本地秒提",
		status: "completed",
		supportedFormats: ["MP4", "MOV", "MKV", "FLV", "WebM"],
		acceptTypes: "video/*",
		badges: ["极速", "无损"],
		customComponent: AudioExtractor,
		features: [
			"零服务器上传，纯本地浏览器离线快速处理",
			"保留原始音频码率，秒级拷贝无需重新转码",
			"支持导出为 MP3、M4A 或 AAC 格式",
		],
		params: [
			{
				id: "format",
				label: "输出音频格式",
				type: "radio",
				defaultValue: "mp3",
				options: [
					{ label: "MP3 (通用兼容)", value: "mp3" },
					{ label: "M4A (原音质直接拷贝)", value: "m4a" },
					{ label: "WAV (无损母带)", value: "wav" },
				],
			},
			{
				id: "bitrate",
				label: "音频质量/比特率",
				type: "select",
				defaultValue: "320k",
				options: [
					{ label: "320 kbps (超清高保真)", value: "320k" },
					{ label: "192 kbps (标准创作音质)", value: "192k" },
					{ label: "128 kbps (小体积省流量)", value: "128k" },
				],
			},
		],
	},
	{
		id: "video-fast-trim",
		name: "视频无损极速裁剪",
		category: "video",
		icon: Scissors,
		description:
			"截取视频片段，纯流拷贝(Stream Copy)模式毫秒级导出，不重新编码、绝不降画质。",
		engine: "wasm",
		engineLabel: "WASM 流拷贝",
		status: "completed",
		supportedFormats: ["MP4", "MOV", "WebM"],
		acceptTypes: "video/*",
		badges: ["零等待", "无损"],
		features: [
			"精确到帧的片段选点截取",
			"不重编码视频流，导出速度仅受磁盘读写限制",
			"自动去除片段前后的黑帧与杂乱片头",
		],
		params: [
			{
				id: "mode",
				label: "裁剪模式",
				type: "select",
				defaultValue: "fast",
				options: [
					{ label: "极速模式 (关键帧对齐，零损耗秒出)", value: "fast" },
					{ label: "精确模式 (重编首尾帧，毫秒级绝对精准)", value: "precise" },
				],
			},
		],
	},
	{
		id: "video-to-gif",
		name: "视频生成高清 GIF",
		category: "video",
		icon: Film,
		description:
			"将视频高光画面快速转换为动图，内置双通道色彩优化，公众号排版和表情包必备。",
		engine: "wasm",
		engineLabel: "WASM 双通道优化",
		status: "completed",
		supportedFormats: ["MP4", "MOV", "WebM"],
		acceptTypes: "video/*",
		badges: ["高清动图"],
		features: [
			"两趟调色板渲染算法，告别 GIF 噪点与色彩断层",
			"自由配置帧率与分辨率，平衡文件体积与流畅度",
			"公众号与朋友圈无损直接粘贴",
		],
		params: [
			{
				id: "fps",
				label: "帧率 (FPS)",
				type: "select",
				defaultValue: "15",
				options: [
					{ label: "12 FPS (小巧极简)", value: "12" },
					{ label: "15 FPS (推文标准推荐)", value: "15" },
					{ label: "24 FPS (丝滑动态)", value: "24" },
				],
			},
			{
				id: "width",
				label: "动图宽度",
				type: "select",
				defaultValue: "480",
				options: [
					{ label: "360 px (表情包尺寸)", value: "360" },
					{ label: "480 px (微信推文标准)", value: "480" },
					{ label: "720 px (大图原画)", value: "720" },
				],
			},
		],
	},
	{
		id: "video-extract-online",
		name: "一键提取无水印视频",
		category: "video",
		icon: Download,
		description:
			"解析抖音、快手、小红书、B站等主流短视频分享链接，直接下载最高清晰度无水印原片。",
		engine: "native",
		engineLabel: "解析服务",
		status: "developing",
		badges: ["全网支持", "去水印"],
		features: [
			"支持粘贴分享口令或网址自动识别",
			"原画品质下载，支持同时抓取封面图与文案",
			"解析结果支持一键归档到素材库",
		],
		params: [
			{
				id: "downloadCover",
				label: "同步下载视频原始高清封面",
				type: "switch",
				defaultValue: true,
			},
			{
				id: "extractText",
				label: "同步提取发布文案与标签话题",
				type: "switch",
				defaultValue: true,
			},
		],
	},
	{
		id: "video-mute",
		name: "视频消除原声/静音",
		category: "video",
		icon: VolumeX,
		description:
			"一键剔除视频原始杂音、环境底噪或有版权的原声，生成纯净视频文件准备重新配音配乐。",
		engine: "wasm",
		engineLabel: "WASM 本地极速",
		status: "completed",
		supportedFormats: ["MP4", "MOV", "WebM"],
		acceptTypes: "video/*",
		features: [
			"瞬间剥离音频轨，不影响视频画质",
			"方便二次混剪、创作配乐和口播重录",
		],
	},
	{
		id: "video-blur-background",
		name: "横竖屏毛玻璃背景填充",
		category: "video",
		icon: Layers,
		description:
			"横屏 16:9 转竖屏 9:16 或竖屏转横屏，上下/两侧自动高斯模糊垫底，告别违和黑边，短视频二创标配。",
		engine: "native",
		engineLabel: "FFmpeg 滤镜",
		status: "completed",
		supportedFormats: ["MP4", "MOV", "WebM", "MKV"],
		acceptTypes: "video/*",
		badges: ["爆款版式", "智能模糊"],
		features: [
			"自动检测并转换为小红书/抖音竖屏 (9:16) 或 B站横屏 (16:9)",
			"底层高斯模糊 + 居中浮层原比例悬浮，画质清晰",
			"支持调节背景模糊度与主体比例自适应",
		],
		params: [
			{
				id: "targetRatio",
				label: "目标画幅比例",
				type: "select",
				defaultValue: "9:16",
				options: [
					{ label: "抖音 / 小红书竖屏 (9:16)", value: "9:16" },
					{ label: "B站 / 公众号横屏 (16:9)", value: "16:9" },
					{ label: "朋友圈正方形 (1:1)", value: "1:1" },
				],
			},
			{
				id: "blurIntensity",
				label: "背景模糊强度",
				type: "select",
				defaultValue: "25",
				options: [
					{ label: "中度柔和模糊 (推荐)", value: "25" },
					{ label: "强模糊 (突出中间前景)", value: "40" },
					{ label: "轻微模糊", value: "12" },
				],
			},
		],
	},
	{
		id: "video-smart-compress",
		name: "视频智能画质压缩瘦身",
		category: "video",
		icon: Minimize2,
		description:
			"基于 x264 CRF 动态码率算法，在视觉几乎零损耗的前提下将视频体积压缩 60%~80%，并注入 FastStart 秒开标记。",
		engine: "native",
		engineLabel: "FFmpeg 动态CRF",
		status: "completed",
		supportedFormats: ["MP4", "MOV", "WebM", "MKV"],
		acceptTypes: "video/*",
		badges: ["肉眼无损", "秒开优化"],
		features: [
			"自由限制目标体积（专治公众号 20MB/100MB 限制或小红书后台上传限制）",
			"注入 moov atom (+faststart)，移动端与网页秒开播放无需预缓冲",
			"保持原始帧率与分辨率，动态计算复杂画面比特率",
		],
		params: [
			{
				id: "presetMode",
				label: "平台预设模式",
				type: "select",
				defaultValue: "wechat_official",
				options: [
					{
						label: "微信公众号推文标准 (平衡画质与极小体积)",
						value: "wechat_official",
					},
					{
						label: "小红书 / 视频号原画高清 (CRF 21 高保真)",
						value: "social_hd",
					},
					{ label: "极限体积压缩 (压制到 20MB 以内)", value: "extreme" },
				],
			},
			{
				id: "crfValue",
				label: "CRF 画质精细度",
				type: "select",
				defaultValue: "23",
				options: [
					{ label: "CRF 20 (超高画质，大文件)", value: "20" },
					{ label: "CRF 23 (创作黄金平衡点，推荐)", value: "23" },
					{ label: "CRF 26 (高压缩率，适合演示录屏)", value: "26" },
				],
			},
		],
	},
	{
		id: "video-speed-adjust",
		name: "视频平滑变速 (保持原音调)",
		category: "video",
		icon: FastForward,
		description:
			"快速加速或慢放视频，利用声学时间伸缩算法保持人声音调不尖叫、不沉闷。",
		engine: "native",
		engineLabel: "FFmpeg 音画同步",
		status: "completed",
		supportedFormats: ["MP4", "MOV", "WebM"],
		acceptTypes: "video/*",
		badges: ["保真音调", "0.5x~4.0x"],
		features: [
			"0.5x 慢动作至 4.0x 高速快进任意平滑调节",
			"音频 atempo 算法自动补偿，人声保持自然原声调",
			"适合录屏操作演示快进、口播提速、精彩镜头放慢",
		],
		params: [
			{
				id: "speedRate",
				label: "播放速度倍率",
				type: "select",
				defaultValue: "1.5",
				options: [
					{ label: "0.5x 慢动作放慢", value: "0.5" },
					{ label: "1.25x 轻度紧凑", value: "1.25" },
					{ label: "1.5x 口播快节奏 (创作推荐)", value: "1.5" },
					{ label: "2.0x 快速演示", value: "2.0" },
					{ label: "3.0x 极速跳过", value: "3.0" },
				],
			},
		],
	},
	{
		id: "video-keyframe-cover",
		name: "高光抽帧与爆款封面图",
		category: "video",
		icon: Camera,
		description:
			"从视频中提取最高清无损关键帧，自动过滤模糊帧，一键导出小红书/视频号大图封面。",
		engine: "native",
		engineLabel: "FFmpeg 关键帧",
		status: "completed",
		supportedFormats: ["MP4", "MOV", "WebM", "MKV"],
		acceptTypes: "video/*",
		badges: ["超清直出", "封面神器"],
		features: [
			"支持指定精确到秒截取超清 JPG/PNG",
			"提取画面原画分辨率（最高支持 4K 原生画质抽帧）",
			"截取封面支持一键保存至素材库或直接导入创作台排版",
		],
		params: [
			{
				id: "timestamp",
				label: "截取时间点",
				type: "text",
				defaultValue: "00:00:02",
				description: "输入格式 hh:mm:ss 或秒数",
			},
			{
				id: "imageFormat",
				label: "导出格式",
				type: "select",
				defaultValue: "jpg",
				options: [
					{ label: "JPG (体积小，兼容全平台封面)", value: "jpg" },
					{ label: "PNG (无损原画母版)", value: "png" },
				],
			},
		],
	},
	{
		id: "video-burn-subtitles",
		name: "视频硬字幕极速烧录",
		category: "video",
		icon: Subtitles,
		description:
			"将 SRT/ASS 字幕文件永久压制进视频画面底部，内置吸睛黄底黑边与双语样式，直接分发免剪辑。",
		engine: "native",
		engineLabel: "FFmpeg 字幕压制",
		status: "completed",
		supportedFormats: ["MP4", "MOV", "WebM"],
		acceptTypes: "video/*",
		badges: ["创作黄字", "全平台免挂载"],
		features: [
			"与「视频提取文案(ASR)」无缝串联，提取出的字幕可直接在此一键烧录",
			"内置短视频最经典的创作高亮黄字+黑色描边，防背景遮挡",
			"适合海外视频双语字幕压制与口播加字幕",
		],
		params: [
			{
				id: "subtitleStyle",
				label: "字幕视觉风格",
				type: "select",
				defaultValue: "yellow_stroke",
				options: [
					{
						label: "创作高亮黄字 + 黑边强调 (吸睛推荐)",
						value: "yellow_stroke",
					},
					{ label: "经典白色字 + 阴影", value: "white_shadow" },
					{ label: "黑底半透明矩形框 + 白字", value: "box_white" },
				],
			},
			{
				id: "fontSize",
				label: "字幕字体大小",
				type: "select",
				defaultValue: "22",
				options: [
					{ label: "22px (短视频大字，手机清晰可见)", value: "22" },
					{ label: "18px (中等标准字号)", value: "18" },
					{ label: "14px (小字紧凑，适合PC/横屏)", value: "14" },
				],
			},
		],
	},
	{
		id: "video-concat-merge",
		name: "多段视频无损拼接合并",
		category: "video",
		icon: Combine,
		description:
			"将零散的口播切片、片头 LOGO 与正文视频按顺序极速拼成完整长视频，相同格式毫秒级无损合并。",
		engine: "native",
		engineLabel: "FFmpeg 流拼接",
		status: "developing",
		supportedFormats: ["MP4", "MOV", "TS", "WebM"],
		acceptTypes: "video/*",
		badges: ["毫秒级合并", "无缝衔接"],
		features: [
			"规格相同的视频使用 Stream Copy，零损耗秒出",
			"支持片头 + 正文 + 片尾模板快速装配",
		],
		params: [
			{
				id: "mergeMode",
				label: "拼接模式",
				type: "select",
				defaultValue: "copy",
				options: [
					{ label: "极速模式 (流拷贝，相同分辨率与编码零等待)", value: "copy" },
					{ label: "自适应模式 (统一转码对齐分辨率)", value: "transcode" },
				],
			},
		],
	},
];
