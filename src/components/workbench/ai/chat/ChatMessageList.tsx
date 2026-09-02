import { Button } from "@heroui/react";
import {
	BookOpen,
	Brain,
	CheckSquare,
	FolderInput,
	FolderPlus,
	Loader2,
	Square,
} from "lucide-react";
import type { RefObject } from "react";
import type { ChatItem } from "../../../../hooks/ai/useAiChat";
import type { Category, Folder, SearchResultItem } from "../../types";
import { AiMarkdownRenderer } from "../shared/AiMarkdownRenderer";
import { ChatPromptSuggestions } from "./ChatPromptSuggestions";
import { ChatReferenceCard } from "./ChatReferenceCard";

export interface ChatMessageListProps {
	messages: ChatItem[];
	isLoading: boolean;
	selectedFolder?: Folder | null;
	selectedRefKeys: Set<string | number>;
	messagesEndRef: RefObject<HTMLDivElement | null>;
	onToggleRefCheck: (refKey: string | number) => void;
	onToggleSelectGroup?: (items: SearchResultItem[]) => void;
	onOpenAssignSingle: (item: SearchResultItem, e: React.MouseEvent) => void;
	onOpenAssignMultiple: (items: SearchResultItem[], createMode?: boolean) => void;
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
	onToggleRefCheck,
	onToggleSelectGroup,
	onOpenAssignSingle,
	onOpenAssignMultiple,
	onSelectPrompt,
	onNavigateToFolder,
}: ChatMessageListProps) {
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
						基于本地 SQLite 与混合 RAG 检索，精准唤醒沉睡书签，智能答疑与盘点资产。
					</p>

					{/* Prompt Suggestions */}
					<ChatPromptSuggestions
						selectedFolder={selectedFolder}
						onSelectPrompt={onSelectPrompt}
					/>
				</div>
			)}

			{/* Message Bubbles */}
			{messages.map((msg, idx) => {
				const currentReferences = msg.references || [];
				const selectedRefsInThisMsg = currentReferences.filter((r: SearchResultItem) =>
					selectedRefKeys.has(r.id || r.url || ""),
				);
				const isAllInMsgChecked =
					currentReferences.length > 0 &&
					currentReferences.every((r: SearchResultItem) =>
						selectedRefKeys.has(r.id || r.url || ""),
					);

				return (
					<div
						key={idx}
						className={`flex flex-col gap-1.5 ${
							msg.role === "user" ? "items-end" : "items-start"
						}`}
					>
						<div className="flex items-center gap-1.5 text-[10px] text-muted px-1">
							<span className="font-medium">
								{msg.role === "user" ? "你" : "AI 助手"}
							</span>
							{msg.timestamp && <span>· {msg.timestamp}</span>}
						</div>

						<div
							className={`p-3 rounded-2xl max-w-full leading-relaxed text-xs shadow-2xs ${
								msg.role === "user"
									? "bg-accent text-accent-foreground rounded-tr-xs shadow-xs font-normal"
									: "bg-surface border border-border text-foreground rounded-tl-xs"
							}`}
						>
							{msg.role === "user" ? (
								<div className="whitespace-pre-wrap leading-relaxed text-xs">
									{msg.content}
								</div>
							) : (
								<AiMarkdownRenderer content={msg.content} compact={true} />
							)}
						</div>

						{/* References / Search Results Cards with In-Place Folder Assignment */}
						{currentReferences.length > 0 && (
							<div className="mt-1.5 w-full flex flex-col gap-2 p-3 rounded-xl bg-surface/90 border border-border shadow-2xs">
								<div className="text-[11px] font-medium text-muted flex items-center justify-between">
									<span className="inline-flex items-center gap-1">
										<BookOpen className="w-3.5 h-3.5 text-accent" />
										<span>命中的网址列表 ({currentReferences.length})</span>
									</span>
									<div className="flex items-center gap-2">
										{selectedRefsInThisMsg.length > 0 && (
											<span className="text-[10px] text-accent font-medium">
												已选 {selectedRefsInThisMsg.length} 项
											</span>
										)}
										{onToggleSelectGroup && (
											<button
												type="button"
												onClick={() => onToggleSelectGroup(currentReferences)}
												className={`text-[10px] font-medium inline-flex items-center gap-1 cursor-pointer transition-colors px-1.5 py-0.5 rounded-md ${
													isAllInMsgChecked
														? "text-accent bg-accent-soft/50 hover:bg-accent-soft/80"
														: "text-muted hover:text-foreground hover:bg-surface-secondary"
												}`}
												aria-label={isAllInMsgChecked ? "取消全选" : "全选全部网址"}
											>
												{isAllInMsgChecked ? (
													<CheckSquare className="w-3 h-3 text-accent" />
												) : (
													<Square className="w-3 h-3 opacity-50 hover:opacity-80" />
												)}
												<span>{isAllInMsgChecked ? "取消全选" : "全选"}</span>
											</button>
										)}
									</div>
								</div>

								{/* Reference items list */}
								<div className="flex flex-col gap-1.5">
									{currentReferences.map((ref: SearchResultItem, rIdx: number) => {
										const refKey = ref.id || ref.url || rIdx;
										const isChecked = selectedRefKeys.has(refKey);

										return (
											<ChatReferenceCard
												key={refKey}
												reference={ref}
												isChecked={isChecked}
												onToggleCheck={() => onToggleRefCheck(refKey)}
												onOpenAssign={(e) => onOpenAssignSingle(ref, e)}
												onNavigateToFolder={onNavigateToFolder}
											/>
										);
									})}
								</div>

								{/* Batch Actions Bar for selected references */}
								{selectedRefsInThisMsg.length > 0 && (
									<div className="mt-1 pt-2 border-t border-border flex items-center justify-between gap-1 flex-wrap bg-surface-secondary/40 p-1.5 rounded-lg">
										<span className="text-[10px] text-foreground font-medium">
											已选 {selectedRefsInThisMsg.length} 个书签
										</span>
										<div className="flex items-center gap-1">
											<Button
												variant="secondary"
												size="sm"
												className="h-6 px-2 text-[10px] rounded-md cursor-pointer flex items-center gap-1"
												onPress={() =>
													onOpenAssignMultiple(selectedRefsInThisMsg, false)
												}
											>
												<FolderInput className="w-2.5 h-2.5" />
												<span>归入已有</span>
											</Button>
											<Button
												variant="primary"
												size="sm"
												className="h-6 px-2 text-[10px] rounded-md cursor-pointer flex items-center gap-1"
												onPress={() =>
													onOpenAssignMultiple(selectedRefsInThisMsg, true)
												}
											>
												<FolderPlus className="w-2.5 h-2.5" />
												<span>新建归入</span>
											</Button>
										</div>
									</div>
								)}
							</div>
						)}
					</div>
				);
			})}

			{/* Loading indicator */}
			{isLoading && (
				<div className="flex items-start gap-2">
					<div className="p-3 rounded-2xl bg-surface border border-border text-xs flex items-center gap-2 text-muted shadow-2xs">
						<Loader2 className="w-3.5 h-3.5 animate-spin text-accent" />
						<span>正在检索与深度分析书签资产库...</span>
					</div>
				</div>
			)}

			<div ref={messagesEndRef} />
		</div>
	);
}
