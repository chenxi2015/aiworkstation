import { Button, Tooltip } from "@heroui/react";
import { useStore } from "@tanstack/react-store";
import { History, MessageSquarePlus } from "lucide-react";
import { memo } from "react";
import { workbenchContextStore } from "../../../../stores/workbenchContextStore";
import { ModelSelectDropdown } from "./ModelSelectDropdown";

export interface ChatInputTopToolbarProps {
	displayModel: string;
	onOpenHistory?: () => void;
	onNewChat?: () => void;
}

/**
 * Top action toolbar above the chat input card:
 * 左侧模型切换下拉，右侧会话历史与新建对话快捷入口（对齐主流 AI 输入框布局）。
 */
export const ChatInputTopToolbar = memo(function ChatInputTopToolbar({
	displayModel,
	onOpenHistory,
	onNewChat,
}: ChatInputTopToolbarProps) {
	// Reactively subscribe to global activeModel from workbenchContextStore
	const activeModel = useStore(workbenchContextStore, (s) => s.activeModel);
	const effectiveModel =
		activeModel?.llmProvider === "official"
			? "官方极速通道"
			: activeModel?.model || displayModel;

	return (
		<div className="flex items-center justify-between gap-1.5 min-w-0 overflow-hidden px-0.5">
			{/* Model Switcher */}
			<ModelSelectDropdown currentModel={effectiveModel} />

			{/* Right: History & New Chat quick actions */}
			{(onOpenHistory || onNewChat) && (
				<div className="flex items-center gap-0.5 shrink-0">
					{onOpenHistory && (
						<Tooltip>
							<Tooltip.Trigger>
								<Button
									variant="ghost"
									size="sm"
									isIconOnly
									className="h-6 w-6 p-0 text-muted hover:text-foreground hover:bg-surface-secondary/80 rounded-lg cursor-pointer transition-colors"
									onPress={onOpenHistory}
									aria-label="历史对话记录"
								>
									<History className="w-3.5 h-3.5" />
								</Button>
							</Tooltip.Trigger>
							<Tooltip.Content className="text-xs py-1 px-2">
								历史记录
							</Tooltip.Content>
						</Tooltip>
					)}
					{onNewChat && (
						<Tooltip>
							<Tooltip.Trigger>
								<Button
									variant="ghost"
									size="sm"
									isIconOnly
									className="h-6 w-6 p-0 text-muted hover:text-foreground hover:bg-surface-secondary/80 rounded-lg cursor-pointer transition-colors"
									onPress={onNewChat}
									aria-label="新建对话"
								>
									<MessageSquarePlus className="w-3.5 h-3.5 text-purple-600" />
								</Button>
							</Tooltip.Trigger>
							<Tooltip.Content className="text-xs py-1 px-2">
								新建对话
							</Tooltip.Content>
						</Tooltip>
					)}
				</div>
			)}
		</div>
	);
});
