import { FileText, Folder as FolderIcon, Globe, Tag, X } from "lucide-react";
import { memo } from "react";
import type { ChatContextItem } from "../../../../types/chatContext";

export interface ChatContextBarProps {
	items: ChatContextItem[];
	onRemove: (id: string) => void;
	onClearAll?: () => void;
	className?: string;
}

/**
 * Renders contextual attachment pills (bookmarks, folders, images, files)
 * above the chat input box.
 */
export const ChatContextBar = memo(function ChatContextBar({
	items,
	onRemove,
	onClearAll,
	className = "",
}: ChatContextBarProps) {
	if (!items || items.length === 0) return null;

	return (
		<div
			className={`flex items-center gap-1.5 overflow-x-auto py-1 px-0.5 no-scrollbar select-none animate-in fade-in slide-in-from-bottom-1 duration-200 ${className}`}
		>
			<div className="flex items-center gap-1.5 flex-nowrap shrink-0">
				{items.map((item) => {
					return (
						<div
							key={item.id}
							className="group/pill relative flex items-center gap-1.5 pl-2 pr-1.5 py-1 rounded-lg bg-surface-secondary/80 hover:bg-surface-secondary border border-border/70 hover:border-accent/40 text-xs transition-all max-w-[200px]"
							title={`${item.title}${item.subtitle ? ` (${item.subtitle})` : ""}`}
						>
							{/* Leading Icon / Thumbnail */}
							<div className="shrink-0 flex items-center justify-center">
								{item.type === "image" && item.thumbnail ? (
									<img
										src={item.thumbnail}
										alt={item.title}
										className="w-4 h-4 rounded object-cover border border-border/60"
									/>
								) : item.type === "bookmark" ? (
									item.icon ? (
										<img
											src={item.icon}
											alt=""
											className="w-3.5 h-3.5 rounded-sm object-contain"
											onError={(e) => {
												(e.currentTarget as HTMLElement).style.display = "none";
											}}
										/>
									) : (
										<Globe className="w-3.5 h-3.5 text-accent shrink-0" />
									)
								) : item.type === "folder" ? (
									<FolderIcon className="w-3.5 h-3.5 text-amber-500 shrink-0" />
								) : item.type === "tag" ? (
									<Tag className="w-3.5 h-3.5 text-violet-500 shrink-0" />
								) : (
									<FileText className="w-3.5 h-3.5 text-muted shrink-0" />
								)}
							</div>

							{/* Label and Subtitle */}
							<div className="flex flex-col min-w-0 pr-0.5 leading-none">
								<span className="truncate font-medium text-[11px] text-foreground/90 group-hover/pill:text-foreground">
									{item.title}
								</span>
								{item.subtitle && (
									<span className="truncate text-[9px] text-muted/70 mt-0.5">
										{item.subtitle}
									</span>
								)}
							</div>

							{/* Remove Button */}
							<button
								type="button"
								onClick={(e) => {
									e.stopPropagation();
									onRemove(item.id);
								}}
								className="w-4 h-4 rounded-full flex items-center justify-center text-muted/70 hover:text-danger hover:bg-danger/10 transition-colors cursor-pointer shrink-0 ml-0.5"
								aria-label={`移除 ${item.title}`}
							>
								<X className="w-2.5 h-2.5" />
							</button>
						</div>
					);
				})}

				{/* Clear All action button when more than 1 item */}
				{items.length > 1 && onClearAll && (
					<button
						type="button"
						onClick={onClearAll}
						className="text-[10px] text-muted/60 hover:text-danger transition-colors px-1.5 py-0.5 cursor-pointer shrink-0"
						title="清空所有上下文附件"
					>
						清空
					</button>
				)}
			</div>
		</div>
	);
});
