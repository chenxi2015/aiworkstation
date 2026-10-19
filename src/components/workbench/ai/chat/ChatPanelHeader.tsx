import { Button, Tooltip } from "@heroui/react";
import {
	History,
	Loader2,
	MessageSquare,
	MessageSquarePlus,
	Palette,
	PanelRightClose,
} from "lucide-react";
import type { FC } from "react";
import { AiAssistantLogoIcon } from "../../Icons";

export interface ChatPanelHeaderProps {
	activeMode: "chat" | "visual";
	onChangeMode: (mode: "chat" | "visual") => void;
	currentModuleLabel?: string;
	hasBackgroundRunning?: boolean;
	hasBackgroundUnread?: boolean;
	onNewChat: () => void;
	onOpenHistory: () => void;
	onCollapse?: () => void;
}

/**
 * Header component for the workbench AI assistant panel.
 * Handles mode switching (chat vs visual), status indicators, and quick action buttons.
 */
export const ChatPanelHeader: FC<ChatPanelHeaderProps> = ({
	activeMode,
	onChangeMode,
	currentModuleLabel,
	hasBackgroundRunning = false,
	hasBackgroundUnread = false,
	onNewChat,
	onOpenHistory,
	onCollapse,
}) => {
	const isChat = activeMode === "chat";

	return (
		<div className="h-12 px-3.5 bg-surface/80 backdrop-blur-md shrink-0 flex items-center justify-between z-10 window-drag-region select-none border-b border-border/40">
			{/* Left: Assistant Logo, Mode Switcher, and Module Scope Badge */}
			<div className="flex items-center gap-2 min-w-0 window-no-drag">
				<AiAssistantLogoIcon className="w-6 h-6 shrink-0" />

				{/* Mode Switcher: Chat (Agent/RAG) vs Visual (Image/Video Gen) */}
				<div className="inline-flex items-center p-0.5 rounded-full bg-surface-secondary/70 border border-border/60">
					<button
						type="button"
						onClick={() => onChangeMode("chat")}
						className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium transition-all cursor-pointer ${
							isChat
								? "bg-surface text-foreground font-semibold shadow-2xs"
								: "text-muted hover:text-foreground"
						}`}
					>
						<MessageSquare className="w-3 h-3" />
						<span>对话</span>
					</button>
					<button
						type="button"
						onClick={() => onChangeMode("visual")}
						className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium transition-all cursor-pointer ${
							!isChat
								? "bg-surface text-foreground font-semibold shadow-2xs"
								: "text-muted hover:text-foreground"
						}`}
					>
						<Palette className="w-3 h-3 text-amber-500" />
						<span>视觉</span>
					</button>
				</div>

				{/* Current Module Context Badge (in Chat mode) */}
				{isChat && currentModuleLabel && (
					<span className="text-[10px] text-muted bg-surface-secondary/80 border border-border/60 px-2 py-0.5 rounded-full truncate max-w-[95px] select-none">
						{currentModuleLabel}
					</span>
				)}
			</div>

			{/* Right: New Chat, History, and Collapse actions */}
			<div className="flex items-center gap-1 shrink-0 window-no-drag">
				{/* New Chat Button */}
				<Tooltip>
					<Tooltip.Trigger>
						<Button
							variant="ghost"
							size="sm"
							isIconOnly
							className="h-7 w-7 p-0 text-muted hover:text-foreground hover:bg-surface-secondary/80 rounded-lg cursor-pointer transition-colors"
							onPress={onNewChat}
							aria-label={isChat ? "新建对话" : "新建视觉对话"}
						>
							<MessageSquarePlus
								className={`w-3.5 h-3.5 ${!isChat ? "text-amber-500" : ""}`}
							/>
						</Button>
					</Tooltip.Trigger>
					<Tooltip.Content className="text-xs py-1 px-2">
						{isChat ? "新建对话" : "新建视觉对话"}
					</Tooltip.Content>
				</Tooltip>

				{/* History Drawer Toggle Button */}
				<Tooltip>
					<Tooltip.Trigger>
						<Button
							variant="ghost"
							size="sm"
							isIconOnly
							className="relative h-7 w-7 p-0 text-muted hover:text-foreground hover:bg-surface-secondary/80 rounded-lg cursor-pointer transition-colors"
							onPress={onOpenHistory}
							aria-label={isChat ? "历史对话记录" : "视觉历史记录"}
						>
							{isChat && hasBackgroundRunning ? (
								<Loader2 className="w-3.5 h-3.5 text-accent animate-spin" />
							) : (
								<History className="w-3.5 h-3.5" />
							)}
							{isChat && hasBackgroundUnread && !hasBackgroundRunning && (
								<span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-accent" />
							)}
						</Button>
					</Tooltip.Trigger>
					<Tooltip.Content className="text-xs py-1 px-2">
						{isChat
							? hasBackgroundRunning
								? "后台有正在运行的会话"
								: "历史记录"
							: "视觉历史记录"}
					</Tooltip.Content>
				</Tooltip>

				{/* Panel Collapse Toggle */}
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
	);
};