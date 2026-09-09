import type { ChatContextType } from "../types/chatContext";

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
	/** 注入 system prompt 的模块视角提示（服务端使用） */
	systemPromptHint: string;
	/** 聊天空态的快捷提问建议（客户端使用） */
	promptSuggestions: string[];
	/** 该模块下允许附加到对话的上下文类型 */
	contextItemTypes: ChatContextType[];
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
		systemPromptHint:
			"用户正在「创作」模块。偏向写作协同：基于收藏库引用素材、润色改写、生成 Markdown 结构与笔记内容。",
		promptSuggestions: [
			"帮我把当前文档补充大纲结构，并从收藏库找可引用的素材",
			"润色这段文字，使其更适合公开发布",
		],
		contextItemTypes: ["bookmark", "folder", "tag", "file"],
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
