import type { ChatContextItem } from "../../../../../types/chatContext";
import type { PageBridge } from "../../../../../types/pageBridge";
import {
	matchRewritePipelineIntent,
	REWRITE_ACTION_IDS,
} from "../rewriteIntent";

/** 可写目标对象：当前页面打开的文档/笔记，或会话上下文 attach 的文档/笔记 */
export interface ActionTargetObject {
	kind: "document" | "note";
	/** 归属模块 code（creator=创作文档，obsidian=笔记） */
	module: string;
	/** 文档 id（kind === "document"） */
	documentId?: number;
	/** 笔记相对路径（kind === "note"） */
	notePath?: string;
	/** 展示标题 */
	title: string;
}

export type ResolveActionResult =
	| { kind: "direct"; target: ActionTargetObject; actionId: string }
	| {
			kind: "proposal";
			target: ActionTargetObject;
			actionId: string;
			reason: "context-target" | "cross-module" | "skill-context";
			executionForm: string;
			skillGuidance?: string;
	  }
	| { kind: "agent" };

export interface ResolveActionInput {
	prompt: string;
	skillContextItems: ChatContextItem[];
	pageBridge: PageBridge | null | undefined;
	contextItems: ChatContextItem[];
}

const REWRITE_EXECUTION_FORM = "双栏比对改写";

/** 按改写意图解析 PageBridge 中实际可用的动作 id（含兜底顺序） */
export function findRewriteActionId(
	bridge: PageBridge | null | undefined,
	actionId: string,
): string | null {
	const actions = bridge?.actions ?? [];
	const fallbackOrder = [
		actionId,
		"stream_full_rewrite",
		"stream_spin_rewrite",
		"stream_structure_rewrite",
	];
	for (const id of fallbackOrder) {
		if (actions.some((a) => a.id === id)) return id;
	}
	return null;
}

/**
 * 统一的目标对象解析（design D2）：
 * 任何改写类意图在发送前都经过这里，产出「直达 / 提议 / 通用 Agent」三种结果之一。
 *
 * - direct：target 就是当前页面打开的对象，且页面注册了对应双栏动作
 * - proposal：target 来自上下文 items、归属模块与当前页面不同，或携带 skill 上下文
 * - agent：无可写目标对象
 */
export function resolveActionTarget(
	input: ResolveActionInput,
): ResolveActionResult {
	const { prompt, skillContextItems, pageBridge, contextItems } = input;

	// 关键词命中只作为「是否考虑双栏」的候选信号（design D5）
	const intent = matchRewritePipelineIntent(prompt);
	if (!intent) return { kind: "agent" };

	const preferredActionId = REWRITE_ACTION_IDS[intent];
	const skillItems = skillContextItems.filter((i) => i.type === "skill");
	const skillGuidance = skillItems
		.map((i) =>
			typeof i.data?.content === "string" ? i.data.content.trim() : "",
		)
		.filter(Boolean)
		.join("\n\n");

	// 1. 上下文 items 中 attach 的文档/笔记：用户显式 attach 的对象优先于当前页面
	const contextTarget = resolveContextTarget(contextItems);
	if (contextTarget) {
		return {
			kind: "proposal",
			target: contextTarget,
			actionId: preferredActionId,
			reason:
				contextTarget.module === pageBridge?.module
					? "context-target"
					: "cross-module",
			executionForm: REWRITE_EXECUTION_FORM,
			skillGuidance: skillGuidance || undefined,
		};
	}

	// 2. 当前页面打开的对象
	const pageTarget = resolvePageTarget(pageBridge);
	if (pageTarget) {
		const actionId = findRewriteActionId(pageBridge, preferredActionId);
		if (actionId) {
			if (skillItems.length > 0) {
				return {
					kind: "proposal",
					target: pageTarget,
					actionId,
					reason: "skill-context",
					executionForm: REWRITE_EXECUTION_FORM,
					skillGuidance: skillGuidance || undefined,
				};
			}
			return { kind: "direct", target: pageTarget, actionId };
		}
	}

	// 3. 无可写目标
	return { kind: "agent" };
}

function resolvePageTarget(
	bridge: PageBridge | null | undefined,
): ActionTargetObject | null {
	if (!bridge) return null;
	if (bridge.module === "obsidian" && bridge.activeNotePath) {
		return {
			kind: "note",
			module: "obsidian",
			notePath: bridge.activeNotePath,
			title:
				bridge.activeNotePath.split("/").pop()?.replace(/\.md$/i, "") ??
				"未命名笔记",
		};
	}
	if (bridge.module === "editor" && bridge.activeDocumentId != null) {
		return {
			kind: "document",
			module: "creator",
			documentId: bridge.activeDocumentId,
			title: bridge.activeDocumentTitle ?? "未命名文档",
		};
	}
	return null;
}

function resolveContextTarget(
	contextItems: ChatContextItem[],
): ActionTargetObject | null {
	for (const item of contextItems) {
		const data = (item.data ?? {}) as Record<string, unknown>;
		const notePath =
			typeof data.notePath === "string"
				? data.notePath
				: typeof data.path === "string" && data.path.endsWith(".md")
					? data.path
					: undefined;
		if (notePath) {
			return {
				kind: "note",
				module: "obsidian",
				notePath,
				title: item.title,
			};
		}
		if (item.type === "document") {
			const rawId = data.documentId ?? data.docId;
			const documentId =
				typeof rawId === "number" && Number.isFinite(rawId)
					? rawId
					: typeof rawId === "string" && Number.isFinite(Number(rawId))
						? Number(rawId)
						: undefined;
			if (documentId != null) {
				return {
					kind: "document",
					module: "creator",
					documentId,
					title: item.title,
				};
			}
		}
	}
	return null;
}
