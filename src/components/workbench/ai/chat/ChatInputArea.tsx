import { Button, Tooltip } from "@heroui/react";
import {
	CornerDownLeft,
	History,
	Loader2,
	MessageSquarePlus,
	Sparkles,
} from "lucide-react";
import type { RefObject } from "react";
import { memo } from "react";

export interface ChatInputAreaProps {
	input: string;
	isLoading: boolean;
	hasMessages: boolean;
	inputRef: RefObject<HTMLTextAreaElement | null>;
	onChangeInput: (val: string) => void;
	onSend: () => void;
	onOpenHistory?: () => void;
	onNewChat?: () => void;
	onClearHistory?: () => void;
}

/**
 * Universal search and question input area for AI chat panel with top action bar
 */
export const ChatInputArea = memo(function ChatInputArea({
	input,
	isLoading,
	inputRef,
	onChangeInput,
	onSend,
	onOpenHistory,
	onNewChat,
}: ChatInputAreaProps) {
	return (
		<div className="p-3 border-t border-border bg-surface-secondary/40 shrink-0 flex flex-col gap-1.5">
			{/* Top action toolbar (Figure 2: History & New Chat) */}
			<div className="flex items-center justify-between px-0.5">
				<div className="flex items-center gap-1.5 text-muted text-[11px]">
					<span className="text-[10px] text-muted font-medium">统一问答与检索</span>
				</div>

				<div className="flex items-center gap-1">
					{onOpenHistory && (
						<Tooltip>
							<Tooltip.Trigger>
								<Button
									variant="ghost"
									size="sm"
									isIconOnly
									className="h-6 w-6 p-0 text-muted hover:text-foreground hover:bg-surface rounded-md cursor-pointer transition-colors"
									onPress={onOpenHistory}
									aria-label="历史对话记录"
								>
									<History className="w-3.5 h-3.5" />
								</Button>
							</Tooltip.Trigger>
							<Tooltip.Content className="text-xs py-1 px-2">
								历史对话记录
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
									className="h-6 w-6 p-0 text-muted hover:text-accent hover:bg-accent-soft/50 rounded-md cursor-pointer transition-colors"
									onPress={onNewChat}
									aria-label="新建对话"
								>
									<MessageSquarePlus className="w-3.5 h-3.5" />
								</Button>
							</Tooltip.Trigger>
							<Tooltip.Content className="text-xs py-1 px-2">
								新建对话
							</Tooltip.Content>
						</Tooltip>
					)}
				</div>
			</div>

			{/* Input Box Card */}
			<div className="flex items-end gap-2 bg-surface border border-border/80 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20 rounded-xl p-2 transition-all shadow-xs">
				<textarea
					ref={inputRef}
					rows={2}
					value={input}
					onChange={(e) => onChangeInput(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Enter" && !e.shiftKey) {
							e.preventDefault();
							onSend();
						}
					}}
					placeholder="统一搜索 & 智能问答：例如「找推特 AI 创作工具」或「总结本周收藏」..."
					className="flex-1 bg-transparent border-none text-xs text-foreground placeholder:text-muted focus:outline-none resize-none leading-relaxed"
				/>

				<div className="flex items-center gap-1 shrink-0 pb-0.5">
					<Button
						variant="primary"
						size="sm"
						className="h-7 px-2.5 text-xs font-medium rounded-lg flex items-center gap-1 shadow-xs cursor-pointer"
						onPress={onSend}
						isDisabled={!input.trim() || isLoading}
					>
						{isLoading ? (
							<Loader2 className="w-3.5 h-3.5 animate-spin" />
						) : (
							<>
								<Sparkles className="w-3 h-3" />
								<CornerDownLeft className="w-3 h-3 opacity-70" />
							</>
						)}
					</Button>
				</div>
			</div>

			<div className="flex items-center justify-between px-1 text-[10px] text-muted">
				<span>按 Enter 智能搜索或提问，Shift+Enter 换行</span>
				<span className="hidden sm:inline">DeepSeek V3 / RAG 本地驱动</span>
			</div>
		</div>
	);
});
