import {
	type ChatMessage,
	chatWithBookmarks,
	type FolderDossierResult,
	generateFolderDossier,
	type RAGChatResult,
} from "../../server/functions/rag";
import type { EmbeddingConfig } from "../embedding/client";

export type { ChatMessage, FolderDossierResult, RAGChatResult };

/**
 * Chat with user's bookmarks knowledge base using RAG
 */
export async function chatWithBookmarksRpc(
	params: {
		question: string;
		history?: ChatMessage[];
		embeddingConfig?: EmbeddingConfig;
		llmConfig?: {
			apiKey?: string;
			baseUrl?: string;
			model?: string;
		};
		folderId?: number | null;
		folderName?: string;
	},
	options?: { signal?: AbortSignal },
): Promise<RAGChatResult> {
	return await (chatWithBookmarks as any)({
		data: params,
		signal: options?.signal,
	});
}

/**
 * Generate research dossier summary for a folder
 */
export async function generateFolderDossierRpc(params: {
	folderId: number;
	llmConfig?: {
		apiKey?: string;
		baseUrl?: string;
		model?: string;
	};
}): Promise<FolderDossierResult> {
	return await generateFolderDossier({ data: params });
}
