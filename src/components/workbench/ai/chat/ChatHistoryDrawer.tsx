import { Button, Tooltip } from "@heroui/react";
import { Clock, MessageSquare, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
import type { ChatSession } from "../../../../services/workbenchStorage";
import { ConfirmDialog } from "../../ConfirmDialog";

export interface ChatHistoryDrawerProps {
	isOpen: boolean;
	sessions: ChatSession[];
	currentSessionId: string;
	onClose: () => void;
	onSelectSession: (session: ChatSession) => void;
	onNewChat: () => void;
	onDeleteSession: (sessionId: string) => void;
	onClearAllSessions: () => void;
}

/**
 * Slide-over drawer for browsing and managing past AI conversation sessions
 */
export function ChatHistoryDrawer({
	isOpen,
	sessions,
	currentSessionId,
	onClose,
	onSelectSession,
	onNewChat,
	onDeleteSession,
	onClearAllSessions,
}: ChatHistoryDrawerProps) {
	const [isClearConfirmOpen, setIsClearConfirmOpen] = useState(false);

	if (!isOpen) return null;

	return (
		<>
			<div className="absolute inset-0 z-30 flex flex-col bg-surface/98 backdrop-blur-md animate-in fade-in duration-150">
				{/* Header */}
				<div className="p-3 border-b border-border/80 flex items-center justify-between shrink-0 bg-surface-secondary/40">
					<div className="flex items-center gap-2">
						<div className="w-6 h-6 rounded-lg bg-accent-soft text-accent flex items-center justify-center text-xs">
							<Clock className="w-3.5 h-3.5" />
						</div>
						<div>
							<h4 className="font-bold text-xs text-foreground">对话历史</h4>
							<p className="text-[10px] text-muted">
								共 {sessions.length} 个历史会话
							</p>
						</div>
					</div>

					<div className="flex items-center gap-1">
						<Tooltip>
							<Tooltip.Trigger>
								<Button
									variant="ghost"
									size="sm"
									className="h-7 px-2 text-xs text-accent hover:bg-accent-soft rounded-lg cursor-pointer flex items-center gap-1"
									onPress={() => {
										onNewChat();
										onClose();
									}}
								>
									<Plus className="w-3 h-3" />
									<span>新会话</span>
								</Button>
							</Tooltip.Trigger>
							<Tooltip.Content className="text-xs py-1 px-2">
								开启新对话
							</Tooltip.Content>
						</Tooltip>

						<Button
							variant="ghost"
							size="sm"
							isIconOnly
							className="h-7 w-7 p-0 text-muted hover:text-foreground rounded-lg cursor-pointer"
							onPress={onClose}
							aria-label="关闭"
						>
							<X className="w-4 h-4" />
						</Button>
					</div>
				</div>

				{/* Session List */}
				<div className="flex-1 overflow-y-auto p-2 space-y-1.5">
					{sessions.length === 0 ? (
						<div className="flex flex-col items-center justify-center py-12 text-center text-muted px-4">
							<MessageSquare className="w-8 h-8 opacity-20 mb-2" />
							<p className="text-xs">暂无历史对话记录</p>
							<p className="text-[10px] text-muted/80 mt-0.5">
								向 AI 发送问题后将自动保存历史会话
							</p>
						</div>
					) : (
						sessions.map((session) => {
							const isCurrent = session.id === currentSessionId;
							const msgCount = session.messages?.length || 0;
							const previewText =
								session.messages?.find((m) => m.role === "assistant")
									?.content || "";

							return (
								<div
									key={session.id}
									className={`group relative p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
										isCurrent
											? "bg-accent-soft/30 border-accent/60 shadow-2xs"
											: "bg-surface border-border/60 hover:border-accent/40 hover:bg-surface-secondary/40"
									}`}
									onClick={() => {
										onSelectSession(session);
										onClose();
									}}
								>
									<div className="flex items-start justify-between gap-2">
										<div className="flex items-center gap-1.5 min-w-0">
											<MessageSquare
												className={`w-3.5 h-3.5 shrink-0 ${
													isCurrent ? "text-accent" : "text-muted"
												}`}
											/>
											<span className="font-medium text-xs text-foreground truncate">
												{session.title || "未命名对话"}
											</span>
										</div>

										{/* Delete button */}
										<button
											type="button"
											className="opacity-0 group-hover:opacity-100 p-1 text-muted hover:text-danger rounded transition-opacity cursor-pointer shrink-0"
											onClick={(e) => {
												e.stopPropagation();
												onDeleteSession(session.id);
											}}
											aria-label="删除此会话"
										>
											<Trash2 className="w-3 h-3" />
										</button>
									</div>

									{/* Message Preview */}
									{previewText && (
										<p className="text-[10px] text-muted line-clamp-1 mt-1 leading-normal pl-5">
											{previewText.replace(/[#*`_]/g, "")}
										</p>
									)}

									{/* Meta */}
									<div className="flex items-center justify-between mt-1.5 pl-5 text-[9px] text-muted">
										<span>
											{session.updatedAt || session.createdAt || "刚刚"}
										</span>
										<span className="px-1.5 py-0.2 rounded-full bg-surface-secondary border border-border/40">
											{msgCount} 条消息
										</span>
									</div>
								</div>
							);
						})
					)}
				</div>

				{/* Footer Actions */}
				{sessions.length > 0 && (
					<div className="p-2.5 border-t border-border/80 bg-surface-secondary/30 shrink-0 flex items-center justify-between">
						<Button
							variant="ghost"
							size="sm"
							className="h-6 px-2 text-[10px] text-muted hover:text-danger rounded-md cursor-pointer flex items-center gap-1"
							onPress={() => setIsClearConfirmOpen(true)}
						>
							<Trash2 className="w-3 h-3" />
							<span>清空全部历史</span>
						</Button>

						<span className="text-[10px] text-muted">支持无缝回溯</span>
					</div>
				)}
			</div>

			{/* Clear-all confirmation (replaces native confirm) */}
			<ConfirmDialog
				isOpen={isClearConfirmOpen}
				onOpenChange={setIsClearConfirmOpen}
				title="清空全部历史"
				description="确定要清空所有历史对话吗？此操作无法撤回。"
				confirmLabel="清空全部"
				onConfirm={() => {
					onClearAllSessions();
					onClose();
				}}
			/>
		</>
	);
}
