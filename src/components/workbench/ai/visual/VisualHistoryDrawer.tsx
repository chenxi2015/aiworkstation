import { Button, Tooltip } from "@heroui/react";
import {
	Clock,
	Image as ImageIcon,
	Palette,
	Plus,
	Search,
	Trash2,
	Video,
	X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { VisualChatSession } from "../../../../types/visualGeneration.ts";
import { ConfirmDialog } from "../../ConfirmDialog.tsx";

export interface VisualHistoryDrawerProps {
	isOpen: boolean;
	sessions: VisualChatSession[];
	currentSessionId: string;
	onClose: () => void;
	onSelectSession: (session: VisualChatSession) => void;
	onNewSession: () => void;
	onDeleteSession: (sessionId: string) => void;
	onClearAllSessions: () => void;
}

/**
 * In-sidebar bottom-sheet drawer for browsing and managing past AI visual generation conversation sessions
 */
export function VisualHistoryDrawer({
	isOpen,
	sessions,
	currentSessionId,
	onClose,
	onSelectSession,
	onNewSession,
	onDeleteSession,
	onClearAllSessions,
}: VisualHistoryDrawerProps) {
	const [isClearConfirmOpen, setIsClearConfirmOpen] = useState(false);
	const [sessionToDelete, setSessionToDelete] =
		useState<VisualChatSession | null>(null);
	const [searchQuery, setSearchQuery] = useState("");

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

	const filteredSessions = useMemo(() => {
		if (!searchQuery.trim()) return sessions;
		const q = searchQuery.toLowerCase().trim();
		return sessions.filter((s) => {
			if (s.title?.toLowerCase().includes(q)) return true;
			if (
				Array.isArray(s.items) &&
				s.items.some(
					(item) =>
						item.prompt.toLowerCase().includes(q) ||
						(item.userPrompt && item.userPrompt.toLowerCase().includes(q)) ||
						item.model.toLowerCase().includes(q),
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
			{/* Scoped within sidebar: full overlay with bottom slide-up card */}
			<div className="absolute inset-0 z-40 flex flex-col justify-end overflow-hidden">
				{/* Backdrop overlay covering only the sidebar */}
				<div
					className="absolute inset-0 bg-black/45 dark:bg-black/60 backdrop-blur-xs animate-in fade-in duration-200 transition-opacity cursor-pointer"
					onClick={onClose}
					aria-label="关闭视觉历史抽屉"
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
							<div className="w-6 h-6 rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center text-xs shrink-0">
								<Palette className="w-3.5 h-3.5" />
							</div>
							<h4 className="font-semibold text-sm text-foreground truncate flex items-center gap-1.5">
								<span>视觉对话历史</span>
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
											onNewSession();
											onClose();
										}}
									>
										<Plus className="w-3.5 h-3.5" />
										<span>新对话</span>
									</Button>
								</Tooltip.Trigger>
								<Tooltip.Content className="text-xs py-1 px-2">
									开启新视觉对话
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
									placeholder="搜索视觉历史对话或提示词..."
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
								<ImageIcon className="w-8 h-8 opacity-20 mb-2" />
								<p className="text-xs">暂无视觉对话记录</p>
								<p className="text-[10px] text-muted/80 mt-0.5">
									生成图像后将自动保存历史会话
								</p>
							</div>
						) : filteredSessions.length === 0 ? (
							<div className="flex flex-col items-center justify-center py-10 text-center text-muted px-4">
								<Search className="w-6 h-6 opacity-20 mb-1.5" />
								<p className="text-xs">未找到匹配「{searchQuery}」的视觉会话</p>
							</div>
						) : (
							filteredSessions.map((session) => {
								const isCurrent = session.id === currentSessionId;
								const itemCount = session.items?.length || 0;
								const latestItem =
									itemCount > 0 ? session.items[itemCount - 1] : null;

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
										<div className="flex items-start justify-between gap-2.5">
											{/* Left Thumbnail (if available) */}
											{latestItem?.url ? (
												<div className="w-10 h-10 rounded-lg overflow-hidden shrink-0 bg-surface-secondary border border-border/50 relative">
													{latestItem.mediaType === "video" ||
													latestItem.url.endsWith(".mp4") ? (
														<div className="w-full h-full flex items-center justify-center bg-purple-950/20 text-purple-600">
															<Video className="w-4 h-4" />
														</div>
													) : (
														<img
															src={latestItem.url}
															alt={session.title}
															className="w-full h-full object-cover"
															loading="lazy"
														/>
													)}
												</div>
											) : (
												<div className="w-10 h-10 rounded-lg shrink-0 bg-surface-secondary/60 flex items-center justify-center text-muted border border-border/40">
													<Palette className="w-4 h-4 opacity-50" />
												</div>
											)}

											<div className="flex-1 min-w-0">
												<div className="flex items-center justify-between gap-1">
													<span className="font-medium text-xs text-foreground truncate">
														{session.title || "未命名视觉创作"}
													</span>

													{/* Delete action button */}
													<button
														type="button"
														className="opacity-0 group-hover:opacity-100 p-1 text-muted hover:text-danger rounded transition-opacity cursor-pointer shrink-0"
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

												{/* Meta info: timestamp & count */}
												<div className="flex items-center justify-between mt-1 text-[10px] text-muted">
													<span className="flex items-center gap-1">
														<Clock className="w-2.5 h-2.5 opacity-60" />
														{new Date(
															session.updatedAt || session.createdAt,
														).toLocaleDateString([], {
															month: "numeric",
															day: "numeric",
															hour: "2-digit",
															minute: "2-digit",
														})}
													</span>
													<span className="px-1.5 py-0.2 rounded-full bg-surface-secondary border border-border/40 text-[9px]">
														{itemCount} 项产出
													</span>
												</div>
											</div>
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
								<span>清空全部</span>
							</Button>

							<span className="text-[10px] text-muted">本地存储 · 离线可用</span>
						</div>
					)}
				</div>
			</div>

			{/* Confirm Delete Single Session Dialog */}
			<ConfirmDialog
				isOpen={Boolean(sessionToDelete)}
				onOpenChange={(open) => !open && setSessionToDelete(null)}
				title="确认删除该视觉对话？"
				description={`删除会话「${sessionToDelete?.title}」后，该会话下的所有视觉生成历史将无法恢复。`}
				confirmLabel="确认删除"
				onConfirm={() => {
					if (sessionToDelete) {
						onDeleteSession(sessionToDelete.id);
						setSessionToDelete(null);
					}
				}}
			/>

			{/* Confirm Clear All Sessions Dialog */}
			<ConfirmDialog
				isOpen={isClearConfirmOpen}
				onOpenChange={setIsClearConfirmOpen}
				title="确认清空所有视觉对话历史？"
				description="清空后将删除所有已保存的视觉生成会话记录，此操作不可撤销。"
				confirmLabel="全部清空"
				onConfirm={() => {
					onClearAllSessions();
					setIsClearConfirmOpen(false);
				}}
			/>
		</>
	);
}
