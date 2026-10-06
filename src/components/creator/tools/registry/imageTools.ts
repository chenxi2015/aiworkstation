import {
	Crop,
	Eraser,
	LayoutGrid,
	Minimize2,
	Wand2,
} from "lucide-react";
import { ImageCropAndCompress } from "../features/ImageCropAndCompress";
import type { ToolDefinition } from "../types";

/**
 * Registry of image processing and formatting tools.
 */
export const IMAGE_TOOLS: ToolDefinition[] = [
	{
		id: "image-watermark-remove",
		name: "图片去水印 / 消除笔",
		category: "image",
		icon: Eraser,
		description:
			"画笔涂抹或框选需要移除的文字、平台水印、LOGO 或杂物，智能修补背景纹理。",
		engine: "ai",
		engineLabel: "AI 智能修补",
		status: "developing",
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
		status: "developing",
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
		status: "completed",
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
		status: "developing",
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
	{
		id: "image-video-strip",
		name: "影视台词长截图拼图",
		category: "image",
		icon: LayoutGrid,
		description:
			"从视频中提取连续的金句台词帧，自动纵向拼合为高清长图，小红书与微博电影解说爆款必备。",
		engine: "native",
		engineLabel: "FFmpeg 拼图",
		status: "completed",
		supportedFormats: ["MP4", "MOV", "WebM"],
		acceptTypes: "video/*",
		badges: ["小红书长图", "台词切片"],
		features: [
			"智能或指定时间轴多帧提取，自动 tile 纵向拼成长图",
			"保持原图高清晰度，解决截多张图手动拼图排版的繁琐流程",
			"支持一键归档至自媒体素材库",
		],
		params: [
			{
				id: "gridRows",
				label: "拼图排版格数",
				type: "select",
				defaultValue: "4",
				options: [
					{ label: "3 格台词长图 (经典短片段)", value: "3" },
					{ label: "4 格剧情递进 (小红书标配)", value: "4" },
					{ label: "6 格电影长长图", value: "6" },
				],
			},
		],
	},
];
