import type { ChatItem } from "../../../../../hooks/ai/useChatMessages";
import {
	type ChatSession,
	WorkbenchStorageService,
} from "../../../../../services/workbenchStorage";

export interface RecordSplitPracticeSessionParams {
	docId?: number;
	docTitle?: string;
	prompt: string;
	modeLabel?: string;
	generatedContent: string;
}

export const CHAT_SESSIONS_UPDATED_EVENT =
	"aiworkstation:chat_sessions_updated";

/**
 * Service to record dual-canvas split practice AI interactions
 * into the persistent SQLite chat sessions.
 */
export async function recordSplitPracticeSession({
	docId,
	docTitle,
	prompt,
	modeLabel,
	generatedContent,
}: RecordSplitPracticeSessionParams): Promise<void> {
	if (!generatedContent || !generatedContent.trim()) {
		return;
	}

	try {
		const sessionId = docId
			? `split_doc_${docId}`
			: `split_session_${Date.now()}`;
		const existingSessions =
			(await WorkbenchStorageService.fetchChatSessions<ChatItem>()) || [];
		const existingSession = existingSessions.find((s) => s.id === sessionId);

		const nowStr = new Date().toLocaleString([], {
			month: "2-digit",
			day: "2-digit",
			hour: "2-digit",
			minute: "2-digit",
		});

		const cleanPrompt = prompt.trim() || "根据要求对正文进行深度改写与优化";

		const contextItems = [
			{
				id: `split_mode_${Date.now()}`,
				type: "split_practice" as const,
				title: modeLabel ? `双栏演练 · ${modeLabel}` : "双栏演练",
			},
			...(docId
				? [
						{
							id: String(docId),
							type: "document" as const,
							title: docTitle || "当前文档",
						},
					]
				: []),
		];

		const userMessage: ChatItem = {
			role: "user",
			content: cleanPrompt,
			timestamp: nowStr,
			contextItems,
		};

		// Build assistant message with generated markdown content
		const assistantMessage: ChatItem = {
			role: "assistant",
			content: generatedContent.trim(),
			timestamp: nowStr,
		};

		const sessionTitle = `《${docTitle || "未命名文档"}》· 双栏演练`;

		let sessionToSave: ChatSession<ChatItem>;
		if (existingSession) {
			sessionToSave = {
				...existingSession,
				title: sessionTitle,
				updatedAt: nowStr,
				messages: [
					...(existingSession.messages || []),
					userMessage,
					assistantMessage,
				],
			};
		} else {
			sessionToSave = {
				id: sessionId,
				title: sessionTitle,
				createdAt: nowStr,
				updatedAt: nowStr,
				messages: [userMessage, assistantMessage],
			};
		}

		await WorkbenchStorageService.saveChatSession(sessionToSave);

		// Broadcast update event so active drawers or sidebars can refresh instantly
		if (typeof window !== "undefined") {
			window.dispatchEvent(
				new CustomEvent(CHAT_SESSIONS_UPDATED_EVENT, {
					detail: { sessionId },
				}),
			);
		}
	} catch (err) {
		console.warn("[splitChatSessionService] Failed to record session:", err);
	}
}
