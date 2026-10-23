import type { ChatItem } from "../../../hooks/ai/useChatMessages";
import { workbenchContextStore } from "../../../stores/workbenchContextStore";
import type { AgentChatParams } from "../../../types/agent";
import { WorkbenchStorageService } from "../../workbenchStorage";
import type { SendPromptOptions } from "./types";

/**
 * Build initial user ChatItem message
 */
export function createUserMessage(
	textToSend: string,
	options: SendPromptOptions,
	timeStr: string,
): ChatItem {
	return {
		role: "user",
		content: textToSend,
		contextItems:
			options.contextItems && options.contextItems.length > 0
				? options.contextItems
				: undefined,
		timestamp: timeStr,
	};
}

/**
 * Build initial placeholder assistant ChatItem message
 */
export function createInitialAssistantMessage(timeStr: string): ChatItem {
	return {
		role: "assistant",
		content: "",
		steps: [],
		parts: [],
		isStreaming: true,
		timestamp: timeStr,
	};
}

/**
 * Resolve effective contextual parameters and storage configuration into AgentChatParams
 */
export function resolveAgentChatParams(
	textToSend: string,
	historyBase: ChatItem[],
	options: SendPromptOptions,
): AgentChatParams {
	const history = options.newChat
		? []
		: historyBase.slice(-8).map((m) => ({
				role: m.role,
				content: m.content,
				contextItems: m.contextItems,
			}));

	const settings = WorkbenchStorageService.getSettings();
	const isOfficialLlm = settings.llmProvider === "official";
	const llmConfig = isOfficialLlm
		? {
				// Official channel is fully managed by server-side gateway credentials
				model: settings.model?.trim() || "deepseek-chat",
			}
		: {
				apiKey: settings.apiKey,
				baseUrl: settings.baseUrl,
				model: settings.model,
			};

	const isOfficialEmbedding = settings.embeddingProvider === "official";
	const embeddingConfig = isOfficialEmbedding
		? {
				model: settings.embeddingModel?.trim() || "BAAI/bge-m3",
			}
		: {
				apiKey: settings.embeddingApiKey || settings.apiKey || "",
				baseUrl: settings.embeddingBaseUrl,
				model: settings.embeddingModel,
			};

	const resolvedModule =
		options.module ?? workbenchContextStore.state.activeModule;

	const effectiveDocId =
		options.activeDocumentId !== undefined
			? (options.activeDocumentId ?? undefined)
			: workbenchContextStore.state.detachedDocumentId ===
					workbenchContextStore.state.activeDocument?.id
				? undefined
				: (workbenchContextStore.state.activeDocument?.id ?? undefined);

	const effectiveMaterialId =
		options.activeMaterialId !== undefined
			? (options.activeMaterialId ?? undefined)
			: workbenchContextStore.state.detachedMaterialId ===
					workbenchContextStore.state.activeMaterial?.id
				? undefined
				: (workbenchContextStore.state.activeMaterial?.id ?? undefined);

	const effectiveNotePath =
		options.activeNotePath !== undefined
			? (options.activeNotePath ?? undefined)
			: workbenchContextStore.state.detachedNotePath ===
					workbenchContextStore.state.activeNote?.path
				? undefined
				: (workbenchContextStore.state.activeNote?.path ?? undefined);

	return {
		question: textToSend,
		history,
		embeddingConfig,
		llmConfig,
		folderId: options.folderId,
		folderName: options.folderName,
		contextItems:
			options.contextItems && options.contextItems.length > 0
				? options.contextItems
				: undefined,
		module: resolvedModule,
		activeDocumentId: effectiveDocId,
		activeMaterialId: effectiveMaterialId,
		activeNotePath: effectiveNotePath,
	};
}
