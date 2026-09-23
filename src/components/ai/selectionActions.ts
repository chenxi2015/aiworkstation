import {
	AlignLeft,
	ArrowDownToLine,
	Languages,
	MessageCircle,
	RefreshCw,
	Scissors,
	ScrollText,
	Shuffle,
	Sparkles,
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
		prompt:
			"请对以下文本进行精细润色优化：\n1. 修正错别字、标点与语病，消除歧义与生硬表达；\n2. 优化词句修辞与行文流畅度，增强语言质感，严格保持原意与事实；\n3. 严禁改变原有段落结构，严禁输出任何解释、分析、前缀或客套话，直接输出润色后的正文。\n\n原文内容：\n{selection}",
	},
	{
		id: "expand",
		label: "扩写",
		description: "丰富内容细节与表达层次",
		icon: ArrowDownToLine,
		prompt:
			"请对以下文本进行扩写与充实：\n1. 基于原文的核心观点与事实脉络自然展开，增加合理论证、生动细节与语境描写；\n2. 严格维持原文的行文基调与风格，严禁凭空捏造无根据的虚假事实；\n3. 直接输出扩写后的正文，严禁包含任何前缀、分析说明或多余客套话。\n\n原文内容：\n{selection}",
	},
	{
		id: "shorten",
		label: "缩写",
		description: "精炼篇幅，剔除冗余词句",
		icon: Scissors,
		prompt:
			"请对以下文本进行高度精炼与缩写：\n1. 剔除一切冗余铺垫、修饰与次要细节，篇幅压缩至原长度的 1/3~1/2 左右；\n2. 完整保留核心论点、关键数据与事实主干，确保语句通顺、逻辑紧凑；\n3. 严禁输出任何思考过程、字数分析、前缀标签或客套话，直接输出缩写后的正文。\n\n原文内容：\n{selection}",
	},
	{
		id: "plain_speak",
		label: "说人话",
		description: "去掉 AI 腔和书面腔，像真人一样直白自然",
		icon: MessageCircle,
		prompt:
			"请将以下文本改写成自然口语化的表达：\n1. 彻底去掉 AI 腔、书面腔和空洞套话，像真人聊天一样直白自然；\n2. 保留核心信息和原意，多用短句，避免长难句与刻意排比；\n3. 直接输出改写后的正文，严禁包含任何说明、前缀或客套话。\n\n原文内容：\n{selection}",
	},
	{
		id: "formal_style",
		label: "写公文",
		description: "严谨规范、措辞端正",
		icon: ScrollText,
		prompt:
			"请将以下文本改写为正式公文：\n1. 措辞严谨规范、语气庄重得体，符合党政机关公文表达习惯；\n2. 结构清晰、条理分明，必要时使用小标题或分条列述；\n3. 保留原文核心事实，直接输出公文正文，不要任何解释或前缀。\n\n原文内容：\n{selection}",
	},
	{
		id: "translate",
		label: "中英翻译",
		description: "智能双向互译",
		icon: Languages,
		prompt:
			"请对以下文本进行高水平双向互译（若原文为中文则翻译为地道英文，若原文为英文则翻译为优雅中文）：\n1. 准确传达原意与语气，确保术语专业、表达地道自然；\n2. 严格按原文段落与格式对应，严禁包含任何翻译说明、前后缀或客套话，直接输出翻译结果。\n\n原文内容：\n{selection}",
	},
	{
		id: "media_style",
		label: "自媒体风格",
		description: "活泼亲切、网感共鸣",
		icon: RefreshCw,
		prompt:
			"请将以下文本改写为自媒体爆款表达风格：\n1. 强化网感与读者代入感，节奏明快、抓人眼球，金句感强；\n2. 保持原文核心事实，直接融入现有文章语境，严禁自拟额外标题或乱加标签；\n3. 直接输出改写后的正文，严禁包含任何分析、前缀或客套话。\n\n原文内容：\n{selection}",
	},
	{
		id: "summarize",
		label: "生成摘要",
		description: "提炼核心要点为 2~3 句话",
		icon: AlignLeft,
		prompt:
			"请为以下文本生成精炼摘要：\n1. 提炼最核心的事实与观点，控制在 2~3 句话内；\n2. 语言凝练准确、逻辑清晰，严禁包含‘摘要如下’等引导词或任何前缀解释，直接输出摘要内容。\n\n原文内容：\n{selection}",
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

/** 自定义指令的 prompt 模板（与创作模块保持一致） */
export function buildCustomInstructionPrompt(instruction: string): string {
	return `请按照以下指令处理选中文本：\n${instruction}\n\n要求：直接输出处理后的文本内容，不要包含任何解释、前缀或客套话。\n\n需要处理的文本：\n{selection}`;
}

export type ActionState = "idle" | "loading" | "result" | "error";
