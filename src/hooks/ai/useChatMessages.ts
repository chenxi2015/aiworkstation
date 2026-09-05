import { toast } from "@heroui/react";
import { useCallback, useEffect, useState } from "react";
import type {
	Category,
	Folder,
	SearchResultItem,
} from "../../components/workbench/types";
import { WorkbenchStorageService } from "../../services/workbenchStorage";

export interface ChatItem {
	role: "user" | "assistant";
	content: string;
	references?: SearchResultItem[];
	timestamp?: string;
}

export interface UseChatMessagesProps {
	onMessagesChange?: (messages: ChatItem[]) => void;
}

/**
 * Sub-hook for managing the active chat message list, editing, deletion, and reference mutations
 */
export function useChatMessages(props?: UseChatMessagesProps) {
	const [messages, setMessages] = useState<ChatItem[]>([]);

	// Load initial messages from localStorage on mount
	useEffect(() => {
		try {
			const saved = WorkbenchStorageService.getChatHistory<ChatItem>();
			if (saved && Array.isArray(saved) && saved.length > 0) {
				setMessages(saved);
			}
		} catch (e) {
			console.error("[useChatMessages] Failed to load chat history:", e);
		}
	}, []);

	// Sync with parent session manager whenever messages change
	const onMessagesChange = props?.onMessagesChange;
	useEffect(() => {
		if (messages.length > 0) {
			onMessagesChange?.(messages);
		}
	}, [messages, onMessagesChange]);

	// Update content of an existing message without re-querying AI
	const editMessage = useCallback(
		(index: number, newContent: string) => {
			const trimmed = newContent.trim();
			if (!trimmed) return;
			setMessages((prev) =>
				prev.map((m, i) => (i === index ? { ...m, content: trimmed } : m)),
			);
			toast.success("已更新消息内容");
		},
		[],
	);

	// Delete multiple messages by indices
	const deleteMessages = useCallback((indices: number[] | Set<number>) => {
		const indexSet = indices instanceof Set ? indices : new Set(indices);
		if (indexSet.size === 0) return;
		setMessages((prev) => prev.filter((_, i) => !indexSet.has(i)));
		toast.success(`已删除 ${indexSet.size} 条消息`);
	}, []);

	// Delete a single message
	const deleteMessage = useCallback(
		(index: number) => {
			deleteMessages([index]);
		},
		[deleteMessages],
	);

	// Update reference cards in messages when bookmarks are relocated
	const updateMessageReferences = useCallback(
		(movedItems: SearchResultItem[], targetFolder: Folder) => {
			const movedKeys = new Set(movedItems.map((i) => i.id || i.url));
			setMessages((prev) =>
				prev.map((msg) => {
					if (!msg.references) return msg;
					return {
						...msg,
						references: msg.references.map((r) => {
							if (movedKeys.has(r.id || r.url)) {
								return {
									...r,
									folderId: targetFolder.id,
									folderName: targetFolder.name,
									category: targetFolder.category as Category,
								};
							}
							return r;
						}),
					};
				}),
			);
		},
		[],
	);

	return {
		messages,
		setMessages,
		editMessage,
		deleteMessage,
		deleteMessages,
		updateMessageReferences,
	};
}
