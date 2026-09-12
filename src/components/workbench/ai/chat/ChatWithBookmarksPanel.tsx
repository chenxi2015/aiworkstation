import { Button, Tooltip } from "@heroui/react";
import { History, MessageSquarePlus, Sparkles } from "lucide-react";
import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { type ChatItem, useAiChat } from "../../../../hooks/ai/useAiChat";
import { useItemFolderAssign } from "../../../../hooks/ai/useItemFolderAssign";
import { getAiContribution } from "../../../../modules/ai-contributions";
import { getModuleByCode } from "../../../../modules/registry";
import { workbenchContextStore } from "../../../../stores/workbenchContextStore";
import type { ChatContextItem } from "../../../../types/chatContext";
import type { PageBridge } from "../../../../types/pageBridge";
import type {
	Category,
	Folder,
	SearchResultItem,
	WorkbenchSettings,
} from "../../types";
import { CATEGORIES } from "../../types";
import { ImagePreviewProvider } from "../shared/ImagePreviewModal";
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
	addContextItem: (item: ChatContextItem) => void;
}

export interface ChatWithBookmarksPanelProps {
	selectedFolder?: Folder | null;
	activeCategory?: Category;
	/** 当前所在模块 code（由 AppShell 随路由注入），决定 AI 的模块视角与推荐提问 */
	activeModule?: string;
	/** 当前活动页面注册的能力桥（如创作模块的插入光标/替换选区等动作） */
	pageBridge?: PageBridge | null;
	folders?: Folder[];
	categories?: string[];
	settings?: WorkbenchSettings;
	onNavigateToFolder?: (
		folderId: number | null,
		category?: Category,
		targetItemId?: string | number,
	) => void;
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
		activeCategory: _activeCategory,
		activeModule,
		pageBridge,
		folders = [],
		categories = CATEGORIES as unknown as string[],
		settings,
		onNavigateToFolder,
		onDataChanged,
		className = "",
	},
	ref,
) {
	const [scopeMode, setScopeMode] = useState<"global" | "folder">("global");
	const messagesEndRef = useRef<HTMLDivElement | null>(null);
	const inputRef = useRef<HTMLTextAreaElement | null>(null);
	const [isHistoryOpen, setIsHistoryOpen] = useState<boolean>(false);

	// 1. In-Chat Folder Assignment Hook
	const folderAssign = useItemFolderAssign({
		onDataChanged,
	});

	// 2. Conversational RAG Chat Hook with Session Management
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
		exportAllSessionsToJson,
		exportSessionToJson,
		clearHistory,
		updateMessageReferences,
		contextItems,
		addContextItem,
		removeContextItem,
		clearContextItems,
	} = useAiChat({
		onDataMutated: () => {
			onDataChanged?.();
		},
		onTriggerRewritePipeline: (instruction) => {
			const rewriteAct = pageBridge?.actions.find(
				(a) => a.id === "stream_full_rewrite",
			);
			if (rewriteAct) {
				void rewriteAct.onAction(instruction || "");
			}
		},
	});

	// Helper to send prompts with active scope options
	const handleSendPrompt = async (
		prompt?: string,
		options?: {
			newChat?: boolean;
			folderId?: number | null;
			folderName?: string;
			baseMessages?: ChatItem[];
			contextItems?: ChatContextItem[];
			module?: string;
			activeDocumentId?: number | null;
		},
	) => {
		// Flush any pending unsaved document changes so AI reads full up-to-date text
		if (pageBridge?.flushSave) {
			try {
				await pageBridge.flushSave();
			} catch (err) {
				console.warn("[ChatWithBookmarksPanel] flushSave failed:", err);
			}
		}

		const folderScope =
			scopeMode === "folder" && selectedFolder
				? { folderId: selectedFolder.id, folderName: selectedFolder.name }
				: undefined;

		const storeState = workbenchContextStore.state;
		const effectiveModule =
			options?.module ?? activeModule ?? storeState.activeModule;
		const effectiveDocId =
			options?.activeDocumentId !== undefined
				? options.activeDocumentId
				: (pageBridge?.activeDocumentId ??
					storeState.activeDocument?.id ??
					undefined);

		sendPrompt(prompt, {
			...folderScope,
			module: effectiveModule,
			activeDocumentId: effectiveDocId,
			...options,
		});
	};

	// 当前模块的 AI 贡献包：切换导航时更新推荐提问与（服务端）模块视角
	const moduleContribution = getAiContribution(activeModule);
	const currentModuleDef = activeModule
		? getModuleByCode(activeModule)
		: undefined;
	const currentModuleLabel = currentModuleDef?.label
		? `${currentModuleDef.label}模式`
		: "全库知识";

	// Expose methods for parent components
	useImperativeHandle(ref, () => ({
		sendPrompt: (
			prompt: string,
			options?: {
				newChat?: boolean;
				folderId?: number | null;
				folderName?: string;
				contextItems?: ChatContextItem[];
			},
		) => {
			handleSendPrompt(prompt, options);
		},
		focusInput: () => {
			inputRef.current?.focus();
		},
		openSearchTab: () => {
			inputRef.current?.focus();
			if (!input.trim()) {
				setInput("@");
			}
		},
		openChatTab: (
			prompt?: string,
			options?: {
				newChat?: boolean;
				folderId?: number | null;
				folderName?: string;
			},
		) => {
			if (prompt) {
				handleSendPrompt(prompt, options);
			} else {
				if (options?.newChat) {
					createNewChat();
				}
				setTimeout(() => inputRef.current?.focus(), 50);
			}
		},
		addContextItem: (item: ChatContextItem) => {
			addContextItem(item);
			setTimeout(() => inputRef.current?.focus(), 50);
		},
	}));

	return (
		<ImagePreviewProvider>
			<aside
				data-ai-panel
				className={`w-[380px] xl:w-[440px] 2xl:w-[480px] shrink-0 bg-surface/95 backdrop-blur-md border-l border-border flex flex-col h-full shadow-xs relative ${className}`}
			>
				{/* Top Header: Clean, lightweight single-row header */}
				<div className="h-12 px-3.5 bg-surface/80 backdrop-blur-md shrink-0 flex items-center justify-between z-10">
					<div className="flex items-center gap-2 min-w-0">
						<div className="w-6 h-6 rounded-lg bg-accent text-accent-foreground flex items-center justify-center text-xs shadow-xs font-bold shrink-0">
							<Sparkles className="w-3.5 h-3.5" />
						</div>
						<h3 className="font-bold text-xs text-foreground tracking-tight shrink-0">
							AI 助手
						</h3>
						{/* Current module context badge */}
						<span className="text-[10px] text-muted bg-surface-secondary/80 border border-border/60 px-2 py-0.5 rounded-full truncate max-w-[130px] select-none">
							{currentModuleLabel}
						</span>
					</div>

					{/* Right actions: New Chat & History */}
					<div className="flex items-center gap-1 shrink-0">
						<Tooltip>
							<Tooltip.Trigger>
								<Button
									variant="ghost"
									size="sm"
									isIconOnly
									className="h-7 w-7 p-0 text-muted hover:text-foreground hover:bg-surface-secondary/80 rounded-lg cursor-pointer transition-colors"
									onPress={() => createNewChat()}
									aria-label="新建对话"
								>
									<MessageSquarePlus className="w-3.5 h-3.5" />
								</Button>
							</Tooltip.Trigger>
							<Tooltip.Content className="text-xs py-1 px-2">
								新建对话
							</Tooltip.Content>
						</Tooltip>

						<Tooltip>
							<Tooltip.Trigger>
								<Button
									variant="ghost"
									size="sm"
									isIconOnly
									className="h-7 w-7 p-0 text-muted hover:text-foreground hover:bg-surface-secondary/80 rounded-lg cursor-pointer transition-colors"
									onPress={() => setIsHistoryOpen(true)}
									aria-label="历史对话记录"
								>
									<History className="w-3.5 h-3.5" />
								</Button>
							</Tooltip.Trigger>
							<Tooltip.Content className="text-xs py-1 px-2">
								历史记录
							</Tooltip.Content>
						</Tooltip>
					</div>
				</div>

				{/* Chat Main Body: fills remaining height without tabs */}
				<div className="flex-1 min-h-0 flex flex-col">
					{/* Message History & Cards */}
					<ChatMessageList
						messages={messages}
						isLoading={isLoading}
						pageBridge={pageBridge}
						currentSessionId={currentSessionId}
						selectedFolder={selectedFolder}
						scopeMode={scopeMode}
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
						modulePrompts={moduleContribution.promptSuggestions}
						activeModule={activeModule}
						onSelectPrompt={(p) => handleSendPrompt(p)}
						folders={folders}
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
						onExportAll={exportAllSessionsToJson}
						onExportSession={exportSessionToJson}
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
						contextItems={contextItems}
						folders={folders}
						onRemoveContextItem={removeContextItem}
						onClearContextItems={clearContextItems}
						onAttachContextItem={addContextItem}
						onNavigateToFolder={onNavigateToFolder}
					/>
				</div>
			</aside>
		</ImagePreviewProvider>
	);
});
