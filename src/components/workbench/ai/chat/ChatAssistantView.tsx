import { toast } from "@heroui/react";
import { useNavigate } from "@tanstack/react-router";
import {
	forwardRef,
	useCallback,
	useEffect,
	useImperativeHandle,
	useRef,
	useState,
} from "react";
import { type ChatItem, useAiChat } from "../../../../hooks/ai/useAiChat";
import type { ChatDraftPayload } from "../../../../hooks/ai/useChatMessages";
import { useChatScope } from "../../../../hooks/ai/useChatScope";
import { useItemFolderAssign } from "../../../../hooks/ai/useItemFolderAssign";
import { getAiContribution } from "../../../../modules/ai-contributions";
import { fetchSkillDetail } from "../../../../services/api/skillsClient";
import {
	workbenchContextActions,
	workbenchContextStore,
} from "../../../../stores/workbenchContextStore";
import type { ChatContextItem } from "../../../../types/chatContext";
import type { PageBridge } from "../../../../types/pageBridge";
import type {
	Category,
	Folder,
	SearchResultItem,
	WorkbenchSettings,
} from "../../types";
import { CATEGORIES } from "../../types";
import { ItemFolderAssignPopover } from "../shared/ItemFolderAssignPopover";
import { ChatHistoryDrawer } from "./ChatHistoryDrawer";
import { ChatInputArea } from "./ChatInputArea";
import { ChatMessageList } from "./ChatMessageList";
import { resolveActionTarget } from "./proposal/resolveActionTarget";
import {
	matchRewritePipelineIntent,
	REWRITE_ACTION_IDS,
	REWRITE_ACTION_LABELS,
	type RewriteIntent,
} from "./rewriteIntent";

export interface ChatAssistantViewRef {
	sendPrompt: (
		prompt: string,
		options?: {
			newChat?: boolean;
			folderId?: number | null;
			folderName?: string;
			contextItems?: ChatContextItem[];
			module?: string;
			activeDocumentId?: number | null;
			activeNotePath?: string | null;
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
	createNewChat: () => void;
	openHistory: () => void;
}

export interface ChatAssistantViewProps {
	selectedFolder?: Folder | null;
	activeModule?: string;
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
 * Load SKILL.md content for skill-type context items.
 * Non-skill items are passed through unchanged.
 */
async function resolveSkillContextItems(
	items: ChatContextItem[],
): Promise<ChatContextItem[]> {
	const resolved: ChatContextItem[] = [];
	for (const item of items) {
		if (item.type === "skill" && item.data?.dirPath && !item.data?.content) {
			try {
				const detail = await fetchSkillDetail(item.data.dirPath as string);
				if (detail?.markdown) {
					resolved.push({
						...item,
						subtitle: "已加载技能指南 (SKILL.md)",
						data: {
							...item.data,
							content: detail.markdown,
						},
					});
					continue;
				}
			} catch (err) {
				console.warn("[ChatAssistantView] Error loading skill:", err);
			}
		}
		resolved.push(item);
	}
	return resolved;
}

/**
 * Chat and Knowledge Q&A Assistant View.
 * Encapsulates the conversation loop, context references, bridge rewrite pipelines, and folder assignments.
 */
export const ChatAssistantView = forwardRef<
	ChatAssistantViewRef,
	ChatAssistantViewProps
>(function ChatAssistantView(
	{
		selectedFolder,
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
	const [isHistoryOpen, setIsHistoryOpen] = useState(false);
	const navigate = useNavigate();

	// Timer for pending cross-module actions
	const pendingActionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
		null,
	);

	// Clear expiration timer when action is consumed; cleanup on unmount
	useEffect(() => {
		const subscription = workbenchContextStore.subscribe(() => {
			if (
				!workbenchContextStore.state.pendingAction &&
				pendingActionTimerRef.current
			) {
				clearTimeout(pendingActionTimerRef.current);
				pendingActionTimerRef.current = null;
			}
		});
		return () => {
			subscription.unsubscribe();
			if (pendingActionTimerRef.current) {
				clearTimeout(pendingActionTimerRef.current);
				pendingActionTimerRef.current = null;
			}
		};
	}, []);

	// Contextual scope management (global ⇄ scoped folder)
	const {
		activeScope,
		toggleScope: handleToggleScope,
		isFolderScoped,
	} = useChatScope({
		activeModule,
		selectedFolder,
		scopeMode,
		onToggleFolderScope: () =>
			setScopeMode((prev) => (prev === "global" ? "folder" : "global")),
	});

	// In-Chat Folder Assignment Hook
	const folderAssign = useItemFolderAssign({
		onDataChanged,
	});

	/**
	 * Run streaming rewrite pipeline via PageBridge.
	 * Returns false if current page has no matching rewrite action.
	 */
	const runBridgeRewriteAction = (
		intent: RewriteIntent,
		instruction?: string,
		skillGuidance?: string,
	): boolean => {
		const actions = pageBridge?.actions ?? [];
		const rewriteAct =
			actions.find((a) => a.id === REWRITE_ACTION_IDS[intent]) ??
			actions.find((a) => a.id === "stream_full_rewrite") ??
			actions.find((a) => a.id === "stream_spin_rewrite");
		if (!rewriteAct) return false;
		const trimmed = instruction?.trim();
		const guidance = skillGuidance?.trim();
		const payload =
			trimmed && guidance
				? `${trimmed}\n补充要求（Skill 指南）：\n${guidance}`
				: guidance && !trimmed
					? `补充要求（Skill 指南）：\n${guidance}`
					: (trimmed ?? "");
		void rewriteAct.onAction(payload);
		return true;
	};

	// Conversational RAG Chat Hook with Session Management
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
		setMessages,
		contextItems,
		addContextItem,
		addContextItems,
		removeContextItem,
		clearContextItems,
	} = useAiChat({
		onDataMutated: () => {
			onDataChanged?.();
		},
		onTriggerRewritePipeline: (instruction) => {
			const intent = instruction
				? (matchRewritePipelineIntent(instruction) ?? "polish")
				: "polish";
			runBridgeRewriteAction(intent, instruction);
		},
		onCanvasAction: (toolName, args, _navigation) => {
			if (toolName === "draft_excalidraw" || toolName === "draft_canvas") {
				return;
			}
			const act = pageBridge?.actions.find((a) => a.id === toolName);
			if (act) {
				void act.onAction(
					typeof args === "string" ? args : JSON.stringify(args),
				);
			} else {
				console.warn(
					"[ChatAssistantView onCanvasAction] No matching bridge action found for:",
					toolName,
				);
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
			activeNotePath?: string | null;
		},
	) => {
		const effectivePrompt = (prompt ?? input).trim();
		if (effectivePrompt) {
			const mergedContextItems =
				options?.contextItems !== undefined
					? options.contextItems
					: contextItems;
			const skillItems = mergedContextItems.filter((i) => i.type === "skill");
			const resolution = resolveActionTarget({
				prompt: effectivePrompt,
				skillContextItems: skillItems,
				pageBridge,
				contextItems: mergedContextItems.filter((i) => i.type !== "skill"),
			});
			if (resolution.kind === "direct") {
				const intent = matchRewritePipelineIntent(effectivePrompt) ?? "polish";
				if (runBridgeRewriteAction(intent, effectivePrompt)) {
					setInput("");
					toast.success("已启动双栏比对流水线，右栏实时生成中…");
					return;
				}
			} else if (resolution.kind === "proposal") {
				const intent = matchRewritePipelineIntent(effectivePrompt) ?? "polish";
				const timeStr = new Date().toLocaleTimeString([], {
					hour: "2-digit",
					minute: "2-digit",
				});
				setMessages((prev) => [
					...prev,
					{
						role: "user",
						content: effectivePrompt,
						contextItems:
							mergedContextItems.length > 0 ? mergedContextItems : undefined,
						timestamp: timeStr,
					},
					{
						role: "assistant",
						content: "",
						timestamp: timeStr,
						proposal: {
							id: `proposal_${Date.now()}`,
							target: resolution.target,
							actionId: resolution.actionId,
							executionForm: resolution.executionForm,
							actionLabel: REWRITE_ACTION_LABELS[intent],
							instruction: effectivePrompt,
							skillGuidance: resolution.skillGuidance,
							status: "pending",
						},
					},
				]);
				setInput("");
				if (options?.contextItems === undefined) {
					clearContextItems();
				}
				return;
			}
		}

		// Flush any pending unsaved document changes so AI reads full up-to-date text
		if (pageBridge?.flushSave) {
			try {
				await pageBridge.flushSave();
			} catch (err) {
				console.warn("[ChatAssistantView] flushSave failed:", err);
			}
		}

		const folderScope =
			isFolderScoped && selectedFolder
				? { folderId: selectedFolder.id, folderName: selectedFolder.name }
				: undefined;

		const storeState = workbenchContextStore.state;
		const effectiveModule =
			options?.module ??
			pageBridge?.module ??
			activeModule ??
			storeState.activeModule;
		const rawDocId =
			pageBridge?.activeDocumentId ?? storeState.activeDocument?.id;
		const isDocDetached =
			rawDocId != null && storeState.detachedDocumentId === rawDocId;
		const effectiveDocId =
			options?.activeDocumentId !== undefined
				? options.activeDocumentId
				: isDocDetached
					? undefined
					: (rawDocId ?? undefined);

		const rawNotePath =
			pageBridge?.activeNotePath ?? storeState.activeNote?.path;
		const isNoteDetached =
			rawNotePath != null && storeState.detachedNotePath === rawNotePath;
		const effectiveNotePath =
			options?.activeNotePath !== undefined
				? options.activeNotePath
				: isNoteDetached
					? undefined
					: (rawNotePath ?? undefined);

		sendPrompt(prompt, {
			...folderScope,
			module: effectiveModule,
			activeDocumentId: effectiveDocId,
			activeNotePath: effectiveNotePath,
			...options,
		});
	};

	/** Confirm proposal card */
	const handleConfirmProposal = (index: number) => {
		const msg = messages[index];
		const proposal = msg?.proposal;
		if (!proposal || proposal.status !== "pending") return;

		const bridgeTargetPath =
			proposal.target.kind === "note"
				? pageBridge?.activeNotePath
				: pageBridge?.activeDocumentId;
		const proposalTargetId =
			proposal.target.kind === "note"
				? proposal.target.notePath
				: proposal.target.documentId;
		const bridgeModuleOwnsTarget =
			pageBridge?.module === proposal.target.module ||
			(pageBridge?.module === "editor" && proposal.target.module === "creator");

		workbenchContextActions.setPendingAction({
			targetObject: proposal.target,
			actionId: proposal.actionId,
			payload: proposal.skillGuidance
				? `${proposal.instruction ?? ""}\n补充要求（Skill 指南）：\n${proposal.skillGuidance}`
				: proposal.instruction,
		});

		setMessages((prev) =>
			prev.map((m, i) =>
				i === index && m.proposal
					? { ...m, proposal: { ...m.proposal, status: "confirmed" } }
					: m,
			),
		);

		if (
			bridgeModuleOwnsTarget &&
			bridgeTargetPath != null &&
			bridgeTargetPath === proposalTargetId
		) {
			consumePendingActionOnPage();
			toast.success("已启动双栏比对流水线，右栏实时生成中…");
			return;
		}

		if (pendingActionTimerRef.current) {
			clearTimeout(pendingActionTimerRef.current);
		}
		pendingActionTimerRef.current = setTimeout(() => {
			pendingActionTimerRef.current = null;
			if (workbenchContextStore.state.pendingAction) {
				workbenchContextActions.setPendingAction(null);
				toast.warning("目标页面未及时响应，动作未能启动，请重试");
			}
		}, 60_000);

		if (proposal.target.kind === "note") {
			void navigate({
				to: "/obsidian",
				search: { note: proposal.target.notePath },
			});
		} else {
			void navigate({
				to: "/creator/studio",
				search: {
					mode: "doc",
					doc: proposal.target.documentId,
				},
			});
		}
	};

	/** Dismiss proposal card */
	const handleDismissProposal = (index: number) => {
		setMessages((prev) =>
			prev.map((m, i) =>
				i === index && m.proposal
					? { ...m, proposal: { ...m.proposal, status: "dismissed" } }
					: m,
			),
		);
	};

	/** Handle draft status change */
	const handleDraftStatusChange = useCallback(
		(index: number, updated: ChatDraftPayload) => {
			setMessages((prev) =>
				prev.map((m, i) => (i === index ? { ...m, draft: updated } : m)),
			);
		},
		[setMessages],
	);

	/** Consume pending action on active page */
	const consumePendingActionOnPage = () => {
		const pending = workbenchContextActions.consumePendingAction();
		if (!pending) return;
		const act = pageBridge?.actions.find((a) => a.id === pending.actionId);
		if (act) {
			void act.onAction(pending.payload ?? "");
		} else {
			toast.warning("当前页面未注册对应的改写动作");
		}
	};

	const resolvedModule = pageBridge?.module ?? activeModule;
	const moduleContribution = getAiContribution(resolvedModule);

	// Expose methods for parent components
	useImperativeHandle(ref, () => ({
		sendPrompt: (
			prompt: string,
			options?: {
				newChat?: boolean;
				folderId?: number | null;
				folderName?: string;
				contextItems?: ChatContextItem[];
				module?: string;
				activeDocumentId?: number | null;
				activeNotePath?: string | null;
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
		createNewChat,
		openHistory: () => setIsHistoryOpen(true),
	}));

	return (
		<div className={`flex-1 min-h-0 flex flex-col ${className}`}>
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
				activeModule={resolvedModule}
				onSelectPrompt={(p) => handleSendPrompt(p)}
				folders={folders}
				onNavigateToFolder={onNavigateToFolder}
				onConfirmProposal={handleConfirmProposal}
				onDismissProposal={handleDismissProposal}
				onDraftStatusChange={handleDraftStatusChange}
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

			{/* Bottom Input Area with Top Action Bar */}
			<ChatInputArea
				input={input}
				isLoading={isLoading}
				hasMessages={messages.length > 0}
				inputRef={inputRef}
				onChangeInput={setInput}
				onSend={async (extraContextItems, promptText) => {
					let resolvedItems = extraContextItems;
					if (extraContextItems && extraContextItems.length > 0) {
						resolvedItems = await resolveSkillContextItems(extraContextItems);
					}
					handleSendPrompt(promptText, {
						contextItems: resolvedItems
							? [...contextItems, ...resolvedItems]
							: undefined,
					});
				}}
				onStop={stopChat}
				onOpenHistory={() => setIsHistoryOpen(true)}
				onNewChat={createNewChat}
				onClearHistory={clearHistory}
				model={settings?.model}
				activeScope={activeScope}
				onToggleScope={handleToggleScope}
				contextItems={contextItems}
				folders={folders}
				onRemoveContextItem={removeContextItem}
				onClearContextItems={clearContextItems}
				onAttachContextItem={addContextItem}
				onAttachContextItems={addContextItems}
				onNavigateToFolder={onNavigateToFolder}
			/>

			{/* In-sidebar chat history drawer */}
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
		</div>
	);
});
