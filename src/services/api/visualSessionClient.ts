import {
	addVisualItemFn,
	clearAllVisualSessionsFn,
	deleteVisualSessionFn,
	getVisualSessionsFn,
	removeVisualItemFn,
	removeVisualItemsFn,
	renameVisualSessionFn,
	saveVisualSessionFn,
} from "../../server/functions/visualSessions.ts";
import type {
	VisualChatSession,
	VisualGenerationItem,
} from "../../types/visualGeneration.ts";

/**
 * Client RPC: Fetch all visual generation sessions from SQLite database
 */
export async function fetchVisualSessionsFromDb(): Promise<
	VisualChatSession[]
> {
	try {
		const result = await getVisualSessionsFn();
		return result || [];
	} catch (err) {
		console.error(
			"[visualSessionClient] Failed to fetch visual sessions from DB:",
			err,
		);
		return [];
	}
}

/**
 * Client RPC: Upsert a single visual session into SQLite database
 */
export async function saveVisualSessionToDb(
	session: VisualChatSession,
): Promise<boolean> {
	try {
		await saveVisualSessionFn({ data: session });
		return true;
	} catch (err) {
		console.error(
			"[visualSessionClient] Failed to save visual session to DB:",
			err,
		);
		return false;
	}
}

/**
 * Client RPC: Append a single generated item to a visual session in SQLite database
 */
export async function addVisualItemToDb(
	sessionId: string,
	item: VisualGenerationItem,
	sessionTitle?: string,
): Promise<boolean> {
	try {
		await addVisualItemFn({
			data: { sessionId, item, sessionTitle },
		});
		return true;
	} catch (err) {
		console.error(
			"[visualSessionClient] Failed to add visual item to DB:",
			err,
		);
		return false;
	}
}

/**
 * Client RPC: Remove a single generated item from SQLite database
 */
export async function removeVisualItemFromDb(itemId: string): Promise<boolean> {
	try {
		await removeVisualItemFn({ data: itemId });
		return true;
	} catch (err) {
		console.error(
			"[visualSessionClient] Failed to remove visual item from DB:",
			err,
		);
		return false;
	}
}

/**
 * Client RPC: Remove multiple generated items from SQLite database
 */
export async function removeVisualItemsFromDb(
	itemIds: string[],
): Promise<boolean> {
	try {
		await removeVisualItemsFn({ data: itemIds });
		return true;
	} catch (err) {
		console.error(
			"[visualSessionClient] Failed to remove visual items from DB:",
			err,
		);
		return false;
	}
}

/**
 * Client RPC: Delete a visual session by ID from SQLite database
 */
export async function deleteVisualSessionFromDb(
	sessionId: string,
): Promise<boolean> {
	try {
		await deleteVisualSessionFn({ data: sessionId });
		return true;
	} catch (err) {
		console.error(
			"[visualSessionClient] Failed to delete visual session from DB:",
			err,
		);
		return false;
	}
}

/**
 * Client RPC: Clear all visual sessions and items from SQLite database
 */
export async function clearAllVisualSessionsFromDb(): Promise<boolean> {
	try {
		await clearAllVisualSessionsFn();
		return true;
	} catch (err) {
		console.error(
			"[visualSessionClient] Failed to clear all visual sessions from DB:",
			err,
		);
		return false;
	}
}

/**
 * Client RPC: Rename a visual session in SQLite database
 */
export async function renameVisualSessionInDb(
	sessionId: string,
	title: string,
): Promise<boolean> {
	try {
		await renameVisualSessionFn({ data: { sessionId, title } });
		return true;
	} catch (err) {
		console.error(
			"[visualSessionClient] Failed to rename visual session in DB:",
			err,
		);
		return false;
	}
}
