import { useDroppable } from "@dnd-kit/core";
import { Button, Tooltip } from "@heroui/react";
import {
	ArrowUp,
	Folder as FolderIcon,
	Globe,
	History,
	MessageSquarePlus,
	Paperclip,
	Sparkles,
	Square,
} from "lucide-react";
import {
	type ClipboardEvent,
	type DragEvent,
	memo,
	type RefObject,
	useCallback,
	useState,
} from "react";
import { WorkbenchStorageService } from "../../../../services/workbenchStorage";
import type { ChatContextItem } from "../../../../types/chatContext";
import { CHAT_INPUT_DROP_ID } from "../../dnd/dndUtils";
import type { Folder } from "../../types";
import { ChatContextBar } from "./ChatContextBar";

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
	/** Contextual attachment chips displayed above textarea */
	contextItems?: ChatContextItem[];
	onRemoveContextItem?: (id: string) => void;
	onClearContextItems?: () => void;
	onAttachContextItem?: (item: ChatContextItem) => void;
}

/**
 * Modern AI chat input area with context injection (dnd-kit & native drops),
 * top toolbar, full-width textarea, and embedded action bar.
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
	contextItems = [],
	onRemoveContextItem,
	onClearContextItems,
	onAttachContextItem,
}: ChatInputAreaProps) {
	const currentSettings =
		typeof window !== "undefined"
			? WorkbenchStorageService.getSettings()
			: null;
	const displayModel = model || currentSettings?.model || "AI";

	// Dnd-kit droppable area for items and folders
	const { isOver, setNodeRef } = useDroppable({
		id: CHAT_INPUT_DROP_ID,
	});

	// Native drag state for desktop images and external files
	const [isNativeDragOver, setIsNativeDragOver] = useState(false);

	const canSend =
		(input.trim().length > 0 || contextItems.length > 0) && !isLoading;

	// Handle native file drop (e.g. dragging images/files from desktop)
	const handleNativeDrop = useCallback(
		(e: DragEvent<HTMLDivElement>) => {
			if (!onAttachContextItem) return;
			const files = e.dataTransfer.files;
			if (!files || files.length === 0) return;

			e.preventDefault();
			e.stopPropagation();
			setIsNativeDragOver(false);

			for (let i = 0; i < files.length; i++) {
				const file = files[i];
				if (file.type.startsWith("image/")) {
					const reader = new FileReader();
					reader.onload = () => {
						onAttachContextItem({
							id: `file_${Date.now()}_${i}`,
							type: "image",
							title: file.name,
							subtitle: `${Math.round(file.size / 1024)} KB`,
							thumbnail: reader.result as string,
						});
					};
					reader.readAsDataURL(file);
				} else {
					onAttachContextItem({
						id: `file_${Date.now()}_${i}`,
						type: "file",
						title: file.name,
						subtitle: `${Math.round(file.size / 1024)} KB`,
					});
				}
			}
		},
		[onAttachContextItem],
	);

	// Handle clipboard paste (e.g. pasting screenshots from clipboard)
	const handlePaste = useCallback(
		(e: ClipboardEvent<HTMLTextAreaElement>) => {
			if (!onAttachContextItem) return;
			const items = e.clipboardData.items;
			if (!items) return;

			for (let i = 0; i < items.length; i++) {
				const item = items[i];
				if (item.type.startsWith("image/")) {
					const file = item.getAsFile();
					if (file) {
						e.preventDefault();
						const reader = new FileReader();
						reader.onload = () => {
							onAttachContextItem({
								id: `img_${Date.now()}_${i}`,
								type: "image",
								title: "剪贴板截图",
								subtitle: `${Math.round(file.size / 1024)} KB`,
								thumbnail: reader.result as string,
							});
						};
						reader.readAsDataURL(file);
					}
				}
			}
		},
		[onAttachContextItem],
	);

	const isDropTargetActive = isOver || isNativeDragOver;

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

			{/* Main Input Card: Droppable Zone with Context Bar, Textarea, and Action Bar */}
			<section
				ref={setNodeRef}
				aria-label="AI 对话输入与上下文拖放区域"
				onDragOver={(e) => {
					e.preventDefault();
					setIsNativeDragOver(true);
				}}
				onDragLeave={() => setIsNativeDragOver(false)}
				onDrop={handleNativeDrop}
				className={`relative flex flex-col bg-surface border rounded-2xl p-2.5 transition-all shadow-xs group ${
					isDropTargetActive
						? "border-dashed border-accent ring-2 ring-accent/30 bg-accent/5 scale-[1.005]"
						: "border-border/80 focus-within:border-accent/50 focus-within:ring-2 focus-within:ring-accent/15"
				}`}
			>
				{/* Visual drop indicator overlay when hovering */}
				{isDropTargetActive && (
					<div className="absolute inset-0 z-20 pointer-events-none rounded-2xl bg-accent/10 backdrop-blur-[1px] flex items-center justify-center gap-2 text-accent font-medium text-xs animate-in fade-in duration-150">
						<Paperclip className="w-4 h-4 animate-bounce" />
						<span>释放以添加为对话上下文</span>
					</div>
				)}

				{/* Injected Context Attachment Chips (Bookmarks, Folders, Files) */}
				{contextItems.length > 0 && (
					<div className="mb-2 pb-1 border-b border-border/50">
						<ChatContextBar
							items={contextItems}
							onRemove={(id) => onRemoveContextItem?.(id)}
							onClearAll={onClearContextItems}
						/>
					</div>
				)}

				<textarea
					ref={inputRef}
					rows={2}
					value={input}
					onChange={(e) => onChangeInput(e.target.value)}
					onPaste={handlePaste}
					onKeyDown={(e) => {
						if (e.key === "Enter" && !e.shiftKey) {
							e.preventDefault();
							if (canSend) {
								onSend();
							}
						} else if (e.key === "Escape" && isLoading && onStop) {
							e.preventDefault();
							onStop();
						}
					}}
					placeholder={
						contextItems.length > 0
							? "对上述引用的上下文提问，或按 Enter 直接分析..."
							: "问任何问题，或将左侧书签/文件夹拖拽至此注入上下文..."
					}
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
			</section>

			{/* Footer Hints */}
			<div className="flex items-center justify-between px-1 text-[10px] text-muted/70">
				<span>可直接拖入书签、文件夹或图片 · Enter 发送</span>
				<span className="hidden sm:inline truncate max-w-[200px]">
					RAG 本地知识库驱动
				</span>
			</div>
		</div>
	);
});
