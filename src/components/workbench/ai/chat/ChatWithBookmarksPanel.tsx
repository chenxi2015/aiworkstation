import {
	forwardRef,
	useEffect,
	useImperativeHandle,
	useRef,
} from "react";
import { Sparkles } from "lucide-react";
import { useAiChat } from "../../../../hooks/ai/useAiChat";
import { useEmbeddingStats } from "../../../../hooks/ai/useEmbeddingStats";
import { useItemFolderAssign } from "../../../../hooks/ai/useItemFolderAssign";
import type { Category, Folder, SearchResultItem } from "../../types";
import { CATEGORIES } from "../../types";
import { EmbeddingStatusWidget } from "../shared/EmbeddingStatusWidget";
import { ItemFolderAssignPopover } from "../shared/ItemFolderAssignPopover";
import { ChatInputArea } from "./ChatInputArea";
import { ChatMessageList } from "./ChatMessageList";

export interface ChatWithBookmarksPanelRef {
	sendPrompt: (prompt: string) => void;
	focusInput: () => void;
}

export interface ChatWithBookmarksPanelProps {
	selectedFolder?: Folder | null;
	folders?: Folder[];
	categories?: string[];
	onNavigateToFolder?: (folderId: number | null, category?: Category) => void;
	onDataChanged?: () => void;
	className?: string;
}

/**
 * Modular Right-side AI Search & Knowledge Q&A Central Hub
 */
export const ChatWithBookmarksPanel = forwardRef<
	ChatWithBookmarksPanelRef,
	ChatWithBookmarksPanelProps
>(function ChatWithBookmarksPanel(
	{
		selectedFolder,
		folders = [],
		categories = CATEGORIES as unknown as string[],
		onNavigateToFolder,
		onDataChanged,
		className = "",
	},
	ref,
) {
	const messagesEndRef = useRef<HTMLDivElement | null>(null);
	const inputRef = useRef<HTMLTextAreaElement | null>(null);

	// 1. Vector Index Embedding Stats Hook
	const { stats, isIndexing, buildIndex, fetchStats } = useEmbeddingStats();

	// 2. In-Chat Folder Assignment Hook
	const folderAssign = useItemFolderAssign({
		onDataChanged,
	});

	// 3. Conversational RAG Chat Hook
	const {
		messages,
		input,
		isLoading,
		setInput,
		sendPrompt,
		clearHistory,
		updateMessageReferences,
	} = useAiChat({
		onResponseReceived: () => {
			fetchStats();
		},
		onDataMutated: () => {
			onDataChanged?.();
		},
	});

	// Auto scroll to bottom on new messages or loading state
	useEffect(() => {
		messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
	}, [messages, isLoading]);

	// Expose methods for parent components
	useImperativeHandle(ref, () => ({
		sendPrompt: (prompt: string) => {
			sendPrompt(prompt);
		},
		focusInput: () => {
			inputRef.current?.focus();
		},
	}));

	return (
		<aside
			className={`w-[320px] xl:w-[360px] 2xl:w-[400px] shrink-0 bg-surface/95 backdrop-blur-md border-l border-border flex flex-col h-[calc(100vh-60px)] sticky top-[60px] shadow-xs relative ${className}`}
		>
			{/* Top Header: Title & Embedding Status Widget */}
			<div className="p-3.5 border-b border-border/80 bg-surface-secondary/30 shrink-0 flex flex-col gap-2">
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-2">
						<div className="w-6 h-6 rounded-lg bg-accent text-accent-foreground flex items-center justify-center text-xs shadow-xs font-bold">
							<Sparkles className="w-3.5 h-3.5" />
						</div>
						<h3 className="font-bold text-xs text-foreground tracking-tight">
							AI 搜索与知识问答
						</h3>
					</div>
					<span className="text-[10px] text-muted">
						{selectedFolder ? `当前范围: ${selectedFolder.name}` : "全局资产"}
					</span>
				</div>

				{/* Shared Vector Embedding Status Widget */}
				<EmbeddingStatusWidget
					stats={stats}
					isIndexing={isIndexing}
					onBuildIndex={buildIndex}
					compact={true}
				/>
			</div>

			{/* Message History & Cards */}
			<ChatMessageList
				messages={messages}
				isLoading={isLoading}
				selectedFolder={selectedFolder}
				selectedRefKeys={folderAssign.selectedItemKeys}
				messagesEndRef={messagesEndRef}
				onToggleRefCheck={folderAssign.toggleSelectItem}
				onOpenAssignSingle={folderAssign.openAssignSingle}
				onOpenAssignMultiple={folderAssign.openAssignMultiple}
				onSelectPrompt={(p) => sendPrompt(p)}
				onNavigateToFolder={onNavigateToFolder}
			/>

			{/* Shared In-Place Folder Assignment Drawer */}
			<ItemFolderAssignPopover
				assigningItems={folderAssign.assigningItems}
				folders={folders}
				categories={categories}
				isCreateMode={folderAssign.isCreateMode}
				newFolderName={folderAssign.newFolderName}
				newFolderCategory={folderAssign.newFolderCategory}
				folderFilterQuery={folderAssign.folderFilterQuery}
				isProcessingMove={folderAssign.isProcessingMove}
				onToggleCreateMode={() =>
					folderAssign.setIsCreateMode(!folderAssign.isCreateMode)
				}
				onChangeNewFolderName={folderAssign.setNewFolderName}
				onChangeNewFolderCategory={folderAssign.setNewFolderCategory}
				onChangeFilterQuery={folderAssign.setFolderFilterQuery}
				onClose={folderAssign.closeAssign}
				onMoveToExistingFolder={(targetFolder: Folder) =>
					folderAssign.moveToExistingFolder(
						targetFolder,
						(moved: SearchResultItem[]) => {
							updateMessageReferences(moved, targetFolder);
						},
					)
				}
				onCreateFolderAndMove={() =>
					folderAssign.createFolderAndMove(
						(newFolder: Folder, moved: SearchResultItem[]) => {
							updateMessageReferences(moved, newFolder);
						},
					)
				}
				variant="drawer"
			/>

			{/* Bottom Input Area */}
			<ChatInputArea
				input={input}
				isLoading={isLoading}
				hasMessages={messages.length > 0}
				inputRef={inputRef}
				onChangeInput={setInput}
				onSend={() => sendPrompt()}
				onClearHistory={clearHistory}
			/>
		</aside>
	);
});
