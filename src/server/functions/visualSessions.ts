import { createServerFn } from "@tanstack/react-start";
import type {
	VisualChatSession,
	VisualGenerationItem,
} from "../../types/visualGeneration.ts";
import { workbenchDb } from "../db/sqlite.ts";

/**
 * Server Function: Get all visual generation sessions from SQLite
 */
export const getVisualSessionsFn = createServerFn({ method: "GET" }).handler(
	async (): Promise<VisualChatSession[]> => {
		return workbenchDb.getAllVisualSessions();
	},
);

/**
 * Server Function: Save or update a single visual session in SQLite
 */
export const saveVisualSessionFn = createServerFn({ method: "POST" })
	.validator((data: VisualChatSession) => data)
	.handler(async ({ data }): Promise<{ success: boolean; id: string }> => {
		workbenchDb.saveVisualSession(data);
		return { success: true, id: data.id };
	});

/**
 * Server Function: Add a generated item to a visual session in SQLite
 */
export const addVisualItemFn = createServerFn({ method: "POST" })
	.validator(
		(data: {
			sessionId: string;
			item: VisualGenerationItem;
			sessionTitle?: string;
		}) => data,
	)
	.handler(async ({ data }): Promise<{ success: boolean }> => {
		workbenchDb.addVisualItem(data.sessionId, data.item, data.sessionTitle);
		return { success: true };
	});

/**
 * Server Function: Remove a generated item from SQLite
 */
export const removeVisualItemFn = createServerFn({ method: "POST" })
	.validator((itemId: string) => itemId)
	.handler(async ({ data: itemId }): Promise<{ success: boolean }> => {
		workbenchDb.removeVisualItem(itemId);
		return { success: true };
	});

/**
 * Server Function: Remove multiple generated items from SQLite
 */
export const removeVisualItemsFn = createServerFn({ method: "POST" })
	.validator((itemIds: string[]) => itemIds)
	.handler(async ({ data: itemIds }): Promise<{ success: boolean }> => {
		workbenchDb.removeVisualItems(itemIds);
		return { success: true };
	});

/**
 * Server Function: Delete a visual session by ID in SQLite
 */
export const deleteVisualSessionFn = createServerFn({ method: "POST" })
	.validator((sessionId: string) => sessionId)
	.handler(async ({ data: sessionId }): Promise<{ success: boolean }> => {
		workbenchDb.deleteVisualSession(sessionId);
		return { success: true };
	});

/**
 * Server Function: Clear all visual sessions in SQLite
 */
export const clearAllVisualSessionsFn = createServerFn({
	method: "POST",
}).handler(async (): Promise<{ success: boolean }> => {
	workbenchDb.clearAllVisualSessions();
	return { success: true };
});

/**
 * Server Function: Rename a visual session in SQLite
 */
export const renameVisualSessionFn = createServerFn({ method: "POST" })
	.validator((data: { sessionId: string; title: string }) => data)
	.handler(async ({ data }): Promise<{ success: boolean }> => {
		workbenchDb.renameVisualSession(data.sessionId, data.title);
		return { success: true };
	});

