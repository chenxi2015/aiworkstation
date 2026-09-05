import {
	Bot,
	Folder as FolderIcon,
	Globe,
	Search,
	Sparkles,
} from "lucide-react";
import {
	forwardRef,
	useEffect,
	useImperativeHandle,
	useRef,
	useState,
} from "react";
import { useAiChat } from "../../../../hooks/ai/useAiChat";
import { useEmbeddingStats } from "../../../../hooks/ai/useEmbeddingStats";
import { useItemFolderAssign } from "../../../../hooks/ai/useItemFolderAssign";
import type {
	Category,
	Folder,
	SearchResultItem,
	WorkbenchSettings,
} from "../../types";
import { CATEGORIES } from "../../types";
import { SearchTabContent } from "../search/SearchTabContent";
import { EmbeddingStatusWidget } from "../shared/EmbeddingStatusWidget";
import { ItemFolderAssignPopover } from "../shared/ItemFolderAssignPopover";
import { ChatHistoryDrawer } from "./ChatHistoryDrawer";
import { ChatInputArea } from "./ChatInputArea";
import { ChatMessageList } from "./ChatMessageList";

export interface ChatWithBookmarksPanelRef {
	sendPrompt: (
		prompt: string,
		options?: {
			newChat?: boolean;
			folderId?: number | null;
			folderName?: string;
		},
	) => void;
	focusInput: () => void;
	openSearchTab: () => void;
	openChatTab: (
		prompt?: string,
		options?: {
			newChat?: boolean;
			folderId?: number | null;
			folderName?: string;
		},
	) => void;
}

export interface ChatWithBookmarksPanelProps {
	selectedFolder?: Folder | null;
	activeCategory?: Category;
	folders?: Folder[];
	categories?: string[];
	settings?: WorkbenchSettings;
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
		activeCategory,
		folders = [],
		categories = CATEGORIES as unknown as string[],
		settings,
		onNavigateToFolder,
		onDataChanged,
		className = "",
	},
	ref,
) {
	const [activeTab, setActiveTab] = useState<"search" | "chat">("chat");
	const [scopeMode, setScopeMode] = useState<"global" | "folder">("global");
	const messagesEndRef = useRef<HTMLDivElement | null>(null);
	const inputRef = useRef<HTMLTextAreaElement | null>(null);
	const [isHistoryOpen, setIsHistoryOpen] = useState<boolean>(false);

	// 1. Vector Index Embedding Stats Hook
	const { stats, isIndexing, buildIndex, fetchStats } = useEmbeddingStats();

	// 2. In-Chat Folder Assignment Hook
	const folderAssign = useItemFolderAssign({
		onDataChanged,
	});

	// 3. Conversational RAG Chat Hook with Session Management
	const {
		messages,
		sessions,
		currentSessionId,
		input,
		isLoading,
		setInput,
		sendPrompt,
		stopChat,
		editAndResendMessage,
		editMessage,
		resendMessage,
		deleteMessage,
		deleteMessages,
		createNewChat,
		loadSession,
		deleteSession,
		clearAllSessions,
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

	// Helper to send prompts with active scope options
	const handleSendPrompt = (
		prompt?: string,
		options?: {
			newChat?: boolean;
			folderId?: number | null;
			folderName?: string;
		},
	) => {
		const folderScope =
			scopeMode === "folder" && selectedFolder
				? { folderId: selectedFolder.id, folderName: selectedFolder.name }
				: undefined;

		sendPrompt(prompt, {
			...folderScope,
			...options,
		});
	};

	// Auto scroll to bottom on new messages or loading state
	// biome-ignore lint/correctness/useExhaustiveDependencies: scroll triggered on message update
	useEffect(() => {
		messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
	}, [messages, isLoading]);

	// Expose methods for parent components
	useImperativeHandle(ref, () => ({
		sendPrompt: (
			prompt: string,
			options?: {
				newChat?: boolean;
				folderId?: number | null;
				folderName?: string;
			},
		) => {
			setActiveTab("chat");
			handleSendPrompt(prompt, options);
		},
		focusInput: () => {
			if (activeTab === "chat") {
				inputRef.current?.focus();
			}
		},
		openSearchTab: () => {
			setActiveTab("search");
		},
		openChatTab: (
			prompt?: string,
			options?: {
				newChat?: boolean;
				folderId?: number | null;
				folderName?: string;
			},
		) => {
			setActiveTab("chat");
			if (prompt) {
				handleSendPrompt(prompt, options);
			} else {
				if (options?.newChat) {
					createNewChat();
				}
				setTimeout(() => inputRef.current?.focus(), 50);
			}
		},
	}));

	return (
		<aside
			className={`w-[380px] xl:w-[440px] 2xl:w-[480px] shrink-0 bg-surface/95 backdrop-blur-md border-l border-border flex flex-col h-full shadow-xs relative ${className}`}
		>
			{/* Top Header: Title & Embedding Status Widget */}
			<div className="p-3 border-b border-border/80 bg-surface-secondary/30 shrink-0 flex flex-col gap-2">
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-2">
						<div className="w-6 h-6 rounded-lg bg-accent text-accent-foreground flex items-center justify-center text-xs shadow-xs font-bold">
							<Sparkles className="w-3.5 h-3.5" />
						</div>
						<h3 className="font-bold text-xs text-foreground tracking-tight">
							AI 知识中心与检索
						</h3>
					</div>

					{/* Scope Switcher: defaults to Global */}
					{selectedFolder ? (
						<div className="inline-flex items-center p-0.5 rounded-lg bg-surface-secondary border border-border/80 text-[10px] shadow-2xs">
							<button
								type="button"
								onClick={() => setScopeMode("global")}
								className={`px-2 py-0.5 rounded-md transition-all font-medium flex items-center gap-1 cursor-pointer ${
									scopeMode === "global"
										? "bg-surface text-accent shadow-xs font-semibold border border-border/60"
										: "text-muted hover:text-foreground"
								}`}
								title="全库所有书签与资产"
							>
								<Globe className="w-2.5 h-2.5 shrink-0" />
								<span>全局</span>
							</button>
							<button
								type="button"
								onClick={() => setScopeMode("folder")}
								className={`px-2 py-0.5 rounded-md transition-all font-medium flex items-center gap-1 cursor-pointer max-w-[120px] truncate ${
									scopeMode === "folder"
										? "bg-surface text-accent shadow-xs font-semibold border border-border/60"
										: "text-muted hover:text-foreground"
								}`}
								title={`限定在此文件夹: ${selectedFolder.name}`}
							>
								<FolderIcon className="w-2.5 h-2.5 shrink-0" />
								<span className="truncate">{selectedFolder.name}</span>
							</button>
						</div>
					) : (
						<span className="inline-flex items-center gap-1 text-[10px] text-muted bg-surface-secondary/60 px-2 py-0.5 rounded-md border border-border/50">
							<Globe className="w-2.5 h-2.5 text-muted" />
							全局资产
						</span>
					)}
				</div>

				{/* Shared Vector Embedding Status Widget */}
				<EmbeddingStatusWidget
					stats={stats}
					isIndexing={isIndexing}
					onBuildIndex={buildIndex}
					compact={true}
				/>

				{/* Segmented Tab Switcher */}
				<div className="flex items-center p-0.5 bg-surface-secondary/80 rounded-xl border border-border/60 mt-0.5">
					<button
						type="button"
						onClick={() => setActiveTab("search")}
						className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
							activeTab === "search"
								? "bg-surface text-accent shadow-xs border border-border/80 font-semibold"
								: "text-muted hover:text-foreground"
						}`}
					>
						<Search className="w-3.5 h-3.5" />
						<span>极速检索</span>
					</button>
					<button
						type="button"
						onClick={() => setActiveTab("chat")}
						className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
							activeTab === "chat"
								? "bg-surface text-accent shadow-xs border border-border/80 font-semibold"
								: "text-muted hover:text-foreground"
						}`}
					>
						<Bot className="w-3.5 h-3.5" />
						<span>AI 问答</span>
					</button>
				</div>
			</div>

			{/* Tab Body: keep both tabs mounted and toggle visibility so that
				switching tabs never resets search state or chat scroll position */}
			<div
				className={
					activeTab === "search" ? "flex-1 min-h-0 flex flex-col" : "hidden"
				}
			>
				<SearchTabContent
					folders={folders}
					categories={categories}
					selectedFolder={selectedFolder}
					activeCategory={activeCategory}
					scopeMode={scopeMode}
					onNavigateToFolder={onNavigateToFolder}
					onTransferToAiChat={(query) => {
						setActiveTab("chat");
						handleSendPrompt(
							`请根据我的书签库，深入分析与「${query}」相关的核心工具与最佳使用方案。`,
						);
					}}
					onDataChanged={onDataChanged}
				/>
			</div>
			<div
				className={
					activeTab === "chat" ? "flex-1 min-h-0 flex flex-col" : "hidden"
				}
			>
				{/* Message History & Cards */}
				<ChatMessageList
					messages={messages}
					isLoading={isLoading}
					selectedFolder={selectedFolder}
					selectedRefKeys={folderAssign.selectedItemKeys}
					messagesEndRef={messagesEndRef}
					onEditAndResend={editAndResendMessage}
					onEditOnly={editMessage}
					onResend={resendMessage}
					onDelete={deleteMessage}
					onDeleteMessages={deleteMessages}
					onToggleRefCheck={folderAssign.toggleSelectItem}
					onToggleSelectGroup={folderAssign.toggleSelectGroup}
					onOpenAssignSingle={folderAssign.openAssignSingle}
					onOpenAssignMultiple={folderAssign.openAssignMultiple}
					onSelectPrompt={(p) => handleSendPrompt(p)}
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

				{/* History Sessions Slide-over Drawer */}
				<ChatHistoryDrawer
					isOpen={isHistoryOpen}
					sessions={sessions}
					currentSessionId={currentSessionId}
					onClose={() => setIsHistoryOpen(false)}
					onSelectSession={loadSession}
					onNewChat={createNewChat}
					onDeleteSession={deleteSession}
					onClearAllSessions={clearAllSessions}
				/>

				{/* Bottom Input Area with Top Action Bar */}
				<ChatInputArea
					input={input}
					isLoading={isLoading}
					hasMessages={messages.length > 0}
					inputRef={inputRef}
					onChangeInput={setInput}
					onSend={() => handleSendPrompt()}
					onStop={stopChat}
					onOpenHistory={() => setIsHistoryOpen(true)}
					onNewChat={createNewChat}
					onClearHistory={clearHistory}
					model={settings?.model}
					scopeMode={scopeMode}
					selectedFolder={selectedFolder}
					onToggleScope={() =>
						setScopeMode((prev) => (prev === "global" ? "folder" : "global"))
					}
				/>
			</div>
		</aside>
	);
});
