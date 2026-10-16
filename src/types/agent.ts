import type { SearchResultItem } from "../components/workbench/types";
import type { EmbeddingConfig } from "../services/embedding/client";
import type { ChatContextItem } from "./chatContext";

/**
 * Individual step representing a tool invocation during the Agent ReAct loop
 */
export interface AgentStepNavigation {
	/** Target app route (e.g. "/obsidian") */
	route: string;
	/** Route search params (e.g. { note: "path/to/file.excalidraw" }) */
	searchParams?: Record<string, string>;
	/** CTA label (e.g. "打开画板") */
	label: string;
	/** Optional draft metadata for content delivery decoupling */
	draftId?: string;
	draftKind?: "article" | "excalidraw" | "canvas";
	title?: string;
	wordCount?: number;
}

export interface AgentStep {
	id: string;
	toolName: string;
	args?: Record<string, unknown>;
	status: "running" | "completed" | "failed";
	summary?: string;
	durationMs?: number;
	timestamp?: string;
	/**
	 * Dynamic client action directive defined by function tools (e.g. "canvas" | "rewrite")
	 * Decouples client execution dispatchers from hardcoded tool names.
	 */
	action?: string;
	/** Optional artifact navigation, rendered as a clickable result card */
	navigation?: AgentStepNavigation;
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
		contextItems?: ChatContextItem[];
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
	/** 当前所在模块 code（见 modules/ai-contributions.ts），用于服务端按模块视角组装 system prompt */
	module?: string;
	/** editor 模块：当前活跃文档 id（供 read_document 工具省略 documentId 时定位） */
	activeDocumentId?: number;
	/** creator 模块：当前选中的素材 id */
	activeMaterialId?: number;
	/** obsidian 模块：当前活跃笔记相对路径（供服务端注入笔记全文上下文） */
	activeNotePath?: string;
	/** 当前会话 ID（可选） */
	sessionId?: string;
}
