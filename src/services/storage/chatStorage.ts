/**
 * Chat session data structures
 */

export interface ChatSession<T = any> {
	id: string;
	title: string;
	createdAt: string;
	updatedAt: string;
	messages: T[];
}
