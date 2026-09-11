import {
	AlignLeft,
	ArrowDownToLine,
	Languages,
	RefreshCw,
	Scissors,
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

export type ActionState = "idle" | "loading" | "result" | "error";

export interface FloatPos {
	top: number;
	left: number;
}
