import { Tooltip, toast } from "@heroui/react";
import {
	ArrowUp,
	Check,
	Copy,
	ExternalLink,
	Folder as FolderIcon,
	Globe,
	Pencil,
	Trash2,
	X,
	ZoomIn,
} from "lucide-react";
import { memo, useEffect, useRef, useState } from "react";
import type { ChatItem } from "../../../../../hooks/ai/useAiChat";
import type { Category } from "../../../types";
import { useImagePreview } from "../../shared/ImagePreviewModal";
import { UrlLinkifiedText } from "../../shared/UrlLinkifiedText";

export interface UserMessageBubbleProps {
	msg: ChatItem;
	index: number;
	isLoading: boolean;
	onEditAndResend: (index: number, newContent: string) => void;
	onDelete: (index: number) => void;
	onStartSelectDelete?: (index: number) => void;
	onNavigateToFolder?: (
		folderId: number | null,
		category?: Category,
		targetItemId?: string | number,
	) => void;
}

/**
 * User message bubble rendering attachments chips, text, inline editing and hover actions
 */
export const UserMessageBubble = memo(function UserMessageBubble({
	msg,
	index,
	isLoading,
	onEditAndResend,
	onDelete,
	onStartSelectDelete,
	onNavigateToFolder,
}: UserMessageBubbleProps) {
	const [isEditing, setIsEditing] = useState(false);
	const [draftContent, setDraftContent] = useState(msg.content);
	const [copied, setCopied] = useState(false);
	const textareaRef = useRef<HTMLTextAreaElement | null>(null);
	const { openPreview } = useImagePreview();

	// Synchronize draft when msg content updates externally
	useEffect(() => {
		setDraftContent(msg.content);
	}, [msg.content]);

	// Auto-focus and resize when entering edit mode
	useEffect(() => {
		if (isEditing && textareaRef.current) {
			textareaRef.current.focus();
			textareaRef.current.setSelectionRange(
				textareaRef.current.value.length,
				textareaRef.current.value.length,
			);
			textareaRef.current.style.height = "auto";
			textareaRef.current.style.height = `${Math.min(
				textareaRef.current.scrollHeight,
				140,
			)}px`;
		}
	}, [isEditing]);

	const handleCopy = () => {
		navigator.clipboard.writeText(msg.content);
		setCopied(true);
		toast.success("已复制到剪贴板");
		setTimeout(() => setCopied(false), 2000);
	};

	const handleSave = () => {
		const trimmed = draftContent.trim();
		if (!trimmed) return;
		setIsEditing(false);
		onEditAndResend(index, trimmed);
	};

	const handleCancelEdit = () => {
		setDraftContent(msg.content);
		setIsEditing(false);
	};

	return (
		<div className="w-full flex flex-col items-end gap-1 group relative my-2">
			{isEditing ? (
				<div className="w-full flex items-center gap-1.5 my-1">
					{/* Cancel Button */}
					<Tooltip>
						<Tooltip.Trigger>
							<button
								type="button"
								onClick={handleCancelEdit}
								className="p-1 text-muted hover:text-foreground hover:bg-surface-secondary/80 rounded-md transition-colors cursor-pointer shrink-0"
								aria-label="取消编辑"
							>
								<X className="w-4 h-4" />
							</button>
						</Tooltip.Trigger>
						<Tooltip.Content className="text-[10px] py-0.5 px-1.5">
							取消 (Esc)
						</Tooltip.Content>
					</Tooltip>

					{/* Edit Textarea */}
					<textarea
						ref={textareaRef}
						rows={1}
						value={draftContent}
						onChange={(e) => {
							setDraftContent(e.target.value);
							e.target.style.height = "auto";
							e.target.style.height = `${Math.min(e.target.scrollHeight, 140)}px`;
						}}
						onKeyDown={(e) => {
							if (e.key === "Enter" && !e.shiftKey) {
								e.preventDefault();
								handleSave();
							} else if (e.key === "Escape") {
								e.preventDefault();
								handleCancelEdit();
							}
						}}
						placeholder="编辑内容..."
						className="flex-1 min-w-0 bg-surface border-2 border-accent rounded-xl px-3 py-1.5 text-xs text-foreground placeholder:text-muted focus:outline-none resize-none leading-relaxed shadow-xs max-h-36 transition-all"
					/>

					{/* Save Button */}
					<Tooltip>
						<Tooltip.Trigger>
							<button
								type="button"
								onClick={handleSave}
								disabled={!draftContent.trim() || isLoading}
								className="w-7 h-7 rounded-full bg-accent hover:bg-accent/90 disabled:opacity-50 text-accent-foreground flex items-center justify-center shrink-0 shadow-xs cursor-pointer transition-all"
								aria-label="保存并发送"
							>
								<ArrowUp className="w-4 h-4" />
							</button>
						</Tooltip.Trigger>
						<Tooltip.Content className="text-[10px] py-0.5 px-1.5">
							保存并重新提问 (Enter)
						</Tooltip.Content>
					</Tooltip>
				</div>
			) : (
				<div className="flex flex-col items-end gap-1 max-w-[85%] sm:max-w-[75%]">
					{/* Context attachments chips */}
					{msg.contextItems && msg.contextItems.length > 0 && (
						<div className="flex flex-wrap gap-1 mb-0.5 justify-end">
							{msg.contextItems.map((ci) => {
								const isLink = ci.type === "bookmark" || Boolean(ci.url);
								const isFolder = ci.type === "folder";

								if (isLink && ci.url) {
									return (
										<div
											key={ci.id}
											className="inline-flex items-center gap-1 pl-2 pr-1.5 py-0.5 rounded-lg bg-surface-secondary/90 hover:bg-accent/10 border border-border/60 hover:border-accent/40 text-[10px] text-foreground/80 hover:text-accent transition-all group/chip select-none hover:scale-[1.02] active:scale-[0.98]"
										>
											<a
												href={ci.url}
												target="_blank"
												rel="noopener noreferrer"
												onClick={(e) => e.stopPropagation()}
												className="inline-flex items-center gap-1 min-w-0 max-w-[150px] cursor-pointer"
												title={`点击在新标签页打开：${ci.url}`}
											>
												{ci.icon ? (
													<img
														src={ci.icon}
														alt=""
														className="w-3 h-3 rounded-sm object-contain shrink-0"
														onError={(e) => {
															(e.currentTarget as HTMLElement).style.display =
																"none";
														}}
													/>
												) : (
													<Globe className="w-3 h-3 text-accent shrink-0" />
												)}
												<span className="truncate font-medium group-hover/chip:underline">
													{ci.title}
												</span>
												<ExternalLink className="w-2.5 h-2.5 opacity-60 group-hover/chip:opacity-100 shrink-0" />
											</a>

											{typeof ci.folderId === "number" &&
												onNavigateToFolder && (
													<button
														type="button"
														onClick={(e) => {
															e.stopPropagation();
															e.preventDefault();
															onNavigateToFolder(
																ci.folderId ?? null,
																ci.category as Category,
															);
															toast.success("已定位到书签所在文件夹");
														}}
														className="p-0.5 rounded hover:bg-amber-500/20 text-muted hover:text-amber-600 dark:hover:text-amber-400 transition-colors shrink-0 cursor-pointer"
														title="在工作台中定位所在文件夹"
													>
														<FolderIcon className="w-2.5 h-2.5" />
													</button>
												)}
										</div>
									);
								}

								if (isFolder && typeof ci.folderId === "number") {
									return (
										<button
											key={ci.id}
											type="button"
											onClick={(e) => {
												e.stopPropagation();
												if (onNavigateToFolder) {
													onNavigateToFolder(
														ci.folderId ?? null,
														ci.category as Category,
													);
													toast.success(`已定位到「${ci.title}」文件夹`);
												}
											}}
											className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 hover:border-amber-500/50 text-[10px] text-amber-700 dark:text-amber-300 transition-all cursor-pointer group/chip select-none hover:scale-[1.02] active:scale-[0.98]"
											title={`点击在工作台中定位并打开「${ci.title}」文件夹`}
										>
											<span className="font-medium">📁</span>
											<span className="truncate max-w-[130px] font-medium group-hover/chip:underline">
												{ci.title}
											</span>
										</button>
									);
								}

								if (ci.type === "image" && ci.thumbnail) {
									return (
										<button
											key={ci.id}
											type="button"
											onClick={(e) => {
												e.stopPropagation();
												openPreview({
													src: ci.thumbnail || "",
													title: ci.title,
													subtitle: ci.subtitle,
												});
											}}
											className="inline-flex items-center gap-1.5 pl-1.5 pr-2 py-0.5 rounded-lg bg-surface-secondary/90 hover:bg-surface-secondary border border-border/70 hover:border-accent/40 text-[10px] text-foreground/80 hover:text-foreground transition-all cursor-pointer select-none group/img-chip hover:scale-[1.02] active:scale-[0.98] shadow-2xs"
											title={`${ci.title} · 点击预览图片`}
										>
											<img
												src={ci.thumbnail}
												alt=""
												className="w-3.5 h-3.5 rounded object-cover border border-border/50 shrink-0"
											/>
											<span className="truncate max-w-[130px] font-medium group-hover/img-chip:underline">
												{ci.title}
											</span>
											<ZoomIn className="w-2.5 h-2.5 opacity-50 group-hover/img-chip:opacity-100 text-accent shrink-0" />
										</button>
									);
								}

								return (
									<div
										key={ci.id}
										className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-surface-secondary border border-border/60 text-[10px] text-foreground/80 select-none"
										title={ci.title}
									>
										<span className="text-accent font-medium">📎</span>
										<span className="truncate max-w-[130px] font-medium">
											{ci.title}
										</span>
									</div>
								);
							})}
						</div>
					)}

					{/* Clean neutral rounded pill */}
					<div className="bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 rounded-2xl px-4 py-2 text-sm leading-relaxed font-normal shadow-2xs">
						<div className="whitespace-pre-wrap leading-relaxed">
							<UrlLinkifiedText text={msg.content} />
						</div>
					</div>

					{/* Hover action toolbar */}
					<div className="opacity-0 group-hover:opacity-100 transition-opacity duration-150 flex items-center gap-0.5 text-muted text-xs px-1">
						<Tooltip>
							<Tooltip.Trigger>
								<button
									type="button"
									onClick={handleCopy}
									className="p-1 rounded-md text-muted hover:text-foreground hover:bg-surface-secondary/80 transition-colors cursor-pointer"
									aria-label="复制"
								>
									{copied ? (
										<Check className="w-3.5 h-3.5 text-emerald-500" />
									) : (
										<Copy className="w-3.5 h-3.5" />
									)}
								</button>
							</Tooltip.Trigger>
							<Tooltip.Content className="text-[10px] py-0.5 px-1.5">
								{copied ? "已复制" : "复制"}
							</Tooltip.Content>
						</Tooltip>

						<Tooltip>
							<Tooltip.Trigger>
								<button
									type="button"
									onClick={() => setIsEditing(true)}
									className="p-1 rounded-md text-muted hover:text-foreground hover:bg-surface-secondary/80 transition-colors cursor-pointer"
									aria-label="编辑"
								>
									<Pencil className="w-3.5 h-3.5" />
								</button>
							</Tooltip.Trigger>
							<Tooltip.Content className="text-[10px] py-0.5 px-1.5">
								编辑
							</Tooltip.Content>
						</Tooltip>

						<Tooltip>
							<Tooltip.Trigger>
								<button
									type="button"
									onClick={() =>
										onStartSelectDelete
											? onStartSelectDelete(index)
											: onDelete(index)
									}
									className="p-1 rounded-md text-muted hover:text-danger hover:bg-danger/10 transition-colors cursor-pointer"
									aria-label="删除"
								>
									<Trash2 className="w-3.5 h-3.5" />
								</button>
							</Tooltip.Trigger>
							<Tooltip.Content className="text-[10px] py-0.5 px-1.5">
								删除
							</Tooltip.Content>
						</Tooltip>
					</div>
				</div>
			)}
		</div>
	);
});
