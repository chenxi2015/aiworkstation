import { ArrowDown, Brain } from "lucide-react";
import {
	type RefObject,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import type { ChatItem } from "../../../../hooks/ai/useAiChat";
import type { Category, Folder, SearchResultItem } from "../../types";
import { ChatMessageItem } from "./ChatMessageItem";
import { ChatPromptSuggestions } from "./ChatPromptSuggestions";

export interface ChatMessageListProps {
	messages: ChatItem[];
	isLoading: boolean;
	currentSessionId?: string | null;
	selectedFolder?: Folder | null;
	scopeMode?: "global" | "folder";
	selectedRefKeys: Set<string | number>;
	messagesEndRef?: RefObject<HTMLDivElement | null>;
	onEditAndResend: (index: number, newContent: string) => void;
	onEditOnly: (index: number, newContent: string) => void;
	onResend: (index: number) => void;
	onDelete: (index: number) => void;
	onDeleteMessages?: (indices: Set<number>) => void;
	onToggleRefCheck: (refKey: string | number) => void;
	onToggleSelectGroup?: (items: SearchResultItem[]) => void;
	onOpenAssignSingle: (item: SearchResultItem, e?: React.MouseEvent) => void;
	onOpenAssignMultiple: (
		items: SearchResultItem[],
		createMode?: boolean,
	) => void;
	onSelectPrompt: (prompt: string) => void;
	folders?: Folder[];
	/** 当前模块的推荐提问（见 modules/ai-contributions.ts） */
	modulePrompts?: string[];
	onNavigateToFolder?: (
		folderId: number | null,
		category?: Category,
		targetItemId?: string | number,
	) => void;
}

/**
 * Chat messages history, bubbles, reference cards, and loading states
 */
export function ChatMessageList({
	messages,
	isLoading,
	currentSessionId,
	selectedFolder,
	scopeMode = "global",
	selectedRefKeys,
	messagesEndRef,
	onEditAndResend,
	onEditOnly,
	onResend,
	onDelete,
	onDeleteMessages,
	onToggleRefCheck,
	onToggleSelectGroup,
	onOpenAssignSingle,
	onOpenAssignMultiple,
	onSelectPrompt,
	folders,
	modulePrompts,
	onNavigateToFolder,
}: ChatMessageListProps) {
	const [isSelectMode, setIsSelectMode] = useState(false);
	const [selectedIndices, setSelectedIndices] = useState<Set<number>>(
		new Set(),
	);

	// Scroll container & bottom tracking state
	const scrollContainerRef = useRef<HTMLDivElement | null>(null);
	const localEndRef = useRef<HTMLDivElement | null>(null);
	const targetEndRef = messagesEndRef || localEndRef;

	const isAtBottomRef = useRef(true);
	const isSmoothScrollingRef = useRef(false);
	const [showScrollBottom, setShowScrollBottom] = useState(false);
	const prevMessagesLengthRef = useRef(messages.length);

	// Monitor user scrolling to toggle auto-scroll and quick-down button
	const handleScroll = useCallback(() => {
		if (isSmoothScrollingRef.current) return;
		const container = scrollContainerRef.current;
		if (!container) return;

		const threshold = 80;
		const distanceToBottom =
			container.scrollHeight - container.scrollTop - container.clientHeight;
		const atBottom = distanceToBottom <= threshold;

		isAtBottomRef.current = atBottom;
		setShowScrollBottom(!atBottom);
	}, []);

	// Smoothly or immediately scroll to bottom
	const scrollToBottom = useCallback((smooth = true) => {
		const container = scrollContainerRef.current;
		if (!container) return;

		isAtBottomRef.current = true;
		setShowScrollBottom(false);

		if (smooth) {
			isSmoothScrollingRef.current = true;
			container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
			setTimeout(() => {
				isSmoothScrollingRef.current = false;
				if (container) {
					const distanceToBottom =
						container.scrollHeight -
						container.scrollTop -
						container.clientHeight;
					const atBottom = distanceToBottom <= 80;
					isAtBottomRef.current = atBottom;
					setShowScrollBottom(!atBottom);
				}
			}, 350);
		} else {
			container.scrollTop = container.scrollHeight;
		}
	}, []);

	// Reset scroll position to bottom on session switch
	// biome-ignore lint/correctness/useExhaustiveDependencies: reset scroll on session switch
	useEffect(() => {
		const container = scrollContainerRef.current;
		if (container) {
			container.scrollTop = container.scrollHeight;
			isAtBottomRef.current = true;
			setShowScrollBottom(false);
		}
	}, [currentSessionId]);

	// Auto-scroll on new messages or during generation (only when user is already at bottom)
	// biome-ignore lint/correctness/useExhaustiveDependencies: intelligent scroll on message update
	useEffect(() => {
		const container = scrollContainerRef.current;
		if (!container) return;

		const isNewMessage = messages.length > prevMessagesLengthRef.current;
		prevMessagesLengthRef.current = messages.length;

		if (isNewMessage) {
			const lastMessage = messages[messages.length - 1];
			// User sent a new message: smoothly scroll to bottom
			if (lastMessage?.role === "user") {
				scrollToBottom(true);
				return;
			}
		}

		// During streaming or loading state:
		// Only auto-scroll to bottom if user has not scrolled up
		if (isAtBottomRef.current) {
			container.scrollTop = container.scrollHeight;
		}
	}, [messages, isLoading, scrollToBottom]);

	// Enter select mode when user clicks delete on a message
	const handleStartSelectDelete = (initialIndex: number) => {
		setIsSelectMode(true);
		setSelectedIndices(new Set([initialIndex]));
	};

	const handleCancelSelect = () => {
		setIsSelectMode(false);
		setSelectedIndices(new Set());
	};

	const handleToggleSelect = (index: number) => {
		setSelectedIndices((prev) => {
			const next = new Set(prev);
			if (next.has(index)) {
				next.delete(index);
			} else {
				next.add(index);
			}
			return next;
		});
	};

	const handleToggleSelectAll = () => {
		if (selectedIndices.size === messages.length) {
			setSelectedIndices(new Set());
		} else {
			setSelectedIndices(new Set(messages.map((_, i) => i)));
		}
	};

	const handleConfirmDelete = () => {
		if (selectedIndices.size === 0) return;
		if (onDeleteMessages) {
			onDeleteMessages(selectedIndices);
		} else {
			for (const idx of Array.from(selectedIndices).sort((a, b) => b - a)) {
				onDelete(idx);
			}
		}
		handleCancelSelect();
	};
	return (
		<div className="relative flex-1 min-h-0 flex flex-col">
			<div
				ref={scrollContainerRef}
				onScroll={handleScroll}
				className="flex-1 overflow-y-auto p-4 space-y-4"
			>
				{/* Empty State */}
				{messages.length === 0 && (
					<div className="flex flex-col items-center justify-center text-center py-6 px-2 min-h-[50vh]">
						<div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-accent/20 to-accent-soft/80 border border-accent/20 flex items-center justify-center text-accent mb-3 shadow-xs">
							<Brain className="w-6 h-6" />
						</div>
						<h3 className="font-bold text-sm text-foreground mb-1 tracking-tight">
							工作台 AI 知识对话中心
						</h3>
						<p className="text-xs text-muted max-w-xs leading-relaxed">
							基于本地 SQLite 与混合 RAG
							检索，精准唤醒沉睡书签，智能答疑与盘点资产。
						</p>

						{/* Prompt Suggestions */}
						<ChatPromptSuggestions
							selectedFolder={selectedFolder}
							scopeMode={scopeMode}
							onSelectPrompt={onSelectPrompt}
							globalPrompts={modulePrompts}
						/>
					</div>
				)}

				{/* Message Bubbles */}
				{messages.map((msg, idx) => (
					<ChatMessageItem
						key={`${msg.timestamp || idx}_${msg.role}_${idx}`}
						msg={msg}
						index={idx}
						isLoading={isLoading}
						isSelectMode={isSelectMode}
						isSelected={selectedIndices.has(idx)}
						onToggleSelect={handleToggleSelect}
						onStartSelectDelete={handleStartSelectDelete}
						selectedRefKeys={selectedRefKeys}
						onEditAndResend={onEditAndResend}
						onEditOnly={onEditOnly}
						onResend={onResend}
						onDelete={onDelete}
						onToggleRefCheck={onToggleRefCheck}
						onToggleSelectGroup={onToggleSelectGroup}
						onOpenAssignSingle={onOpenAssignSingle}
						onOpenAssignMultiple={onOpenAssignMultiple}
						folders={folders}
						onNavigateToFolder={onNavigateToFolder}
					/>
				))}

				{/* Sticky Delete Actions Bar (matching Figure 1) */}
				{isSelectMode && (
					<div className="sticky bottom-0 z-20 flex items-center justify-between gap-2 p-2.5 bg-surface/95 backdrop-blur-md border border-border rounded-2xl shadow-lg mt-2">
						<div className="flex items-center gap-2">
							<span className="text-xs text-foreground font-medium">
								已选择{" "}
								<span className="text-accent font-bold">
									{selectedIndices.size}
								</span>{" "}
								项
							</span>
							<button
								type="button"
								onClick={handleToggleSelectAll}
								className="text-[11px] text-muted hover:text-foreground underline cursor-pointer"
							>
								{selectedIndices.size === messages.length ? "取消全选" : "全选"}
							</button>
						</div>

						<div className="flex items-center gap-2">
							<button
								type="button"
								onClick={handleCancelSelect}
								className="h-8 px-3 text-xs font-medium rounded-xl text-muted hover:text-foreground hover:bg-surface-secondary transition-colors cursor-pointer"
							>
								取消
							</button>
							<button
								type="button"
								disabled={selectedIndices.size === 0}
								onClick={handleConfirmDelete}
								className="h-8 px-5 text-xs font-semibold rounded-xl bg-red-500 hover:bg-red-600 active:bg-red-700 disabled:opacity-50 text-white shadow-xs cursor-pointer transition-colors"
							>
								删除
							</button>
						</div>
					</div>
				)}

				<div ref={targetEndRef} />
			</div>

			{/* Floating Quick Scroll to Bottom Button (matches Figure 2) */}
			{!isSelectMode && showScrollBottom && (
				<button
					type="button"
					onClick={() => scrollToBottom(true)}
					className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 flex items-center justify-center w-8 h-8 rounded-full bg-neutral-800/90 dark:bg-neutral-700/90 hover:bg-neutral-900 dark:hover:bg-neutral-600 text-white shadow-lg border border-white/15 backdrop-blur-xs transition-all duration-200 active:scale-90 cursor-pointer hover:scale-105"
					title="快速回到底部"
					aria-label="快速回到底部"
				>
					<ArrowDown className="w-4 h-4 stroke-[2.5]" />
				</button>
			)}
		</div>
	);
}
