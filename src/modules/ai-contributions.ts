import type { ChatContextType } from "../types/chatContext.ts";

/**
 * AI Module Contributions — 侧边 AI 面板的「模块能力包」注册表。
 *
 * 与 modules/registry.ts 同构：顶部导航决定「用户在哪个模块」，
 * 本注册表决定「AI 在该模块下以什么视角、什么建议、什么上下文类型工作」。
 * 侧边栏本身是通用宿主（输入/消息流/时间轴/上下文条），
 * 切换导航时只换这里注入的差异；知识库检索工具永远全局可用。
 *
 * 纯 TS 无 React 依赖，服务端（ragContext system prompt 组装）与客户端共用。
 */
export interface AiModuleContribution {
	/** 对应 modules/registry.ts 的模块 code */
	code: string;
	/**
	 * 完整人格块：角色/目标/红线（替代单行 hint，服务端组装 system prompt）。
	 * 优先于 systemPromptHint；兼容字段 systemPromptHint 仍保留作 alias。
	 */
	persona?: string;
	/** @deprecated 使用 persona 字段，此字段保留作向后兼容 alias */
	systemPromptHint: string;
	/** 该模块可用的 Agent Tool 白名单（能力层全局注册，此处只做筛选） */
	tools?: string[];
	/** 聊天空态的快捷提问建议（客户端使用） */
	promptSuggestions: string[];
	/** 该模块下允许附加到对话的上下文类型 */
	contextItemTypes: ChatContextType[];
	/** 模块级快捷动作（如「把当前文档裂变为小红书文案」） */
	entryActions?: Array<{ label: string; prompt: string }>;
}

/** 全局兜底贡献包：未匹配模块或非注册路由时使用 */
export const GLOBAL_AI_CONTRIBUTION: AiModuleContribution = {
	code: "global",
	systemPromptHint:
		"用户未聚焦于特定模块。以全局知识库视角工作：检索、治理与问答均面向全库资产。",
	promptSuggestions: [
		"检索我收藏的所有关于 AI、自动化与大模型相关的开源项目与工具",
		"盘点我最近收藏的前端开发框架、组件库与实用资源",
		"分析我的全库书签资产，给出最有价值的核心工具与使用场景",
		"帮我整理未分类的收藏，给出归类建议",
	],
	contextItemTypes: ["bookmark", "folder", "tag", "image", "file"],
};

export const AI_MODULE_CONTRIBUTIONS: Record<string, AiModuleContribution> = {
	workbench: {
		code: "workbench",
		systemPromptHint:
			"用户正在「工作台」首页。偏向宏观视角：资产盘点、趋势洞察、待整理建议与快捷入口推荐。",
		promptSuggestions: [
			"给我一份当前知识库资产的宏观盘点与健康度报告",
			"未分类缓冲池里有哪些值得优先整理的内容？",
			"最近新增的收藏呈现出什么兴趣趋势？",
		],
		contextItemTypes: ["bookmark", "folder", "tag", "image", "file"],
	},
	bookmarks: {
		code: "bookmarks",
		systemPromptHint:
			"用户正在「书签」模块。偏向检索与治理：混合检索、文件夹归类、去重合并、死链清理与批量整理。",
		promptSuggestions: [
			"检索我收藏的所有关于 AI、自动化与大模型相关的开源项目与工具",
			"盘点我最近收藏的前端开发框架、组件库与实用资源",
			"分析我的全库书签资产，给出最有价值的核心工具与使用场景",
			"检测书签库中可能的重复收藏并给出合并建议",
		],
		contextItemTypes: ["bookmark", "folder", "tag", "image", "file"],
	},
	creator: {
		code: "creator",
		systemPromptHint:
			"用户正在「自媒体」模块。偏向内容生产：从收藏库检索素材与选题、提炼观点、生成二创草稿（推文/小红书/脚本），并提醒人工确认后再发布。",
		promptSuggestions: [
			"从我的收藏里挖掘 3 个值得二创的选题并给出切入角度",
			"基于我收藏的 AI 工具资料，起草一条小红书风格的推荐帖",
			"把某个主题文件夹提炼成一篇口播脚本大纲",
		],
		contextItemTypes: ["bookmark", "folder", "tag", "image", "file"],
	},
	learn: {
		code: "learn",
		systemPromptHint:
			"用户正在「学习」模块。偏向学习辅助：聚合学习资源、梳理知识脉络、对比概念、规划学习路径。",
		promptSuggestions: [
			"梳理我收藏的学习资源，按主题规划一条学习路径",
			"我收藏的某个领域资料里有哪些核心概念需要优先掌握？",
		],
		contextItemTypes: ["bookmark", "folder", "tag"],
	},
	editor: {
		code: "editor",
		persona: `你是用户的「AI 写作搭档」，当前正在协助深度加工一篇文档。
你的核心能力：理解文档上下文、提出结构改写建议、帮助扩写/缩写/换风格、从知识库检索可引用的素材。
红线：对文档的任何改写必须经用户确认，AI 只给建议和草稿，写入操作（rewrite_document）需人工批准。`,
		systemPromptHint:
			"用户正在「创作」模块。偏向写作协同：理解当前文档上下文、AI 辅助改写（需人工确认）、检索素材引用、版本快照管理。",
		tools: [
			"read_document",
			"list_documents",
			"update_document_title",
			"trigger_document_create",
			"trigger_paragraph_rewrite",
			"insert_document_block",
			"edit_document_paragraph",
			"generate_mermaid_diagram",
			"web_search",
			"query_bookmarks",
			"read_webpage_content",
			"crawl_webpage_via_extension",
		],
		promptSuggestions: [
			"基于本文核心观点与素材进行深度二创（洗稿重构），生成一篇全新稿件",
			"根据全文提炼 5 个高点击爆款标题，并选最优的一个直接更新为文章标题",
			"对全文进行逐段流式润色，保留图片并对照审阅",
			"帮我分析当前文档的结构，给出改进建议",
			"把这篇文章改写成更适合自媒体传播的风格",
			"从我的收藏库找可以引用的素材",
		],
		contextItemTypes: ["bookmark", "folder", "tag", "file", "document"],
		entryActions: [
			{
				label: "深度二创洗稿",
				prompt:
					"请基于当前正文事实与核心论据，进行深度二次创作与洗稿重构。彻底打破原有句式与段落次序，重新提炼切入点并换用全新生动表达，调用 trigger_paragraph_rewrite 下发洗稿重构流水线，在正文中流式输出全新的稿件。",
			},
			{
				label: "爆款标题拟定",
				prompt:
					"请深度阅读当前文档核心内容，为我拟定 5 个针对自媒体传播的爆款标题（涵盖悬念、干货、反常识等维度），并选择综合效果最好的一个直接更新为文章标题。",
			},
			{
				label: "分析文档结构",
				prompt: "帮我分析当前文档的结构，找出可优化的部分，给出详细改进建议",
			},
			{
				label: "一键裂变为平台文案",
				prompt:
					"把当前文档的核心内容裂变为：1. 微信公众号文章摘要 2. 小红书种草文案 3. 推特推文，各保持平台风格",
			},
		],
	},
	ecommerce: {
		code: "ecommerce",
		systemPromptHint:
			"用户正在「电商」模块。偏向选品与运营：聚合选品素材、竞品信息、运营工具，辅助生成选品对比与文案。",
		promptSuggestions: [
			"整理我收藏的电商运营工具，按用途分类并推荐组合",
			"基于收藏素材做一份选品对比矩阵",
		],
		contextItemTypes: ["bookmark", "folder", "tag", "image"],
	},
	skills: {
		code: "skills",
		systemPromptHint:
			"用户正在「Skills」模块。偏向技能资产管理：检索本地 skills、解释用途、建议组合与落库整理。",
		promptSuggestions: [
			"盘点我本地的 skills，按能力域分组并说明各自用途",
			"哪些 skills 适合组合成一条内容生产流水线？",
		],
		contextItemTypes: ["folder", "file"],
	},
};

/** 按模块 code 取贡献包，未注册时回退全局包 */
export function getAiContribution(code?: string | null): AiModuleContribution {
	if (code && AI_MODULE_CONTRIBUTIONS[code]) {
		return AI_MODULE_CONTRIBUTIONS[code];
	}
	return GLOBAL_AI_CONTRIBUTION;
}

/** 取模块人格提示（persona 优先，回落 systemPromptHint） */
export function getModulePersona(contribution: AiModuleContribution): string {
	return contribution.persona || contribution.systemPromptHint;
}
