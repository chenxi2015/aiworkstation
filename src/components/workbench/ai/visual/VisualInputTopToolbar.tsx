import { Button, Tooltip } from "@heroui/react";
import { History, MessageSquarePlus } from "lucide-react";
import { memo } from "react";
import { MediaModelSelectDropdown } from "./MediaModelSelectDropdown.tsx";

export interface VisualInputTopToolbarProps {
	currentModel: string;
	onModelChange?: (model: string, providerId: string) => void;
	onOpenHistory?: () => void;
	onNewChat?: () => void;
}

/**
 * Top action toolbar above the visual generation input card:
 * 放置在输入框左上角的模型选择器，以及右侧历史会话与新建视觉对话快捷入口。
 */
export const VisualInputTopToolbar = memo(function VisualInputTopToolbar({
	currentModel,
	onModelChange,
	onOpenHistory,
	onNewChat,
}: VisualInputTopToolbarProps) {
	return (
		<div className="flex items-center justify-between gap-1.5 min-w-0 overflow-hidden px-0.5">
			{/* Model Switcher at top-left */}
			<MediaModelSelectDropdown
				currentModel={currentModel}
				onModelChange={onModelChange}
			/>

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
									aria-label="视觉历史对话记录"
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
									aria-label="新建视觉对话"
								>
									<MessageSquarePlus className="w-3.5 h-3.5 text-amber-500" />
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
