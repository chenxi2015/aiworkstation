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
	// {
	// 	id: "work_report",
	// 	label: "写汇报",
	// 	description: "进展、成果、问题与下一步计划",
	// 	icon: ClipboardList,
	// 	prompt:
	// 		"请将以下文本改写为一份工作汇报：\n1. 按“工作进展—成果与数据—存在问题—下一步计划”的结构组织内容；\n2. 语言简洁务实，以事实和数据说话，避免空泛表述；\n3. 保留原文核心事实，直接输出汇报正文，不要任何解释或前缀。\n\n原文内容：\n{selection}",
	// },
	// {
	// 	id: "formal_report",
	// 	label: "写报告",
	// 	description: "背景、分析、结论与建议",
	// 	icon: FileBarChart,
	// 	prompt:
	// 		"请将以下文本改写为一份结构完整的报告：\n1. 按“背景与目的—现状分析—结论与建议”的逻辑展开，层次分明；\n2. 语言客观严谨、论证有据，关键信息不遗漏；\n3. 保留原文核心事实，直接输出报告正文，不要任何解释或前缀。\n\n原文内容：\n{selection}",
	// },
	// {
	// 	id: "proposal",
	// 	label: "写方案",
	// 	description: "目标、思路、步骤与保障措施",
	// 	icon: NotebookPen,
	// 	prompt:
	// 		"请将以下文本改写为一份可落地的执行方案：\n1. 按“目标—总体思路—执行步骤—资源与排期—风险预案”的结构组织；\n2. 内容具体可执行，责任与节点表述清晰；\n3. 保留原文核心事实，直接输出方案正文，不要任何解释或前缀。\n\n原文内容：\n{selection}",
	// },
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
