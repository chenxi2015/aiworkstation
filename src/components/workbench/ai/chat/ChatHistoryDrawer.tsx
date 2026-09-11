import { Button, Tooltip } from "@heroui/react";
import {
	Clock,
	Download,
	MessageSquare,
	Plus,
	Search,
	Trash2,
	X,
} from "lucide-react";
import { useMemo, useState } from "react";
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
	onExportAll?: () => void;
	onExportSession?: (session: ChatSession) => void;
}

/**
 * Slide-over drawer for browsing and managing past AI conversation sessions with JSON export
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
	onExportAll,
	onExportSession,
}: ChatHistoryDrawerProps) {
	const [isClearConfirmOpen, setIsClearConfirmOpen] = useState(false);
	const [sessionToDelete, setSessionToDelete] = useState<ChatSession | null>(
		null,
	);
	const [searchQuery, setSearchQuery] = useState("");

	const filteredSessions = useMemo(() => {
		if (!searchQuery.trim()) return sessions;
		const q = searchQuery.toLowerCase().trim();
		return sessions.filter((s) => {
			if (s.title && s.title.toLowerCase().includes(q)) return true;
			if (
				Array.isArray(s.messages) &&
				s.messages.some(
					(m: any) =>
						typeof m.content === "string" &&
						m.content.toLowerCase().includes(q),
				)
			) {
				return true;
			}
			return false;
		});
	}, [sessions, searchQuery]);

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
								共 {sessions.length} 个历史会话 (已持久化至本地 SQLite)
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

				{/* Search Bar when multiple sessions exist */}
				{sessions.length > 2 && (
					<div className="px-2.5 py-2 border-b border-border/60 bg-surface/50 shrink-0">
						<div className="relative flex items-center">
							<Search className="w-3.5 h-3.5 absolute left-2.5 text-muted pointer-events-none" />
							<input
								type="text"
								value={searchQuery}
								onChange={(e) => setSearchQuery(e.target.value)}
								placeholder="搜索历史对话内容..."
								className="w-full pl-8 pr-7 py-1 text-xs bg-surface-secondary/70 rounded-lg border border-border/60 focus:outline-none focus:border-accent/60 placeholder:text-muted/70 text-foreground"
							/>
							{searchQuery && (
								<button
									type="button"
									onClick={() => setSearchQuery("")}
									className="absolute right-2 text-muted hover:text-foreground text-xs p-0.5 cursor-pointer"
									aria-label="清空搜索"
								>
									✕
								</button>
							)}
						</div>
					</div>
				)}

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
					) : filteredSessions.length === 0 ? (
						<div className="flex flex-col items-center justify-center py-10 text-center text-muted px-4">
							<Search className="w-6 h-6 opacity-20 mb-1.5" />
							<p className="text-xs">未找到匹配「{searchQuery}」的历史会话</p>
						</div>
					) : (
						filteredSessions.map((session) => {
							const isCurrent = session.id === currentSessionId;
							const msgCount = session.messages?.length || 0;

							return (
								<div
									role="button"
									tabIndex={0}
									key={session.id}
									className={`group relative w-full p-2.5 rounded-xl border text-left transition-all duration-150 cursor-pointer select-none block ${
										isCurrent
											? "bg-accent-soft/40 border-accent/60 shadow-xs ring-1 ring-accent/20"
											: "bg-surface border-border/60 hover:border-accent/40 hover:bg-surface-secondary/40"
									}`}
									onClick={() => {
										onSelectSession(session);
										onClose();
									}}
									onKeyDown={(e) => {
										if (e.key === "Enter" || e.key === " ") {
											e.preventDefault();
											onSelectSession(session);
											onClose();
										}
									}}
								>
									<div className="flex items-center justify-between gap-2">
										<div className="flex items-center gap-1.5 min-w-0 flex-1">
											<MessageSquare
												className={`w-3.5 h-3.5 shrink-0 ${
													isCurrent ? "text-accent" : "text-muted"
												}`}
											/>
											<span className="font-medium text-xs text-foreground truncate">
												{session.title || "未命名对话"}
											</span>
										</div>

										{/* Action buttons (Export & Delete) */}
										<div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
											{onExportSession && (
												<button
													type="button"
													className="p-1 text-muted hover:text-accent rounded transition-colors cursor-pointer"
													onClick={(e) => {
														e.stopPropagation();
														onExportSession(session);
													}}
													aria-label="导出此会话 JSON"
													title="导出此会话 JSON"
												>
													<Download className="w-3 h-3" />
												</button>
											)}
											<button
												type="button"
												className="p-1 text-muted hover:text-danger rounded transition-colors cursor-pointer"
												onClick={(e) => {
													e.stopPropagation();
													setSessionToDelete(session);
												}}
												aria-label="删除此会话"
												title="删除此会话"
											>
												<Trash2 className="w-3 h-3" />
											</button>
										</div>
									</div>

									{/* Meta info: timestamp & count */}
									<div className="flex items-center justify-between mt-1 pl-5 text-[10px] text-muted">
										<span>
											{session.updatedAt || session.createdAt || "刚刚"}
										</span>
										<span className="px-1.5 py-0.2 rounded-full bg-surface-secondary border border-border/40 text-[9px]">
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
						<div className="flex items-center gap-2">
							<Button
								variant="ghost"
								size="sm"
								className="h-6 px-2 text-[10px] text-muted hover:text-danger rounded-md cursor-pointer flex items-center gap-1"
								onPress={() => setIsClearConfirmOpen(true)}
							>
								<Trash2 className="w-3 h-3" />
								<span>清空全部</span>
							</Button>

							{onExportAll && (
								<Button
									variant="ghost"
									size="sm"
									className="h-6 px-2 text-[10px] text-muted hover:text-accent rounded-md cursor-pointer flex items-center gap-1"
									onPress={onExportAll}
								>
									<Download className="w-3 h-3" />
									<span>导出全部 JSON</span>
								</Button>
							)}
						</div>

						<span className="text-[10px] text-muted">本地 SQLite 持久化</span>
					</div>
				)}
			</div>

			{/* Clear-all confirmation (replaces native confirm) */}
			<ConfirmDialog
				isOpen={isClearConfirmOpen}
				onOpenChange={setIsClearConfirmOpen}
				title="清空全部历史"
				description="确定要清空所有保存在 SQLite 中的历史对话吗？此操作无法撤回。"
				confirmLabel="清空全部"
				onConfirm={() => {
					onClearAllSessions();
					onClose();
				}}
			/>

			{/* Single session deletion confirmation */}
			<ConfirmDialog
				isOpen={Boolean(sessionToDelete)}
				onOpenChange={(open) => {
					if (!open) setSessionToDelete(null);
				}}
				title="删除对话"
				description={
					sessionToDelete
						? `确定要删除对话「${sessionToDelete.title || "未命名对话"}」吗？此操作无法撤回。`
						: undefined
				}
				confirmLabel="删除"
				onConfirm={() => {
					if (sessionToDelete) {
						onDeleteSession(sessionToDelete.id);
						setSessionToDelete(null);
					}
				}}
			/>
		</>
	);
}
