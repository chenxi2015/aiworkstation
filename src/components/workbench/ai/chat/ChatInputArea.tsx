import { Button, Tooltip } from "@heroui/react";
import {
	ArrowUp,
	Folder as FolderIcon,
	Globe,
	History,
	MessageSquarePlus,
	Sparkles,
	Square,
} from "lucide-react";
import type { RefObject } from "react";
import { memo } from "react";
import { WorkbenchStorageService } from "../../../../services/workbenchStorage";
import type { Folder } from "../../types";

export interface ChatInputAreaProps {
	input: string;
	isLoading: boolean;
	hasMessages: boolean;
	inputRef: RefObject<HTMLTextAreaElement | null>;
	onChangeInput: (val: string) => void;
	onSend: () => void;
	onStop?: () => void;
	onOpenHistory?: () => void;
	onNewChat?: () => void;
	onClearHistory?: () => void;
	model?: string;
	scopeMode?: "global" | "folder";
	selectedFolder?: Folder | null;
	onToggleScope?: () => void;
}

/**
 * Modern AI chat input area with top toolbar, full-width textarea, and embedded action bar
 */
export const ChatInputArea = memo(function ChatInputArea({
	input,
	isLoading,
	inputRef,
	onChangeInput,
	onSend,
	onStop,
	onOpenHistory,
	onNewChat,
	model,
	scopeMode = "global",
	selectedFolder,
	onToggleScope,
}: ChatInputAreaProps) {
	const currentSettings =
		typeof window !== "undefined" ? WorkbenchStorageService.getSettings() : null;
	const displayModel = model || currentSettings?.model || "AI";
	const canSend = input.trim().length > 0 && !isLoading;

	return (
		<div className="p-3 border-t border-border/70 bg-surface/50 shrink-0 flex flex-col gap-2">
			{/* Top action toolbar */}
			<div className="flex items-center justify-between px-0.5">
				{/* Left: Model Pill Badge with Gradient Icon */}
				<div className="flex items-center gap-1.5">
					<div
						className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-surface-secondary/70 border border-border/60 text-[11px] font-medium text-foreground/90 shadow-2xs select-none"
						title={`当前模型: ${displayModel}`}
					>
						<span className="w-4 h-4 rounded-full bg-gradient-to-tr from-violet-500 via-indigo-500 to-fuchsia-500 flex items-center justify-center text-white shrink-0 shadow-2xs">
							<Sparkles className="w-2.5 h-2.5" />
						</span>
						<span className="max-w-[130px] truncate text-[10px] font-semibold text-foreground/80">
							{displayModel}
						</span>
					</div>
				</div>

				{/* Right: History & New Chat Buttons */}
				<div className="flex items-center gap-1">
					{onOpenHistory && (
						<Tooltip>
							<Tooltip.Trigger>
								<Button
									variant="ghost"
									size="sm"
									isIconOnly
									className="h-6.5 w-6.5 p-0 text-muted hover:text-foreground hover:bg-surface-secondary/80 rounded-lg cursor-pointer transition-colors"
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
									variant="secondary"
									size="sm"
									isIconOnly
									className="h-6.5 w-6.5 p-0 bg-accent/10 hover:bg-accent/20 text-accent border border-accent/20 rounded-lg cursor-pointer transition-all shadow-2xs"
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

			{/* Main Input Card: Top textarea + bottom embedded actions */}
			<div className="flex flex-col bg-surface border border-border/80 focus-within:border-accent/50 focus-within:ring-2 focus-within:ring-accent/15 rounded-2xl p-2.5 transition-all shadow-xs group">
				<textarea
					ref={inputRef}
					rows={2}
					value={input}
					onChange={(e) => onChangeInput(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Enter" && !e.shiftKey) {
							e.preventDefault();
							if (!isLoading && input.trim()) {
								onSend();
							}
						} else if (e.key === "Escape" && isLoading && onStop) {
							e.preventDefault();
							onStop();
						}
					}}
					placeholder="问任何问题，搜索书签，或按 Enter 发送..."
					className="w-full bg-transparent border-none text-xs text-foreground placeholder:text-muted/60 focus:outline-none resize-none leading-relaxed min-h-[44px] max-h-[140px] px-1 py-0.5"
				/>

				{/* Card Bottom Bar: Left scope switch, Right Send/Stop Button */}
				<div className="flex items-center justify-between pt-2 px-0.5">
					{/* Left: Scope Pill */}
					<div className="flex items-center gap-1.5">
						<button
							type="button"
							onClick={onToggleScope}
							className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full transition-all cursor-pointer border ${
								scopeMode === "folder" && selectedFolder
									? "bg-accent/10 text-accent border-accent/30 hover:bg-accent/20"
									: "bg-surface-secondary/70 text-muted hover:text-foreground border-border/50 hover:bg-surface-secondary"
							}`}
							title="点击切换问答范围（全局 / 当前文件夹）"
						>
							{scopeMode === "folder" && selectedFolder ? (
								<>
									<FolderIcon className="w-3 h-3 text-accent shrink-0" />
									<span className="max-w-[120px] truncate">
										限定: {selectedFolder.name}
									</span>
								</>
							) : (
								<>
									<Globe className="w-3 h-3 shrink-0" />
									<span>全局检索</span>
								</>
							)}
						</button>
					</div>

					{/* Right: Send / Stop Action Button */}
					<div className="flex items-center gap-1">
						{isLoading ? (
							<Tooltip>
								<Tooltip.Trigger>
									<Button
										variant="secondary"
										size="sm"
										isIconOnly
										className="h-7 w-7 rounded-xl border border-danger/30 bg-danger/10 hover:bg-danger/20 text-danger flex items-center justify-center cursor-pointer shadow-2xs group transition-all"
										onPress={onStop}
										aria-label="停止回答"
									>
										<Square className="w-2.5 h-2.5 fill-current group-hover:scale-90 transition-transform" />
									</Button>
								</Tooltip.Trigger>
								<Tooltip.Content className="text-xs py-1 px-2">
									停止回答
								</Tooltip.Content>
							</Tooltip>
						) : (
							<Tooltip>
								<Tooltip.Trigger>
									<Button
										variant={canSend ? "primary" : "secondary"}
										size="sm"
										isIconOnly
										className={`h-7 w-7 rounded-xl flex items-center justify-center cursor-pointer transition-all shadow-xs ${
											canSend
												? "bg-accent text-accent-foreground hover:opacity-90 shadow-accent/20"
												: "bg-surface-secondary text-muted/50 border border-border/40 cursor-not-allowed opacity-60"
										}`}
										onPress={() => {
											if (canSend) onSend();
										}}
										isDisabled={!canSend}
										aria-label="发送消息"
									>
										<ArrowUp className="w-3.5 h-3.5 stroke-[2.5]" />
									</Button>
								</Tooltip.Trigger>
								<Tooltip.Content className="text-xs py-1 px-2">
									发送 (Enter)
								</Tooltip.Content>
							</Tooltip>
						)}
					</div>
				</div>
			</div>

			{/* Footer Hints */}
			<div className="flex items-center justify-between px-1 text-[10px] text-muted/70">
				<span>Enter 发送 · Shift+Enter 换行</span>
				<span className="hidden sm:inline truncate max-w-[200px]">
					RAG 本地知识库驱动
				</span>
			</div>
		</div>
	);
});
