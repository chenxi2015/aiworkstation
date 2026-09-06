import {
	clearChatSessionsFn,
	deleteChatSessionFn,
	exportChatSessionsJsonFn,
	getChatSessionsFn,
	saveChatSessionFn,
} from "../../server/functions/chatSessions";
import type { ChatSession } from "../storage/chatStorage";

/**
 * Client RPC: Fetch all chat sessions from SQLite database
 */
export async function fetchChatSessionsFromDb<
	T = any,
>(): Promise<ChatSession<T>[]> {
	try {
		const result = await getChatSessionsFn();
		return (result as ChatSession<T>[]) || [];
	} catch (err) {
		console.error("[chatSessionClient] Failed to fetch sessions from DB:", err);
		return [];
	}
}

/**
 * Client RPC: Upsert a single chat session into SQLite database
 */
export async function saveChatSessionToDb<T = any>(
	session: ChatSession<T>,
): Promise<boolean> {
	try {
		await saveChatSessionFn({ data: session });
		return true;
	} catch (err) {
		console.error("[chatSessionClient] Failed to save session to DB:", err);
		return false;
	}
}

/**
 * Client RPC: Delete a chat session by ID from SQLite database
 */
export async function deleteChatSessionFromDb(
	sessionId: string,
): Promise<boolean> {
	try {
		await deleteChatSessionFn({ data: sessionId });
		return true;
	} catch (err) {
		console.error("[chatSessionClient] Failed to delete session from DB:", err);
		return false;
	}
}

/**
 * Client RPC: Clear all chat sessions from SQLite database
 */
export async function clearChatSessionsFromDb(): Promise<boolean> {
	try {
		await clearChatSessionsFn();
		return true;
	} catch (err) {
		console.error("[chatSessionClient] Failed to clear sessions from DB:", err);
		return false;
	}
}

/**
 * Client RPC: Export all chat sessions formatted for JSON file download
 */
export async function exportChatSessionsJsonFromDb(): Promise<{
	exportedAt: string;
	version: string;
	totalSessions: number;
	sessions: ChatSession[];
} | null> {
	try {
		return (await exportChatSessionsJsonFn()) as any;
	} catch (err) {
		console.error("[chatSessionClient] Failed to export sessions JSON:", err);
		return null;
	}
}
