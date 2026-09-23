/**
 * 改写类意图识别：把「整篇改写/润色/结构化」类请求从通用 Agent 聊天
 * 短路到页面的双栏比对流式流水线（PageBridge 的 stream_*_rewrite 动作）。
 *
 * 为什么需要它：改写任务有专用的直达流式端点（/api/editor/rewrite/stream），
 * 若走通用 Agent，模型要先跑工具链、再决定调用 trigger_paragraph_rewrite，
 * 首字节延迟被拉长为「多轮 Agent 往返 + 工具耗时 + 第二次 LLM 调用」。
 */

export type RewriteIntent = "spin" | "polish" | "structure";

/** 各意图对应的 PageBridge 动作 id（按模块注册表约定） */
export const REWRITE_ACTION_IDS: Record<RewriteIntent, string> = {
	spin: "stream_spin_rewrite",
	polish: "stream_full_rewrite",
	structure: "stream_structure_rewrite",
};

/**
 * 匹配整篇改写类意图。关键词刻意收紧，避免劫持「总结/分析/建议」类提问：
 * - spin：二创 / 洗稿 / 重构 / 改写 / 重写
 * - structure：结构化整理 / 结构重排 / 重新梳理
 * - polish：润色 / 排版美化 / 语言风格
 */
export function matchRewritePipelineIntent(
	prompt: string,
): RewriteIntent | null {
	const text = prompt.trim();
	if (!text) return null;
	if (/二创|洗稿|重构|改写|重写/.test(text)) return "spin";
	if (/结构化整理|结构重排|重新梳理/.test(text)) return "structure";
	if (/润色|排版美化|语言风格/.test(text)) return "polish";
	return null;
}
