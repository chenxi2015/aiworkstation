import { toast } from "@heroui/react";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
	Category,
	Folder,
	SearchResultItem,
} from "../../components/workbench/types";
import type { AgentStep } from "../../types/agent.ts";
import type { ChatContextItem } from "../../types/chatContext.ts";

export type { AgentStep };

export interface ChatItem {
	role: "user" | "assistant";
	content: string;
	references?: SearchResultItem[];
	steps?: AgentStep[];
	contextItems?: ChatContextItem[];
	isStreaming?: boolean;
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
	const isExternalLoadRef = useRef(false);

	// Load messages externally (e.g. from history or on page mount) without syncing back to storage
	const loadMessages = useCallback((msgs: ChatItem[]) => {
		isExternalLoadRef.current = true;
		setMessages(msgs);
	}, []);

	// Sync with parent session manager whenever user messages change (excluding external loads)
	const onMessagesChange = props?.onMessagesChange;
	useEffect(() => {
		if (isExternalLoadRef.current) {
			isExternalLoadRef.current = false;
			return;
		}

		if (messages.length === 0) return;

		const isStreaming = messages.some((m) => m.isStreaming);
		if (!isStreaming) {
			// Finished streaming or standard edit, sync immediately
			onMessagesChange?.(messages);
			return;
		}

		// During streaming, debounce sync to avoid writing to storage on every token chunk
		const timer = setTimeout(() => {
			onMessagesChange?.(messages);
		}, 1000);

		return () => clearTimeout(timer);
	}, [messages, onMessagesChange]);

	// Update content of an existing message without re-querying AI
	const editMessage = useCallback((index: number, newContent: string) => {
		const trimmed = newContent.trim();
		if (!trimmed) return;
		setMessages((prev) =>
			prev.map((m, i) => (i === index ? { ...m, content: trimmed } : m)),
		);
		toast.success("已更新消息内容");
	}, []);

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
		loadMessages,
		editMessage,
		deleteMessage,
		deleteMessages,
		updateMessageReferences,
	};
}
