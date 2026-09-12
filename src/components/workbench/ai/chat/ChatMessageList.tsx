import { ScrollShadow } from "@heroui/react";
import { ArrowDown } from "lucide-react";
import {
	type RefObject,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import type { ChatItem } from "../../../../hooks/ai/useAiChat";
import type { PageBridge } from "../../../../types/pageBridge";
import type { Category, Folder, SearchResultItem } from "../../types";
import { ChatEmptyState } from "./ChatEmptyState";
import { ChatMessageItem } from "./ChatMessageItem";

export interface ChatMessageListProps {
	messages: ChatItem[];
	isLoading: boolean;
	/** 当前页面注册的能力桥（如创作模块的插入光标/替换选区等动作） */
	pageBridge?: PageBridge | null;
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
	/** 当前模块（如 editor / creator / bookmarks 等） */
	activeModule?: string;
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
	pageBridge,
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
	activeModule,
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
		setShowScrollBottom(!atBottom && container.scrollTop > 100);
	}, []);

	// Smoothly or immediately scroll to bottom
	const scrollToBottom = useCallback((smooth = false) => {
		const container = scrollContainerRef.current;
		if (!container) return;

		isAtBottomRef.current = true;
		setShowScrollBottom(false);

		if (smooth) {
			isSmoothScrollingRef.current = true;
			container.scrollTo({
				top: container.scrollHeight,
				behavior: "smooth",
			});
			setTimeout(() => {
				isSmoothScrollingRef.current = false;
			}, 300);
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
			<ScrollShadow
				ref={scrollContainerRef}
				onScroll={handleScroll}
				size={40}
				className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4"
			>
				{/* Empty State */}
				{messages.length === 0 && (
					<ChatEmptyState
						activeModule={activeModule}
						selectedFolder={selectedFolder}
						scopeMode={scopeMode}
						onSelectPrompt={onSelectPrompt}
						globalPrompts={modulePrompts}
						pageBridge={pageBridge}
					/>
				)}

				{/* Messages Rendering */}
				{messages.map((message, index) => (
					<ChatMessageItem
						key={`${message.timestamp || index}-${message.role}`}
						msg={message}
						index={index}
						isLoading={isLoading}
						pageBridge={pageBridge}
						isSelectMode={isSelectMode}
						isSelected={selectedIndices.has(index)}
						onToggleSelect={handleToggleSelect}
						selectedRefKeys={selectedRefKeys}
						onEditAndResend={onEditAndResend}
						onEditOnly={onEditOnly}
						onResend={onResend}
						onDelete={onDelete}
						onStartSelectDelete={handleStartSelectDelete}
						onToggleRefCheck={onToggleRefCheck}
						onToggleSelectGroup={onToggleSelectGroup}
						onOpenAssignSingle={onOpenAssignSingle}
						onOpenAssignMultiple={onOpenAssignMultiple}
						folders={folders}
						onNavigateToFolder={onNavigateToFolder}
					/>
				))}

				{/* Batch Delete Action Bar (Fixed Overlay at bottom of scroll area) */}
				{isSelectMode && (
					<div className="sticky bottom-2 z-30 mx-auto w-[90%] max-w-sm p-2.5 rounded-2xl bg-surface/95 dark:bg-neutral-900/95 border border-border shadow-xl backdrop-blur-md flex items-center justify-between animate-in fade-in slide-in-from-bottom-2 duration-200">
						<div className="flex items-center gap-2">
							<span className="text-xs font-medium text-foreground">
								已选 {selectedIndices.size} 条
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
			</ScrollShadow>

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
