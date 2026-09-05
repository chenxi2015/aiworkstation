import { Brain, Loader2 } from "lucide-react";
import { type RefObject, useState } from "react";
import type { ChatItem } from "../../../../hooks/ai/useAiChat";
import type { Category, Folder, SearchResultItem } from "../../types";
import { ChatMessageItem } from "./ChatMessageItem";
import { ChatPromptSuggestions } from "./ChatPromptSuggestions";

export interface ChatMessageListProps {
	messages: ChatItem[];
	isLoading: boolean;
	selectedFolder?: Folder | null;
	selectedRefKeys: Set<string | number>;
	messagesEndRef: RefObject<HTMLDivElement | null>;
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
	onNavigateToFolder?: (folderId: number | null, category?: Category) => void;
}

/**
 * Chat messages history, bubbles, reference cards, and loading states
 */
export function ChatMessageList({
	messages,
	isLoading,
	selectedFolder,
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
	onNavigateToFolder,
}: ChatMessageListProps) {
	const [isSelectMode, setIsSelectMode] = useState(false);
	const [selectedIndices, setSelectedIndices] = useState<Set<number>>(
		new Set(),
	);

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
		<div className="flex-1 overflow-y-auto p-4 space-y-4">
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
						onSelectPrompt={onSelectPrompt}
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
					onNavigateToFolder={onNavigateToFolder}
				/>
			))}

			{/* Loading indicator */}
			{isLoading && (
				<div className="flex items-start gap-2">
					<div className="p-3 rounded-2xl bg-surface border border-border text-xs flex items-center gap-2 text-muted shadow-2xs">
						<Loader2 className="w-3.5 h-3.5 animate-spin text-accent" />
						<span>正在检索与深度分析书签资产库...</span>
					</div>
				</div>
			)}

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

			<div ref={messagesEndRef} />
		</div>
	);
}
