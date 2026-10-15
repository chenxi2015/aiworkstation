import { Button, Tooltip, toast } from "@heroui/react";
import { useNavigate } from "@tanstack/react-router";
import { useSelector } from "@tanstack/react-store";
import { History, Loader2, MessageSquarePlus, PanelRightClose } from "lucide-react";
import {
	forwardRef,
	useCallback,
	useEffect,
	useImperativeHandle,
	useRef,
	useState,
} from "react";
import { type ChatItem, useAiChat } from "../../../../hooks/ai/useAiChat";
import { useChatScope } from "../../../../hooks/ai/useChatScope";
import { useItemFolderAssign } from "../../../../hooks/ai/useItemFolderAssign";
import { getAiContribution } from "../../../../modules/ai-contributions";
import { getModuleByCode } from "../../../../modules/registry";
import { fetchSkillDetail } from "../../../../services/api/skillsClient";
import { agentSessionStore } from "../../../../stores/agentSessionStore";
import {
	workbenchContextActions,
	workbenchContextStore,
} from "../../../../stores/workbenchContextStore";
import type { ChatContextItem } from "../../../../types/chatContext";
import type { PageBridge } from "../../../../types/pageBridge";
import { AiAssistantLogoIcon } from "../../Icons";
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
import { resolveActionTarget } from "./proposal/resolveActionTarget";
import {
	matchRewritePipelineIntent,
	REWRITE_ACTION_IDS,
	REWRITE_ACTION_LABELS,
	type RewriteIntent,
} from "./rewriteIntent";
import type { ChatDraftPayload } from "../../../../hooks/ai/useChatMessages";

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
	onCollapse?: () => void;
	panelWidth?: number;
	onResizeStart?: (e: React.MouseEvent) => void;
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
				console.warn("[ChatWithBookmarksPanel] Error loading skill:", err);
			}
		}
		resolved.push(item);
	}
	return resolved;
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
		onCollapse,
		panelWidth,
		onResizeStart,
		className = "",
	},
	ref,
) {
	const [scopeMode, setScopeMode] = useState<"global" | "folder">("global");
	const messagesEndRef = useRef<HTMLDivElement | null>(null);
	const inputRef = useRef<HTMLTextAreaElement | null>(null);
	const [isHistoryOpen, setIsHistoryOpen] = useState<boolean>(false);
	const navigate = useNavigate();

	// Check if there are other background sessions currently running or unread
	const hasBackgroundRunning = useSelector(agentSessionStore, (s) =>
		Object.values(s.sessions).some(
			(session) => session.id !== s.activeSessionId && session.status === "running",
		),
	);
	const hasBackgroundUnread = useSelector(agentSessionStore, (s) =>
		Object.values(s.sessions).some(
			(session) => session.id !== s.activeSessionId && session.hasUnread,
		),
	);
	// 跨模块确认后的过期提醒计时器（pending action 未被目标页面消费时）
	const pendingActionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
		null,
	);
	// pending action 被目标页面消费时清除过期提醒计时器；卸载时兜底清理
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

	// Contextual scope management (global ⇄ scoped folder / document / material)
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

	// 1. In-Chat Folder Assignment Hook
	const folderAssign = useItemFolderAssign({
		onDataChanged,
	});

	/**
	 * 通过 PageBridge 直接启动页面的双栏比对流式改写流水线。
	 * 返回 false 表示当前页面未注册改写动作（调用方应回落到通用 Agent）。
	 * skillGuidance 会作为补充要求段拼入改写 instruction（design D3）。
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
		setMessages,
		contextItems,
		addContextItem,
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
			// console.log("[ChatPanel onCanvasAction]", toolName, args);
			// Board creations are decoupled as drafts and confirmed via DraftDeliveryCard.
			// Skip bridge actions to prevent duplicate file creation race.
			if (
				toolName === "draft_excalidraw" ||
				toolName === "draft_canvas"
			) {
				return;
			}
			const act = pageBridge?.actions.find((a) => a.id === toolName);
			if (act) {
				void act.onAction(
					typeof args === "string" ? args : JSON.stringify(args),
				);
			} else {
				console.warn(
					"[ChatPanel onCanvasAction] No matching bridge action found for:",
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
		// 统一动作提议解析层（design D1/D2）：改写类意图先经过目标对象解析，
		// 产出「直达 / 提议卡片 / 通用 Agent」三种结果之一。
		// 直达只发生在「目标对象就是当前页面打开的对象」的场景；
		// 跨对象、跨模块或携带 skill 时渲染确认卡片，由用户决定。
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
			// kind === "agent"：无可写目标，落入下方通用 Agent 流程
		}

		// Flush any pending unsaved document changes so AI reads full up-to-date text
		if (pageBridge?.flushSave) {
			try {
				await pageBridge.flushSave();
			} catch (err) {
				console.warn("[ChatWithBookmarksPanel] flushSave failed:", err);
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

	/** 提议卡片确认：写入 pending action → 标记卡片 confirmed → 导航到目标模块（task 3.2 / design D4） */
	const handleConfirmProposal = (index: number) => {
		const msg = messages[index];
		const proposal = msg?.proposal;
		if (!proposal || proposal.status !== "pending") return;

		// 目标就是当前页面打开的对象：无需导航，直接执行
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

		// 跨模块导航：目标页面挂载后消费 pending action（含打开目标对象）。
		// 过期提醒由 store 的 subscribe 监听驱动：pending action 被消费时
		// 自动清除；60s 后仍未消费则 toast 提醒（store 侧 TTL 会使其失效）。
		if (pendingActionTimerRef.current) {
			clearTimeout(pendingActionTimerRef.current);
		}
		pendingActionTimerRef.current = setTimeout(() => {
			pendingActionTimerRef.current = null;
			// 仍在槽位里且已过期 → 目标页面未及时消费
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

	/** 提议卡片忽略：仅标记惰性态，不执行、不导航 */
	const handleDismissProposal = (index: number) => {
		setMessages((prev) =>
			prev.map((m, i) =>
				i === index && m.proposal
					? { ...m, proposal: { ...m.proposal, status: "dismissed" } }
					: m,
			),
		);
	};

	/** 草稿卡片状态更新：更新指定消息的 draft 负载 */
	const handleDraftStatusChange = useCallback(
		(index: number, updated: ChatDraftPayload) => {
			setMessages((prev) =>
				prev.map((m, i) =>
					i === index ? { ...m, draft: updated } : m,
				),
			);
		},
		[setMessages],
	);

	/** 在当前页面消费 pending action（确认后目标已在当前页面时） */
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

	// 当前模块的 AI 贡献包：切换导航时更新推荐提问与（服务端）模块视角
	// 页面桥接（如创作台内嵌的富文本编辑器）优先于路由模块：
	// 「创作」板块创作台编辑态下，AI 以 editor 写作人格工作。
	const resolvedModule = pageBridge?.module ?? activeModule;
	const moduleContribution = getAiContribution(resolvedModule);
	const currentModuleDef = resolvedModule
		? getModuleByCode(resolvedModule)
		: undefined;
	const currentModuleLabel = currentModuleDef?.label
		? `${currentModuleDef.label}模式`
		: resolvedModule === "editor"
			? "创作台模式"
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
				style={panelWidth ? { width: `${panelWidth}px` } : undefined}
				className={`${panelWidth ? "" : "w-[380px] xl:w-[440px] 2xl:w-[480px]"} shrink-0 bg-surface/95 backdrop-blur-md border-l border-border flex flex-col h-full shadow-xs relative ${className}`}
			>
				{/* Drag resize handle on left border */}
				{onResizeStart && (
					// biome-ignore lint/a11y/noStaticElementInteractions: ai panel resize handle
					<div
						onMouseDown={onResizeStart}
						className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-zinc-400/50 active:bg-zinc-500 transition-colors z-20 select-none"
						title="拖拽调整 AI 助手宽度"
					/>
				)}

				{/* Top Header: Clean, lightweight single-row header */}
				<div className="h-12 px-3.5 bg-surface/80 backdrop-blur-md shrink-0 flex items-center justify-between z-10 window-drag-region select-none">
					<div className="flex items-center gap-2 min-w-0 window-no-drag">
						<AiAssistantLogoIcon className="w-6 h-6 shrink-0" />
						<h3 className="font-bold text-xs text-foreground tracking-tight shrink-0">
							AI 助手
						</h3>
						{/* Current module context badge */}
						<span className="text-[10px] text-muted bg-surface-secondary/80 border border-border/60 px-2 py-0.5 rounded-full truncate max-w-[130px] select-none">
							{currentModuleLabel}
						</span>
					</div>

					{/* Right actions: New Chat & History */}
					<div className="flex items-center gap-1 shrink-0 window-no-drag">
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
									className="relative h-7 w-7 p-0 text-muted hover:text-foreground hover:bg-surface-secondary/80 rounded-lg cursor-pointer transition-colors"
									onPress={() => setIsHistoryOpen(true)}
									aria-label="历史对话记录"
								>
									{hasBackgroundRunning ? (
										<Loader2 className="w-3.5 h-3.5 text-accent animate-spin" />
									) : (
										<History className="w-3.5 h-3.5" />
									)}
									{hasBackgroundUnread && !hasBackgroundRunning && (
										<span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-accent" />
									)}
								</Button>
							</Tooltip.Trigger>
							<Tooltip.Content className="text-xs py-1 px-2">
								{hasBackgroundRunning ? "后台有正在运行的会话" : "历史记录"}
							</Tooltip.Content>
						</Tooltip>

						{onCollapse && (
							<Tooltip>
								<Tooltip.Trigger>
									<Button
										variant="ghost"
										size="sm"
										isIconOnly
										className="h-7 w-7 p-0 text-muted hover:text-foreground hover:bg-surface-secondary/80 rounded-lg cursor-pointer transition-colors"
										onPress={onCollapse}
										aria-label="收起 AI 助手"
									>
										<PanelRightClose className="w-3.5 h-3.5" />
									</Button>
								</Tooltip.Trigger>
								<Tooltip.Content className="text-xs py-1 px-2">
									收起面板
								</Tooltip.Content>
							</Tooltip>
						)}
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
						onSend={async (extraContextItems, promptText) => {
							// Resolve skill content before sending
							let resolvedItems = extraContextItems;
							if (extraContextItems && extraContextItems.length > 0) {
								resolvedItems =
									await resolveSkillContextItems(extraContextItems);
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
						scopeMode={scopeMode}
						selectedFolder={selectedFolder}
						activeScope={activeScope}
						onToggleScope={handleToggleScope}
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
