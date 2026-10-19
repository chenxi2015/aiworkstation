import type { ChatItem, ChatMessagePart } from "../../../hooks/ai/useChatMessages";
import type { SearchResultItem } from "../../../components/workbench/types";
import type { AgentStep } from "../../../types/agent";

/**
 * Conclude any running steps with a target status and fallback summary
 */
export function concludeRunningSteps(
	steps: AgentStep[] | undefined,
	targetStatus: "completed" | "failed",
	fallbackSummary: string,
): AgentStep[] | undefined {
	if (!steps || steps.length === 0) return steps;
	return steps.map((s) =>
		s.status === "running"
			? {
					...s,
					status: targetStatus,
					summary: s.summary || fallbackSummary,
				}
			: s,
	);
}

/**
 * Conclude running steps within message parts
 */
export function concludeRunningParts(
	parts: ChatMessagePart[] | undefined,
	targetStatus: "completed" | "failed",
	fallbackSummary: string,
): ChatMessagePart[] | undefined {
	if (!parts || parts.length === 0) return parts;
	return parts.map((p) => {
		if (p.type === "step_group") {
			return {
				...p,
				steps:
					concludeRunningSteps(p.steps, targetStatus, fallbackSummary) ||
					p.steps,
			};
		}
		return p;
	});
}

/**
 * Immutable reducer: append or update step when a new step starts
 */
export function reduceStepStart(msg: ChatItem, step: AgentStep): ChatItem {
	const existingSteps = msg.steps || [];
	const stepIndex = existingSteps.findIndex((s) => s.id === step.id);
	const updatedSteps =
		stepIndex >= 0
			? existingSteps.map((s, idx) => (idx === stepIndex ? step : s))
			: [...existingSteps, step];

	const existingParts = msg.parts ? [...msg.parts] : [];
	const lastPart = existingParts[existingParts.length - 1];
	let nextParts: ChatMessagePart[];

	if (lastPart && lastPart.type === "step_group") {
		const inGroupIndex = lastPart.steps.findIndex((s) => s.id === step.id);
		const nextStepsInGroup =
			inGroupIndex >= 0
				? lastPart.steps.map((s, idx) => (idx === inGroupIndex ? step : s))
				: [...lastPart.steps, step];

		nextParts = [
			...existingParts.slice(0, -1),
			{ type: "step_group", steps: nextStepsInGroup },
		];
	} else {
		nextParts = [...existingParts, { type: "step_group", steps: [step] }];
	}

	return {
		...msg,
		steps: updatedSteps,
		parts: nextParts,
	};
}

/**
 * Immutable reducer: update step details when a step finishes
 */
export function reduceStepEnd(msg: ChatItem, step: AgentStep): ChatItem {
	let matched = false;
	const updatedSteps = (msg.steps || []).map((s) => {
		if (s.id === step.id) {
			matched = true;
			return step;
		}
		return s;
	});

	const finalSteps = matched
		? updatedSteps
		: (() => {
				let didReplace = false;
				return updatedSteps.map((s) => {
					if (
						!didReplace &&
						s.toolName === step.toolName &&
						s.status === "running"
					) {
						didReplace = true;
						return step;
					}
					return s;
				});
			})();

	const existingParts = msg.parts ? [...msg.parts] : [];
	let matchedPart = false;
	const nextParts = existingParts.map((p) => {
		if (p.type !== "step_group") return p;
		return {
			...p,
			steps: p.steps.map((s) => {
				if (s.id === step.id) {
					matchedPart = true;
					return step;
				}
				return s;
			}),
		};
	});

	const finalParts = matchedPart
		? nextParts
		: (() => {
				let didReplace = false;
				return nextParts.map((p) => {
					if (p.type !== "step_group") return p;
					return {
						...p,
						steps: p.steps.map((s) => {
							if (
								!didReplace &&
								s.toolName === step.toolName &&
								s.status === "running"
							) {
								didReplace = true;
								return step;
							}
							return s;
						}),
					};
				});
			})();

	const isDraftAction =
		step.action === "draft" ||
		Boolean(step.navigation?.draftId) ||
		step.toolName === "draft_article";
	const draftPayload =
		isDraftAction && step.navigation?.draftId
			? {
					draftId: step.navigation.draftId,
					title: step.navigation.title || "未命名草稿",
					wordCount: step.navigation.wordCount || 0,
					kind:
						step.navigation.draftKind ||
						(step.toolName.startsWith("excalidraw_")
							? ("excalidraw" as const)
							: step.toolName.startsWith("canvas_")
								? ("canvas" as const)
								: ("article" as const)),
					status: "pending" as const,
				}
			: msg.draft;

	return {
		...msg,
		steps: finalSteps,
		parts: finalParts,
		...(draftPayload ? { draft: draftPayload } : {}),
	};
}

/**
 * Immutable reducer: append streaming text delta to message
 */
export function reduceTextChunk(msg: ChatItem, delta: string): ChatItem {
	const existingParts = msg.parts ? [...msg.parts] : [];
	const lastPart = existingParts[existingParts.length - 1];

	let nextParts: ChatMessagePart[];
	if (lastPart && lastPart.type === "text") {
		nextParts = [
			...existingParts.slice(0, -1),
			{
				...lastPart,
				text: lastPart.text + delta,
			},
		];
	} else {
		nextParts = [...existingParts, { type: "text", text: delta }];
	}

	return {
		...msg,
		content: msg.content + delta,
		parts: nextParts,
	};
}

/**
 * Immutable reducer: update references attached to assistant message
 */
export function reduceReferences(
	msg: ChatItem,
	references: SearchResultItem[],
): ChatItem {
	return {
		...msg,
		references,
	};
}

/**
 * Immutable reducer: finalize message when agent run completes
 */
export function reduceRunEnd(msg: ChatItem, answer: string): ChatItem {
	const updatedSteps = concludeRunningSteps(msg.steps, "completed", "执行完成");
	const updatedParts = concludeRunningParts(msg.parts, "completed", "执行完成");

	const finalContent =
		msg.content ||
		answer ||
		(msg.steps && msg.steps.length > 0
			? "任务已执行完毕。"
			: "未获取到回复内容。");

	return {
		...msg,
		steps: updatedSteps,
		parts: updatedParts,
		isStreaming: false,
		content: finalContent,
	};
}

/**
 * Immutable reducer: abort and finalize message on manual stop
 */
export function reduceStop(msg: ChatItem): ChatItem {
	const updatedSteps = concludeRunningSteps(
		msg.steps,
		"failed",
		"[已手动终止操作]",
	);
	const updatedParts = concludeRunningParts(
		msg.parts,
		"failed",
		"[已手动终止操作]",
	);

	return {
		...msg,
		steps: updatedSteps,
		parts: updatedParts,
		isStreaming: false,
		content: msg.content || "（已停止本次回答）",
	};
}

/**
 * Immutable reducer: finalize message with error payload
 */
export function reduceError(msg: ChatItem, errMsg: string): ChatItem {
	const errorText = `请求失败: ${errMsg || "未知错误，请检查设置中的 AI Model API Key"}`;
	const updatedSteps = concludeRunningSteps(
		msg.steps,
		"failed",
		`[异常终止: ${errMsg}]`,
	);
	const updatedParts = concludeRunningParts(
		msg.parts,
		"failed",
		`[异常终止: ${errMsg}]`,
	);

	return {
		...msg,
		steps: updatedSteps,
		parts: updatedParts,
		isStreaming: false,
		content: msg.content ? `${msg.content}\n\n${errorText}` : errorText,
	};
}

