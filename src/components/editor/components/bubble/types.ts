import {
	AlignLeft,
	ArrowDownToLine,
	Languages,
	RefreshCw,
	Scissors,
	Shuffle,
	Sparkles,
	Type,
} from "lucide-react";

export interface AiBarAction {
	id: string;
	label: string;
	description?: string;
	icon: typeof Sparkles;
	/** Prompt template; {selection} is replaced with selected text */
	prompt: string;
}

export const DEFAULT_ACTIONS: AiBarAction[] = [
	{
		id: "rewrite",
		label: "二创洗稿",
		description: "打破结构与句式，重构蜕变为全新独立稿件",
		icon: Shuffle,
		prompt:
			"你是一名资深内容二创与去重改写专家。请将以下文本作为事实与素材基础，进行深度二创与洗稿重构：\n1. 彻底打破原有句式结构、段落编排与行文习惯，重构叙事逻辑与切入视角；\n2. 完整保留原文的核心观点、关键数据与客观事实，严禁凭空捏造；\n3. 换用全新的表达风格和生动修辞，最大限度去重，使其成为一篇立意相同但表达截然不同的全新独立稿件；\n4. 直接输出重构后的正文，严禁包含任何说明、前缀、引导词或客套话。\n\n原文内容：\n{selection}",
	},
	{
		id: "polish",
		label: "润色",
		description: "优化语言流畅度与措辞",
		icon: Sparkles,
		prompt: "请润色以下文本，使其更流畅自然，保持原意：\n\n{selection}",
	},
	{
		id: "expand",
		label: "扩写",
		description: "丰富内容细节与表达层次",
		icon: ArrowDownToLine,
		prompt: "请扩写以下文本，充实内容和细节，维持风格一致：\n\n{selection}",
	},
	{
		id: "shorten",
		label: "缩写",
		description: "精炼篇幅，剔除冗余词句",
		icon: Scissors,
		prompt:
			"请将以下文本压缩至原长度的 1/3~1/2，保留核心信息，去掉冗余：\n\n{selection}",
	},
	{
		id: "translate",
		label: "中英翻译",
		description: "智能双向互译",
		icon: Languages,
		prompt:
			"请将以下文本翻译成英文（如原文是英文则翻译成中文）：\n\n{selection}",
	},
	{
		id: "media_style",
		label: "自媒体风格",
		description: "活泼亲切、网感共鸣",
		icon: RefreshCw,
		prompt:
			"请将以下文本改写成适合自媒体传播的风格（轻松活泼、有共鸣感）：\n\n{selection}",
	},
	{
		id: "formal_style",
		label: "公文风格",
		description: "严谨规范、措辞端正",
		icon: Type,
		prompt:
			"请将以下文本改写成正式公文风格（简洁严谨、措辞规范）：\n\n{selection}",
	},
	{
		id: "summarize",
		label: "生成摘要",
		description: "提炼核心要点为 2~3 句话",
		icon: AlignLeft,
		prompt: "请为以下文本生成一段 2~3 句话的精炼摘要：\n\n{selection}",
	},
];

/**
 * Transforms segment template prompt to full-document/stream pipeline instruction
 */
export function getActionInstruction(action: AiBarAction): string {
	return action.prompt
		.replace(/\n*原文内容：\s*\{selection\}/g, "")
		.replace(/\s*\{selection\}/g, "")
		.replace(/^请对以下文本/g, "请对正文")
		.replace(/^请将以下文本/g, "请将正文")
		.replace(/^请润色以下文本/g, "请润色正文")
		.replace(/^请扩写以下文本/g, "请扩写正文")
		.trim();
}

export type ActionState = "idle" | "loading" | "result" | "error";

export interface FloatPos {
	top: number;
	left: number;
}
