import type { SearchResultItem } from "../../../components/workbench/types.ts";
import type { EmbeddingConfig } from "../../../services/embeddingService.ts";
import type { ChatContextItem } from "../../../types/chatContext.ts";
import { buildSystemPrompt } from "../prompts/index.ts";
import { resolveActiveDocumentPrompt } from "./formatters/activeDocument.ts";
import { resolveAttachmentsPrompt } from "./formatters/attachments.ts";
import { resolveFolderScopePrompt } from "./formatters/folderScope.ts";
import { getFormattedDate, getFormattedTime } from "./formatters/time.ts";
import { retrieveBookmarkContext } from "./retrieval.ts";

export interface PreparedRagContext {
	systemPrompt: string;
	contextReferences: SearchResultItem[];
	candidateCount: number;
	emptyFallbackMessage?: string;
}

export interface RagAgentParams {
	question: string;
	folderId?: number | null;
	folderName?: string;
	embeddingConfig?: EmbeddingConfig;
	contextItems?: ChatContextItem[];
	/** Current module code (e.g. 'editor', 'bookmarks'), drives persona injection */
	module?: string;
	/** ID of the document currently being edited in the active page */
	activeDocumentId?: number;
}

/**
 * Orchestrator: prepare all context fragments and assemble the final system prompt.
 * This is the single public entry point used by agentRunner and legacy rag.ts.
 */
export async function prepareRagAgentContext(
	params: RagAgentParams,
): Promise<PreparedRagContext> {
	const {
		folderId,
		folderName,
		contextItems = [],
		module,
		activeDocumentId,
	} = params;

	// 1. Semantic bookmark RAG retrieval (pure data + early-exit fallback)
	const retrieval = await retrieveBookmarkContext({
		...params,
		contextItems,
	});

	if (retrieval.emptyFallbackMessage) {
		return {
			systemPrompt: "",
			contextReferences: [],
			candidateCount: 0,
			emptyFallbackMessage: retrieval.emptyFallbackMessage,
		};
	}

	// 2. Independent context fragment builders
	const folderScopePrompt = resolveFolderScopePrompt(folderId, folderName);

	// Active document (injected via PageBridge) takes priority over dragged document items
	const activeDocumentPrompt = resolveActiveDocumentPrompt(activeDocumentId);
	const { attachmentsPrompt, draggedDocumentPrompt } =
		resolveAttachmentsPrompt(contextItems);

	const documentContextPrompt = activeDocumentPrompt || draggedDocumentPrompt;
	const combinedContextPrompt = attachmentsPrompt + documentContextPrompt;

	// 3. Assemble the final system prompt
	const systemPrompt = buildSystemPrompt({
		module,
		dateStr: getFormattedDate(),
		timeStr: getFormattedTime(),
		folderScopePrompt,
		combinedContextPrompt,
		contextSnippets: retrieval.contextSnippets,
	});

	return {
		systemPrompt,
		contextReferences: retrieval.contextReferences,
		candidateCount: retrieval.candidateCount,
	};
}

// Re-export config resolvers for external callers (backwards compat)
export { resolveEmbeddingConfig, resolveLlmConfig } from "./config.ts";
