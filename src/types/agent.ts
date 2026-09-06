import type { SearchResultItem } from "../components/workbench/types";
import type { EmbeddingConfig } from "../services/embedding/client";
import type { ChatContextItem } from "./chatContext";

/**
 * Individual step representing a tool invocation during the Agent ReAct loop
 */
export interface AgentStep {
	id: string;
	toolName: string;
	args?: Record<string, unknown>;
	status: "running" | "completed" | "failed";
	summary?: string;
	durationMs?: number;
	timestamp?: string;
}

/**
 * Real-time event stream payloads emitted from the Agent harness to client
 */
export type AgentStreamEvent =
	| { type: "run_start"; runId: string }
	| { type: "step_start"; step: AgentStep }
	| { type: "step_end"; step: AgentStep }
	| { type: "text_chunk"; delta: string }
	| { type: "references"; references: SearchResultItem[] }
	| { type: "run_end"; answer: string; dbMutated: boolean; timestamp: string }
	| { type: "error"; message: string };

/**
 * Parameters accepted by the Agent streaming runner
 */
export interface AgentChatParams {
	question: string;
	history?: Array<{
		role: "user" | "assistant" | "tool" | "system";
		content: string;
	}>;
	embeddingConfig?: EmbeddingConfig;
	llmConfig?: {
		apiKey?: string;
		baseUrl?: string;
		model?: string;
	};
	folderId?: number | null;
	folderName?: string;
	contextItems?: ChatContextItem[];
}
