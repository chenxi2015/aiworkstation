import {
	Crop,
	Download,
	Eraser,
	FileAudio,
	FileText,
	Film,
	Mic,
	Minimize2,
	Music,
	Scissors,
	ShieldAlert,
	Sparkles,
	VolumeX,
	Wand2,
} from "lucide-react";
import { AudioExtractor } from "./features/AudioExtractor";
import { ComplianceChecker } from "./features/ComplianceChecker";
import { ImageCropAndCompress } from "./features/ImageCropAndCompress";
import type { ToolDefinition } from "./types";

/**
 * Registry of all available creator tools categorized by media type.
 * Uses registry/strategy pattern for easy addition of new tools.
 */
export const CREATOR_TOOLS: ToolDefinition[] = [
	// ─── Video Tools ─────────────────────────────────────────────
	{
		id: "video-extract-audio",
		name: "视频提取音频",
		category: "video",
		icon: FileAudio,
		description:
			"利用本地 FFmpeg 核心秒级提取视频中的口播音轨或伴奏，无音质损耗。",
		engine: "wasm",
		engineLabel: "Web Audio 纯本地秒提",
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
					{ label: "192 kbps (标准自媒体音质)", value: "192k" },
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
		supportedFormats: ["MP4", "MOV", "WebM"],
		acceptTypes: "video/*",
		features: [
			"瞬间剥离音频轨，不影响视频画质",
			"方便二次混剪、自媒体配乐和口播重录",
		],
	},

	// ─── Audio Tools ─────────────────────────────────────────────
	{
		id: "audio-stem-separation",
		name: "人声 / 伴奏分离",
		category: "audio",
		icon: Music,
		description:
			"运用 AI 声学模型分离音频中的纯人声对白与背景音乐伴奏轨道，做二创解说与翻唱利器。",
		engine: "ai",
		engineLabel: "AI 声学分离",
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
		supportedFormats: ["MP3", "WAV", "M4A"],
		acceptTypes: "audio/*",
		features: [
			"谱减法与动态压缩，智能压制平稳噪音",
			"人声频段 EQ 自动提升，提高听感清晰度",
		],
	},

	// ─── Image Tools ─────────────────────────────────────────────
	{
		id: "image-watermark-remove",
		name: "图片去水印 / 消除笔",
		category: "image",
		icon: Eraser,
		description:
			"画笔涂抹或框选需要移除的文字、平台水印、LOGO 或杂物，智能修补背景纹理。",
		engine: "ai",
		engineLabel: "AI 智能修补",
		supportedFormats: ["JPG", "PNG", "WebP"],
		acceptTypes: "image/*",
		badges: ["消除杂物", "无痕修复"],
		features: [
			"自由笔刷涂抹与矩形框选两种消除方式",
			"根据周边色彩结构自适应融合重构，无明显修复痕迹",
		],
		params: [
			{
				id: "precision",
				label: "修补精细度",
				type: "select",
				defaultValue: "high",
				options: [
					{ label: "标准速度", value: "standard" },
					{ label: "高保真边缘精修 (推荐)", value: "high" },
				],
			},
		],
	},
	{
		id: "image-matting",
		name: "一键智能抠图",
		category: "image",
		icon: Wand2,
		description:
			"AI 识别人物、商品、宠物等主体，发丝级边缘羽化，自动生成透明背景 PNG。",
		engine: "ai",
		engineLabel: "AI 发丝级抠图",
		supportedFormats: ["JPG", "PNG", "WebP"],
		acceptTypes: "image/*",
		badges: ["透明背景", "做封面必备"],
		features: [
			"无需手动勾勒边缘，上传即自动分离前景主体",
			"支持纯透明背景、自定义纯色背景或加描边阴影",
			"小红书封面人物贴图、电商带货商品立绘快速输出",
		],
		params: [
			{
				id: "bgType",
				label: "抠图后背景处理",
				type: "select",
				defaultValue: "transparent",
				options: [
					{ label: "保持透明背景 (PNG)", value: "transparent" },
					{ label: "纯白背景 (电商规范)", value: "white" },
					{ label: "自媒体高亮黄底 (吸睛封面)", value: "yellow" },
				],
			},
			{
				id: "addStroke",
				label: "人物主体外轮廓添加白边强调",
				type: "switch",
				defaultValue: false,
			},
		],
	},
	{
		id: "image-preset-crop",
		name: "社交平台尺寸裁剪",
		category: "image",
		icon: Crop,
		description:
			"一键按照小红书 3:4、抖音/视频号 9:16、B站/公众号 16:9 或头像 1:1 进行比例规范裁剪。",
		engine: "browser",
		engineLabel: "浏览器极速",
		supportedFormats: ["JPG", "PNG", "WebP"],
		acceptTypes: "image/*",
		customComponent: ImageCropAndCompress,
		features: [
			"内置各大自媒体主流尺寸推荐比例",
			"支持批量保持比例居中裁剪或缩放补白边",
		],
		params: [
			{
				id: "ratio",
				label: "预设平台比例",
				type: "select",
				defaultValue: "3:4",
				options: [
					{ label: "小红书图文 / 封面 (3:4)", value: "3:4" },
					{ label: "抖音 / 视频号竖屏 (9:16)", value: "9:16" },
					{ label: "B站 / 公众号横屏 (16:9)", value: "16:9" },
					{ label: "朋友圈 / 微博正方形 (1:1)", value: "1:1" },
					{ label: "公众号次条大图 (2.35:1)", value: "2.35:1" },
				],
			},
		],
	},
	{
		id: "image-compress",
		name: "图片压缩与格式转换",
		category: "image",
		icon: Minimize2,
		description:
			"支持批量压缩 PNG/JPG/WebP 体积，自由限制输出大小，解决自媒体后台上传过大限制。",
		engine: "browser",
		engineLabel: "纯前端无损压缩",
		supportedFormats: ["JPG", "PNG", "WebP", "AVIF"],
		acceptTypes: "image/*",
		features: [
			"智能色彩量化，体积减少 60%~80% 仍保持肉眼无损清晰",
			"纯本地浏览器运算，批量转换速度极快",
		],
		params: [
			{
				id: "quality",
				label: "压缩画质平衡",
				type: "select",
				defaultValue: "85",
				options: [
					{ label: "高质量 (85% 画质，体积缩减约 50%)", value: "85" },
					{ label: "均衡模式 (75% 画质，体积缩减约 70%)", value: "75" },
					{ label: "极限体积 (60% 画质，适合缩略图)", value: "60" },
				],
			},
		],
	},

	// ─── Text & Copywriting Tools ────────────────────────────────
	{
		id: "text-video-to-script",
		name: "视频提取文案 (ASR)",
		category: "text",
		icon: FileText,
		description:
			"基于语音识别算法，将音视频口播原声一键转写为结构化文案、字幕 SRT 或 Markdown 笔记。",
		engine: "ai",
		engineLabel: "Whisper 识别",
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
		badges: ["防限流", "安全合规"],
		customComponent: ComplianceChecker,
		features: [
			"内置万级自媒体敏感词与广告法红线词汇库",
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
		badges: ["短视频口播"],
		features: [
			"消解生僻书面长难句，替换为创作者自然说话的短句",
			"自动设计重音节奏与互动气口（如问答/递进/反问）",
		],
	},
];

/** Quick lookup map by tool ID */
export const CREATOR_TOOLS_MAP = new Map<string, ToolDefinition>(
	CREATOR_TOOLS.map((tool) => [tool.id, tool]),
);
