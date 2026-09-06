import { Folder as FolderIcon, Globe, X } from "lucide-react";
import { memo, useEffect, useMemo, useRef } from "react";
import type { ChatContextItem } from "../../../../types/chatContext";
import type { Folder } from "../../types";

export interface ChatContextMentionMenuProps {
	isOpen: boolean;
	query: string;
	folders: Folder[];
	onSelect: (item: ChatContextItem) => void;
	onClose: () => void;
	selectedIndex: number;
	onSelectIndexChange: (index: number) => void;
	className?: string;
}

interface MentionCandidate {
	id: string;
	type: "folder" | "bookmark";
	title: string;
	subtitle?: string;
	icon?: string;
	url?: string;
	folderId?: number;
}

/**
 * Dropdown menu for selecting context attachments via `@` mention in the chat input
 */
export const ChatContextMentionMenu = memo(function ChatContextMentionMenu({
	isOpen,
	query,
	folders,
	onSelect,
	onClose,
	selectedIndex,
	onSelectIndexChange,
	className = "",
}: ChatContextMentionMenuProps) {
	const listRef = useRef<HTMLDivElement | null>(null);

	// Flatten folders and bookmarks into searchable candidates
	const candidates = useMemo(() => {
		if (!isOpen) return [];
		const list: MentionCandidate[] = [];
		const q = query.toLowerCase().trim();

		// 1. Folders
		for (const f of folders) {
			if (!q || f.name.toLowerCase().includes(q)) {
				list.push({
					id: `mention_folder_${f.id}`,
					type: "folder",
					title: f.name,
					subtitle: `${f.items?.length ?? 0} 个书签 · ${f.category}`,
					folderId: f.id,
				});
			}
		}

		// 2. Bookmarks within folders
		for (const f of folders) {
			for (const item of f.items || []) {
				const matchTitle = item.name.toLowerCase().includes(q);
				const matchUrl = item.url?.toLowerCase().includes(q);
				if (!q || matchTitle || matchUrl) {
					let host = "";
					if (item.url) {
						try {
							host = new URL(item.url).hostname;
						} catch {}
					}
					list.push({
						id: `mention_bm_${item.id ?? item.url}`,
						type: "bookmark",
						title: item.name,
						subtitle: host || f.name,
						url: item.url,
						icon: item.favicon,
					});
				}
			}
		}

		return list.slice(0, 8);
	}, [isOpen, query, folders]);

	// Auto scroll active item into view
	useEffect(() => {
		if (!listRef.current) return;
		const activeEl = listRef.current.children[selectedIndex] as
			| HTMLElement
			| undefined;
		if (activeEl) {
			activeEl.scrollIntoView({ block: "nearest" });
		}
	}, [selectedIndex]);

	if (!isOpen || candidates.length === 0) return null;

	return (
		<div
			className={`absolute bottom-full left-0 right-0 mb-2 z-40 bg-surface/95 backdrop-blur-md border border-border/80 rounded-2xl shadow-lg p-1.5 flex flex-col gap-0.5 overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-150 ${className}`}
		>
			<div className="flex items-center justify-between px-2 py-1 text-[10px] text-muted font-medium border-b border-border/40 mb-1">
				<span>引用到上下文 (方向键选择 · Enter 确认)</span>
				<div className="flex items-center gap-1.5">
					<span>{candidates.length} 项</span>
					<button
						type="button"
						onClick={onClose}
						className="p-0.5 text-muted hover:text-foreground rounded cursor-pointer transition-colors"
						aria-label="关闭选择菜单"
					>
						<X className="w-3 h-3" />
					</button>
				</div>
			</div>

			<div
				ref={listRef}
				className="max-h-[220px] overflow-y-auto flex flex-col gap-0.5 no-scrollbar"
			>
				{candidates.map((cand, idx) => {
					const isSelected = idx === selectedIndex;
					return (
						<button
							key={cand.id}
							type="button"
							onClick={() => {
								onSelect({
									id:
										cand.type === "folder"
											? `folder_${cand.folderId}`
											: `bookmark_${cand.id}`,
									type: cand.type,
									title: cand.title,
									subtitle: cand.subtitle,
									url: cand.url,
									folderId: cand.folderId,
									icon: cand.icon,
								});
							}}
							onMouseEnter={() => onSelectIndexChange(idx)}
							className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-left transition-all cursor-pointer select-none ${
								isSelected
									? "bg-accent/10 text-accent border border-accent/30"
									: "hover:bg-surface-secondary text-foreground/80 hover:text-foreground border border-transparent"
							}`}
						>
							<div className="shrink-0 flex items-center justify-center">
								{cand.type === "folder" ? (
									<FolderIcon className="w-3.5 h-3.5 text-amber-500 shrink-0" />
								) : cand.icon ? (
									<img
										src={cand.icon}
										alt=""
										className="w-3.5 h-3.5 rounded-sm object-contain"
										onError={(e) => {
											(e.currentTarget as HTMLElement).style.display = "none";
										}}
									/>
								) : (
									<Globe className="w-3.5 h-3.5 text-accent shrink-0" />
								)}
							</div>

							<div className="flex-1 min-w-0 flex flex-col">
								<span className="text-xs font-medium truncate leading-tight">
									{cand.title}
								</span>
								{cand.subtitle && (
									<span className="text-[10px] text-muted truncate mt-0.5">
										{cand.subtitle}
									</span>
								)}
							</div>

							<span className="text-[10px] text-muted/60 shrink-0 font-normal">
								{cand.type === "folder" ? "文件夹" : "书签"}
							</span>
						</button>
					);
				})}
			</div>
		</div>
	);
});
