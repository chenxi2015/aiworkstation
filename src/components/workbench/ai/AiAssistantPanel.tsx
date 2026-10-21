import { useSelector } from "@tanstack/react-store";
import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { getModuleByCode } from "../../../modules/registry";
import { agentSessionStore } from "../../../stores/agentSessionStore";
import type { ChatContextItem } from "../../../types/chatContext";
import type { PageBridge } from "../../../types/pageBridge";
import type { Category, Folder, WorkbenchSettings } from "../types";
import { CATEGORIES } from "../types";
import {
	ChatAssistantView,
	type ChatAssistantViewRef,
} from "./chat/ChatAssistantView";
import { ChatPanelHeader } from "./chat/ChatPanelHeader";
import { ImagePreviewProvider } from "./shared/ImagePreviewModal";
import {
	VisualAssistantView,
	type VisualAssistantViewRef,
} from "./visual/VisualAssistantView";

export interface AiAssistantPanelRef {
	sendPrompt: (
		prompt: string,
		options?: {
			newChat?: boolean;
			folderId?: number | null;
			folderName?: string;
			contextItems?: ChatContextItem[];
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
	setInputText?: (text: string) => void;
}

export interface AiAssistantPanelProps {
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
 * Universal Workbench AI Assistant Panel.
 * Acts as the outer layout shell and coordinator between Chat (Agent/RAG) and Visual (Image/Video Gen) assistant views.
 */
export const AiAssistantPanel = forwardRef<
	AiAssistantPanelRef,
	AiAssistantPanelProps
>(function AiAssistantPanel(
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
	// Active Assistant Mode: 'chat' (Agent/RAG) vs 'visual' (Image/Video Gen)
	const [activeMode, setActiveMode] = useState<"chat" | "visual">("chat");

	const chatAssistantRef = useRef<ChatAssistantViewRef | null>(null);
	const visualAssistantRef = useRef<VisualAssistantViewRef | null>(null);

	// Check if there are other background sessions currently running or unread
	const hasBackgroundRunning = useSelector(agentSessionStore, (s) =>
		Object.values(s.sessions).some(
			(session) =>
				session.id !== s.activeSessionId && session.status === "running",
		),
	);
	const hasBackgroundUnread = useSelector(agentSessionStore, (s) =>
		Object.values(s.sessions).some(
			(session) => session.id !== s.activeSessionId && session.hasUnread,
		),
	);

	// Module context definition and display badge
	const resolvedModule = pageBridge?.module ?? activeModule;
	const currentModuleDef = resolvedModule
		? getModuleByCode(resolvedModule)
		: undefined;
	const currentModuleLabel = currentModuleDef?.label
		? `${currentModuleDef.label}模式`
		: resolvedModule === "editor"
			? "创作台模式"
			: "全库知识";

	// Forward imperative actions to chat assistant view while switching active mode if needed
	useImperativeHandle(ref, () => ({
		sendPrompt: (prompt, options) => {
			setActiveMode("chat");
			chatAssistantRef.current?.sendPrompt(prompt, options);
		},
		focusInput: () => {
			setActiveMode("chat");
			chatAssistantRef.current?.focusInput();
		},
		openSearchTab: () => {
			setActiveMode("chat");
			chatAssistantRef.current?.openSearchTab();
		},
		openChatTab: (prompt, options) => {
			setActiveMode("chat");
			chatAssistantRef.current?.openChatTab(prompt, options);
		},
		addContextItem: (item) => {
			setActiveMode("chat");
			chatAssistantRef.current?.addContextItem(item);
		},
		setInputText: (text) => {
			setActiveMode("chat");
			chatAssistantRef.current?.setInputText?.(text);
		},
	}));

	return (
		<ImagePreviewProvider>
			<aside
				data-ai-panel
				style={panelWidth ? { width: `${panelWidth}px` } : undefined}
				className={`${
					panelWidth ? "" : "w-[380px] xl:w-[440px] 2xl:w-[480px]"
				} shrink-0 bg-surface/95 backdrop-blur-md border-l border-border flex flex-col h-full shadow-xs relative ${className}`}
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

				{/* Top Header */}
				<ChatPanelHeader
					activeMode={activeMode}
					onChangeMode={setActiveMode}
					currentModuleLabel={currentModuleLabel}
					hasBackgroundRunning={hasBackgroundRunning}
					hasBackgroundUnread={hasBackgroundUnread}
					onNewChat={() => {
						if (activeMode === "chat") {
							chatAssistantRef.current?.createNewChat();
						} else {
							visualAssistantRef.current?.newSession();
						}
					}}
					onOpenHistory={() => {
						if (activeMode === "chat") {
							chatAssistantRef.current?.openHistory();
						} else {
							visualAssistantRef.current?.openHistory();
						}
					}}
					onCollapse={onCollapse}
				/>

				{/* Chat Mode View */}
				<ChatAssistantView
					ref={chatAssistantRef}
					selectedFolder={selectedFolder}
					activeModule={activeModule}
					pageBridge={pageBridge}
					folders={folders}
					categories={categories}
					settings={settings}
					onNavigateToFolder={onNavigateToFolder}
					onDataChanged={onDataChanged}
					className={activeMode === "chat" ? "" : "hidden"}
				/>

				{/* Visual Mode View */}
				<VisualAssistantView
					ref={visualAssistantRef}
					pageBridge={pageBridge}
					className={activeMode === "visual" ? "" : "hidden"}
				/>
			</aside>
		</ImagePreviewProvider>
	);
});