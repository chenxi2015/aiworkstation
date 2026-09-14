import type { Editor, JSONContent } from "@tiptap/core";

export type SplitCanvasMode =
	| "spin" // 二创洗稿
	| "polish" // 文笔润色
	| "expand" // 扩写充实
	| "condense" // 长文精简
	| "oral" // 短视频口播
	| "rewrite" // 自定义改写
	| "manual" // 手动编辑
	| "original"; // 原文基准

export interface PresetModeConfig {
	id: SplitCanvasMode;
	label: string;
	desc: string;
	iconName: string;
	defaultHint: string;
}

export const PRESET_MODES: PresetModeConfig[] = [
	{
		id: "spin",
		label: "二创洗稿",
		desc: "重塑篇章逻辑、去重洗稿、转换叙事视角",
		iconName: "Shuffle",
		defaultHint:
			"你是一名专业自媒体主笔。请对以下正文进行深度二创与结构重塑：打破原有的行文套路与段落句式，更换叙事切入点与观点论证视角，去除冗余套话，保证查重率低且观点锐利生动。【配图保留铁律】：原文中若包含任何 Markdown 图片（形如 `![说明](URL)`）或多媒体，必须完整保留其链接并合理安排在改写后对应段落之间，严禁删除任何图片！直接输出改写后的全篇正文，不要包含任何前缀、问候或说明。",
	},
	{
		id: "polish",
		label: "文笔润色",
		desc: "纠正错别字、增强修辞、优化通顺度与文采",
		iconName: "Sparkles",
		defaultHint:
			"你是一名资深文字编辑。请对以下正文进行精细润色：纠正错别字、病句与标点错误，优化句式连贯性与用词质感，提升段落间的承接与文学张力，保留核心事实与结构。【配图保留铁律】：原文中若包含任何 Markdown 图片（形如 `![说明](URL)`）或多媒体，必须原封不动保留并安插在对应位置，严禁删除任何图片！直接输出润色后的全篇正文，不要包含任何前缀、问候或说明。",
	},
	{
		id: "expand",
		label: "扩写充实",
		desc: "补充论据案例、丰富上下文与细节论证",
		iconName: "Maximize2",
		defaultHint:
			"你是一名深度内容创作者。请对以下正文进行深度扩写与论证充实：为文中的核心观点补充生动的事实案例、行业背景数据或逻辑推演细节，丰富论证层次，使篇幅更为厚实饱满。【配图保留铁律】：原文中若包含任何 Markdown 图片（形如 `![说明](URL)`）或多媒体，必须完整保留其链接并嵌入到对应段落中，严禁删除任何图片！直接输出扩充后的全篇正文，不要包含任何前缀、问候或说明。",
	},
	{
		id: "condense",
		label: "长文精简",
		desc: "提炼核心要点、去除冗余废话、凝练金句",
		iconName: "Minimize2",
		defaultHint:
			"你是一名精炼文案大师。请对以下正文进行结构性精简：大刀阔斧删除冗长套话与重复赘述，提炼凝练的核心论点与金句，使全文脉络清晰紧凑、信息密度极高。【配图保留铁律】：原文中若包含任何 Markdown 图片（形如 `![说明](URL)`）或多媒体，必须完整保留其链接并嵌入到对应段落中，严禁删除任何图片！直接输出精简后的全篇正文，不要包含任何前缀、问候或说明。",
	},
	{
		id: "oral",
		label: "短视频口播",
		desc: "转为口语化、断句短平快、带停顿节奏感",
		iconName: "Mic",
		defaultHint:
			"你是一名爆款短视频口播文案专家。请将以下正文改写为极具网感的口播脚本：使用口语化表达、短句子，带有自然的呼吸停顿与情绪起伏，开门见山抓人眼球，适合对镜头讲述。【配图保留要求】：若原文包含图片（如 `![说明](URL)`），请尽量保留在口播对应镜头/段落旁。直接输出口播正文，不要包含任何前缀、问候或说明。",
	},
];

/**
 * 1. Single Document Version Entity Model
 */
export interface DocumentVersion {
	id: string; // 'v0', 'v1', 'v2', etc.
	label: string; // 'v0: 当前正文 (Base)', 'v1: 深度二创版', 'v2: 手动精修'
	mode: SplitCanvasMode;
	content: string; // Markdown text
	/** 原始 TipTap JSON（如有）：渲染时优先使用，避免 Markdown 往返丢失对齐/颜色/高亮/容器等样式 */
	contentJson?: JSONContent;
	createdAt: number; // Timestamp
	instruction?: string; // Prompt remark that produced this version
	dbVersionId?: number; // Related database document_versions.id
	origin?: "human" | "ai";
	isSavedToDb?: boolean;
}

/**
 * 2. Split Canvas State Machine
 */
export interface SplitCanvasState {
	layout: "single" | "split";
	versions: DocumentVersion[];
	leftVersionId: string;
	rightVersionId: string;
	diffViewMode: "diff" | "clean";
	isAiStreaming: boolean;
	streamingVersionId?: string;
}

export interface SplitCompareViewProps {
	/** Original main editor instance */
	leftEditor: Editor;
	/** Document title */
	docTitle?: string;
	/** Document id for media context */
	docId: number;
	/** Style preset reference for AI */
	stylePreset?: string;
	/** Initial rewrite prompt / instruction */
	instruction?: string;
	/** Initial rewrite action / mode label */
	modeLabel?: string;
	/** Callback when user accepts the revised version */
	onAccept: (
		cleanDocJson: Parameters<Editor["commands"]["setContent"]>[0],
	) => void;
	/** Callback when user rejects/exits split compare */
	onCancel: () => void;
	/** Callback when user saves right canvas as a new standalone document */
	onSaveAsNewDocument?: (title: string, markdown: string) => Promise<void>;
}

export type ViewMode = "diff" | "clean";

export interface DocBlock {
	id: string;
	type: "text" | "image" | "video" | "table" | "other";
	nodeType: string;
	attrs?: Record<string, any>;
	originalText: string;
	revisedText: string;
	aiRevisedText?: string;
	status: "pending" | "streaming" | "done";
	textIndex?: number;
}
