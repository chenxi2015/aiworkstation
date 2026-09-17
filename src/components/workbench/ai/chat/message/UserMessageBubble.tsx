import { Tooltip, toast } from "@heroui/react";
import {
	Box,
	Check,
	Copy,
	ExternalLink,
	Folder as FolderIcon,
	Globe,
	Pencil,
	Trash2,
	ZoomIn,
} from "lucide-react";
import { memo, useState } from "react";
import type { ChatItem } from "../../../../../hooks/ai/useAiChat";
import type { Category } from "../../../types";
import { useImagePreview } from "../../shared/ImagePreviewModal";
import { UrlLinkifiedText } from "../../shared/UrlLinkifiedText";
import { MessageEditInlineInput } from "../inline/MessageEditInlineInput";

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
	const [copied, setCopied] = useState(false);
	const { openPreview } = useImagePreview();

	const handleCopy = () => {
		navigator.clipboard.writeText(msg.content);
		setCopied(true);
		toast.success("已复制到剪贴板");
		setTimeout(() => setCopied(false), 2000);
	};

	const handleSave = (newContent: string) => {
		const trimmed = newContent.trim();
		if (!trimmed) return;
		setIsEditing(false);
		onEditAndResend(index, trimmed);
	};

	return (
		<div className="w-full flex flex-col items-end gap-1 group relative my-2">
			{/* Context attachments chips always visible (edit mode or normal) */}
			{msg.contextItems && msg.contextItems.length > 0 && (
				<div className="flex flex-wrap gap-1 mb-0.5 justify-end max-w-[85%] sm:max-w-[75%]">
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

									{typeof ci.folderId === "number" && onNavigateToFolder && (
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

						// Skill context item chip - only render if not already present inline in msg.content
						if ((ci.type as string) === "skill") {
							// If message text already embeds [Skill: ...], avoid redundant chip display
							const hasInlineSkill =
								msg.content && /\[Skill:\s*[^\]]+\]/i.test(msg.content);
							if (hasInlineSkill) {
								return null;
							}

							return (
								<div
									key={ci.id}
									className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-blue-500/10 hover:bg-blue-500/15 border border-blue-500/30 text-[10px] text-blue-600 dark:text-blue-400 transition-all select-none"
									title={`已加载技能: ${ci.title}`}
								>
									<Box className="w-3 h-3 shrink-0" />
									<span className="truncate max-w-[130px] font-medium">
										{ci.title}
									</span>
								</div>
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

			{isEditing ? (
				<MessageEditInlineInput
					initialContent={msg.content}
					onSave={handleSave}
					onCancel={() => setIsEditing(false)}
					isLoading={isLoading}
				/>
			) : (
				<div className="flex flex-col items-end gap-1 max-w-[85%] sm:max-w-[75%]">
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
