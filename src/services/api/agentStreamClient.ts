import type { SearchResultItem } from "../../components/workbench/types.ts";
import type {
	AgentChatParams,
	AgentStep,
	AgentStreamEvent,
} from "../../server/ai/agentTypes.ts";

export interface AgentStreamHandlers {
	onStepStart?: (step: AgentStep) => void;
	onStepEnd?: (step: AgentStep) => void;
	onTextChunk?: (delta: string) => void;
	onReferences?: (references: SearchResultItem[]) => void;
	onRunEnd?: (answer: string, dbMutated: boolean) => void;
	onError?: (message: string) => void;
}

/**
 * Client service to stream Agent executions via Server-Sent Events (SSE)
 */
export async function streamAgentChat(
	params: AgentChatParams,
	handlers: AgentStreamHandlers,
	options?: { signal?: AbortSignal },
): Promise<void> {
	const response = await fetch("/api/chat/stream", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify(params),
		signal: options?.signal,
	});

	if (!response.ok) {
		const text = await response.text();
		throw new Error(text || `HTTP error ${response.status}`);
	}

	if (!response.body) {
		throw new Error("No response body received from stream");
	}

	const reader = response.body.getReader();
	const decoder = new TextDecoder("utf-8");
	let buffer = "";

	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;

			buffer += decoder.decode(value, { stream: true });
			const lines = buffer.split("\n");
			buffer = lines.pop() || "";

			for (const line of lines) {
				const trimmed = line.trim();
				if (!trimmed || trimmed.startsWith(":")) continue;

				if (trimmed.startsWith("data: ")) {
					const jsonStr = trimmed.slice(6);
					try {
						const event = JSON.parse(jsonStr) as AgentStreamEvent;
						switch (event.type) {
							case "step_start":
								handlers.onStepStart?.(event.step);
								break;
							case "step_end":
								handlers.onStepEnd?.(event.step);
								break;
							case "text_chunk":
								handlers.onTextChunk?.(event.delta);
								break;
							case "references":
								handlers.onReferences?.(event.references);
								break;
							case "run_end":
								handlers.onRunEnd?.(event.answer, event.dbMutated);
								break;
							case "error":
								handlers.onError?.(event.message);
								break;
						}
					} catch {
						// Ignore partial JSON parse errors
					}
				}
			}
		}
	} finally {
		reader.releaseLock();
	}
}
