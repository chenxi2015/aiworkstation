/**
 * 创作（editor）模块共享类型 —— 数据模型以 docs/editor-plan.md 第五节为准。
 * 服务端仓储与前端组件共用。
 */

/** 文档状态机：editing（编辑中）/ finalized（定稿）/ archived（归档） */
export type DocumentStatus = "editing" | "finalized" | "archived";

export type DocumentVersionOrigin = "human" | "ai";

/** 行文风格 preset key（α 阶段仅存储，β 阶段注入 AI 改写 prompt） */
export type StylePreset =
	| "official"
	| "media"
	| "report"
	| "rewrite"
	| "custom";

export const STYLE_PRESETS: readonly StylePreset[] = [
	"official",
	"media",
	"report",
	"rewrite",
	"custom",
];

export interface EditorStylePreset {
	id: string;
	label: string;
	description: string;
	promptRules: string;
	isBuiltin?: boolean;
}

export const DEFAULT_STYLE_PRESETS: EditorStylePreset[] = [
	{
		id: "official",
		label: "公文风格",
		description: "严谨客观、结构分明、规范得体，符合公文行文惯例",
		promptRules:
			"行文严肃端庄，结构清晰，用词严谨得体，观点鲜明，符合标准公文报告用语规范。",
		isBuiltin: true,
	},
	{
		id: "media",
		label: "自媒体风格",
		description: "生动活泼、节奏轻快、引人入胜，适合平台发布传播",
		promptRules:
			"语言生动亲和，善用金句与段落短句，节奏轻快，观点鲜明，易于在社交媒体阅读传播。",
		isBuiltin: true,
	},
	{
		id: "report",
		label: "报告风格",
		description: "数据驱动、逻辑推导、条例清晰，适合工作汇报与行业分析",
		promptRules:
			"侧重逻辑链条与事实论证，条理清晰，使用分析性与概括性词汇，适合行业分析与工作述职。",
		isBuiltin: true,
	},
	{
		id: "rewrite",
		label: "二创洗稿",
		description: "深度重构句式与叙事逻辑，打破原文套路，彻底蜕变为全新稿件",
		promptRules:
			"你是一名顶尖的内容二创与去重改写专家。请基于原文事实进行深度二创（洗稿重构）：\n1. 彻底打破原文原有的句式架构、段落组织与表达习惯，严禁原句照搬；\n2. 完整提炼并保留原文的核心论点、事实数据与关键干货，不捏造虚假信息；\n3. 换用全新的叙述切入点、更生动的修辞表达和紧凑的承接过渡；\n4. 确保生成后的内容在语言风格、篇章结构上蜕变成为一篇立意相同但表达截然不同的全新独立稿件。",
		isBuiltin: true,
	},
	{
		id: "custom",
		label: "自定义",
		description: "根据用户自行配置的创作提示词进行改写",
		promptRules: "根据用户具体创作意图与要求灵活调整行文语气与内容排版。",
		isBuiltin: true,
	},
];

export const STYLE_PRESET_LABELS: Record<string, string> = {
	official: "公文风格",
	media: "自媒体风格",
	report: "报告风格",
	rewrite: "二创洗稿",
	custom: "自定义",
};

export interface EditorDocument {
	id: number;
	title: string;
	/** TipTap JSON 字符串（富文本单一事实源） */
	content: string;
	/** 纯文本冗余：检索/字数统计用 */
	contentText: string;
	stylePreset?: string;
	status: DocumentStatus;
	createdAt?: string;
	updatedAt?: string;
}

export interface DocumentVersion {
	id: number;
	documentId: number;
	/** TipTap JSON 快照 */
	content: string;
	version: number;
	origin: DocumentVersionOrigin;
	note?: string | null;
	createdAt?: string;
}

/** 卡片导出模式：单张长图 / 小红书 3:4 多图卡片 / 金句卡片 */
export type CardExportMode = "long-image" | "redbook-slices" | "quote";

/** 贴图视觉风格预设 */
export type CardTheme =
	| "minimal-light"
	| "geek-dark"
	| "vintage-paper"
	| "redbook";

export interface CardThemeConfig {
	id: CardTheme;
	name: string;
	background: string;
	textColor: string;
	mutedColor: string;
	accentColor: string;
	cardBorder: string;
	quoteBorder: string;
	headerBg: string;
}

/** 跨平台分发目标平台 */
export type PublishPlatform = "wechat" | "redbook" | "zhihu" | "twitter";

export interface PublishPayload {
	title: string;
	contentHtml: string;
	contentText: string;
	platform: PublishPlatform;
	tags?: string[];
	coverImage?: string;
	images?: string[];
}
