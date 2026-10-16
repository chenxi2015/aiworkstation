import { Button, Tooltip } from "@heroui/react";
import { History, MessageSquarePlus } from "lucide-react";
import { memo, useState } from "react";
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
	// 本地镜像当前模型，切换后立即刷新展示（设置已持久化，无需父组件干预）
	const [model, setModel] = useState(displayModel);

	return (
		<div className="flex items-center justify-between gap-1.5 min-w-0 overflow-hidden px-0.5">
			{/* Model Switcher */}
			<ModelSelectDropdown currentModel={model} onModelChange={setModel} />

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
