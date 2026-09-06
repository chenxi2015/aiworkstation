import { createServerFn } from "@tanstack/react-start";
import { type ChatSessionRecord, workbenchDb } from "../db/sqlite.ts";

/**
 * Server Function: Get all chat sessions from SQLite
 */
export const getChatSessionsFn = createServerFn({ method: "GET" }).handler(
	async (): Promise<ChatSessionRecord[]> => {
		return workbenchDb.getAllChatSessions();
	},
);

/**
 * Server Function: Save or update a single chat session in SQLite
 */
export const saveChatSessionFn = createServerFn({ method: "POST" })
	.validator((data: ChatSessionRecord) => data)
	.handler(async ({ data }): Promise<{ success: boolean; id: string }> => {
		workbenchDb.saveChatSession(data);
		return { success: true, id: data.id };
	});

/**
 * Server Function: Delete a chat session by ID in SQLite
 */
export const deleteChatSessionFn = createServerFn({ method: "POST" })
	.validator((sessionId: string) => sessionId)
	.handler(async ({ data: sessionId }): Promise<{ success: boolean }> => {
		workbenchDb.deleteChatSession(sessionId);
		return { success: true };
	});

/**
 * Server Function: Clear all chat sessions in SQLite
 */
export const clearChatSessionsFn = createServerFn({ method: "POST" }).handler(
	async (): Promise<{ success: boolean }> => {
		workbenchDb.clearAllChatSessions();
		return { success: true };
	},
);

/**
 * Server Function: Export all chat sessions formatted for JSON file download
 */
export const exportChatSessionsJsonFn = createServerFn({
	method: "GET",
}).handler(async () => {
	return workbenchDb.exportChatSessionsToJson();
});
