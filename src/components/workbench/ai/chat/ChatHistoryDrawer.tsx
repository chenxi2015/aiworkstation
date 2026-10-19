import { Button, Tooltip } from "@heroui/react";
import { useSelector } from "@tanstack/react-store";
import {
	Clock,
	Download,
	Loader2,
	MessageSquare,
	Plus,
	Search,
	Trash2,
	X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ChatSession } from "../../../../services/workbenchStorage";
import { agentSessionStore } from "../../../../stores/agentSessionStore";
import { ConfirmDialog } from "../../ConfirmDialog";
import { DrawerPagination } from "../shared/DrawerPagination";

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

const PAGE_SIZE = 10;

/**
 * In-sidebar bottom-sheet drawer for browsing and managing past AI conversation sessions
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
	const [currentPage, setCurrentPage] = useState(1);
	const runtimeSessions = useSelector(agentSessionStore, (s) => s.sessions);

	// Close on Escape key press
	useEffect(() => {
		if (!isOpen) return;
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				onClose();
			}
		};
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [isOpen, onClose]);

	// Reset page when search changes
	useEffect(() => {
		if (searchQuery !== undefined) {
			setCurrentPage(1);
		}
	}, [searchQuery]);

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

	// Pagination calculations
	const totalItems = filteredSessions.length;
	const totalPages = Math.ceil(totalItems / PAGE_SIZE) || 1;
	const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);

	// Fallback to previous page if current page became empty after item deletion
	useEffect(() => {
		if (currentPage > totalPages && totalPages > 0) {
			setCurrentPage(totalPages);
		}
	}, [currentPage, totalPages]);

	const paginatedSessions = useMemo(() => {
		const startIndex = (safeCurrentPage - 1) * PAGE_SIZE;
		return filteredSessions.slice(startIndex, startIndex + PAGE_SIZE);
	}, [filteredSessions, safeCurrentPage]);

	if (!isOpen) return null;

	return (
		<>
			{/* Scoped within sidebar: full overlay with bottom slide-up card */}
			<div className="absolute inset-0 z-40 flex flex-col justify-end overflow-hidden">
				{/* Backdrop overlay covering only the sidebar */}
				<div
					className="absolute inset-0 bg-black/45 dark:bg-black/60 backdrop-blur-xs animate-in fade-in duration-200 transition-opacity cursor-pointer"
					onClick={onClose}
					aria-label="关闭历史抽屉"
				/>

				{/* In-sidebar bottom sheet card (occupies ~72% of sidebar height with top rounded corners) */}
				<div className="relative z-10 w-full flex flex-col h-[72%] max-h-[72%] bg-surface/98 dark:bg-surface/95 backdrop-blur-xl border-t border-border shadow-2xl rounded-t-2xl overflow-hidden animate-in slide-in-from-bottom duration-250 ease-out">
					{/* Top drag indicator handle */}
					<div
						className="pt-2 pb-0.5 flex justify-center shrink-0 bg-surface-secondary/40 select-none cursor-pointer"
						onClick={onClose}
						title="点击收起"
					>
						<div className="w-8 h-1 rounded-full bg-muted/30 hover:bg-muted/60 transition-colors" />
					</div>

					{/* Header matching screenshot: Title (Count) + New Chat + Close */}
					<div className="px-3.5 py-2.5 border-b border-border/80 flex items-center justify-between shrink-0 bg-surface-secondary/40">
						<div className="flex items-center gap-2 min-w-0">
							<div className="w-6 h-6 rounded-lg bg-accent-soft text-accent flex items-center justify-center text-xs shrink-0">
								<Clock className="w-3.5 h-3.5" />
							</div>
							<h4 className="font-semibold text-sm text-foreground truncate flex items-center gap-1.5">
								<span>对话历史</span>
								<span className="text-xs font-normal text-muted">
									({sessions.length})
								</span>
							</h4>
						</div>

						<div className="flex items-center gap-1 shrink-0">
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
										<Plus className="w-3.5 h-3.5" />
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
						<div className="px-3 py-2 border-b border-border/60 bg-surface/50 shrink-0">
							<div className="relative flex items-center">
								<Search className="w-3.5 h-3.5 absolute left-2.5 text-muted pointer-events-none" />
								<input
									type="text"
									value={searchQuery}
									onChange={(e) => setSearchQuery(e.target.value)}
									placeholder="搜索历史对话内容..."
									className="w-full pl-8 pr-7 py-1 text-xs bg-surface-secondary/70 rounded-lg border border-border/60 focus:outline-none focus:border-accent/60 placeholder:text-muted/70 text-foreground transition-colors"
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
					<div className="flex-1 overflow-y-auto p-2 space-y-1.5 min-h-0">
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
							paginatedSessions.map((session) => {
								const isCurrent = session.id === currentSessionId;
								const runtime = runtimeSessions[session.id];
								const isRunning = runtime?.status === "running";
								const hasUnread = runtime?.hasUnread;
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
												{isRunning ? (
													<Loader2 className="w-3.5 h-3.5 shrink-0 text-accent animate-spin" />
												) : (
													<MessageSquare
														className={`w-3.5 h-3.5 shrink-0 ${
															isCurrent ? "text-accent" : "text-muted"
														}`}
													/>
												)}
												<span className="font-medium text-xs text-foreground truncate">
													{session.title || "未命名对话"}
												</span>
												{isRunning && (
													<span className="text-[9px] px-1.5 py-0.2 rounded-full bg-accent-soft text-accent shrink-0 animate-pulse">
														生成中
													</span>
												)}
												{hasUnread && !isRunning && (
													<span
														className="w-1.5 h-1.5 rounded-full bg-accent shrink-0"
														title="有新回复"
													/>
												)}
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

					{/* Pagination Bar */}
					<DrawerPagination
						currentPage={safeCurrentPage}
						totalPages={totalPages}
						totalItems={totalItems}
						pageSize={PAGE_SIZE}
						onPageChange={setCurrentPage}
					/>

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
