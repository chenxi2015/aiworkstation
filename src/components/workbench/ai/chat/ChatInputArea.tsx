import { Button, Tooltip } from "@heroui/react";
import { CornerDownLeft, Loader2, Sparkles, Trash2 } from "lucide-react";
import type { RefObject } from "react";
import { memo } from "react";

export interface ChatInputAreaProps {
	input: string;
	isLoading: boolean;
	hasMessages: boolean;
	inputRef: RefObject<HTMLTextAreaElement | null>;
	onChangeInput: (val: string) => void;
	onSend: () => void;
	onClearHistory: () => void;
}

/**
 * Universal search and question input area for AI chat panel
 */
export const ChatInputArea = memo(function ChatInputArea({
	input,
	isLoading,
	hasMessages,
	inputRef,
	onChangeInput,
	onSend,
	onClearHistory,
}: ChatInputAreaProps) {
	return (
		<div className="p-3 border-t border-border bg-surface-secondary/40 shrink-0 flex flex-col gap-1.5">
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
					{hasMessages && (
						<Tooltip>
							<Tooltip.Trigger>
								<Button
									variant="ghost"
									size="sm"
									className="h-7 w-7 p-0 text-muted hover:text-danger rounded-lg cursor-pointer"
									onPress={onClearHistory}
									aria-label="清空对话"
								>
									<Trash2 className="w-3.5 h-3.5" />
								</Button>
							</Tooltip.Trigger>
							<Tooltip.Content className="text-xs py-1 px-2">
								清空对话与搜索历史
							</Tooltip.Content>
						</Tooltip>
					)}

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
