import { Folder as FolderIcon, Globe, X } from "lucide-react";
import { memo, useEffect, useMemo, useRef } from "react";
import type { ChatContextItem } from "../../../../types/chatContext";
import type { Folder } from "../../types";
import {
	type MentionCandidate,
	searchMentionCandidates,
} from "./utils/mentionSearch";

export interface ChatContextMentionMenuProps {
	isOpen: boolean;
	query: string;
	folders: Folder[];
	candidates?: MentionCandidate[];
	onSelect: (item: ChatContextItem) => void;
	onClose: () => void;
	selectedIndex: number;
	onSelectIndexChange: (index: number) => void;
	className?: string;
}

/**
 * Safely highlight matched keywords in text
 */
function HighlightText({ text, query }: { text: string; query: string }) {
	const q = query.trim();
	if (!q || !text) return <>{text}</>;

	const terms = q
		.split(/\s+/)
		.filter(Boolean)
		.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
	if (terms.length === 0) return <>{text}</>;

	const regex = new RegExp(`(${terms.join("|")})`, "gi");
	const parts = text.split(regex);

	let offset = 0;
	const elements = parts.map((part) => {
		const key = `part_${offset}_${part.slice(0, 8)}`;
		offset += part.length;
		return regex.test(part) ? (
			<mark
				key={key}
				className="bg-accent/20 text-accent font-semibold px-0.5 rounded not-italic"
			>
				{part}
			</mark>
		) : (
			<span key={key}>{part}</span>
		);
	});

	return <>{elements}</>;
}

/**
 * Dropdown menu for selecting context attachments via `@` mention in the chat input
 */
export const ChatContextMentionMenu = memo(function ChatContextMentionMenu({
	isOpen,
	query,
	folders,
	candidates: providedCandidates,
	onSelect,
	onClose,
	selectedIndex,
	onSelectIndexChange,
	className = "",
}: ChatContextMentionMenuProps) {
	const listRef = useRef<HTMLDivElement | null>(null);

	// Flatten folders and bookmarks into weighted searchable candidates if not provided
	const candidates = useMemo(() => {
		if (!isOpen) return [];
		if (providedCandidates) return providedCandidates;
		return searchMentionCandidates(folders, query);
	}, [isOpen, query, folders, providedCandidates]);

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
									category: cand.category,
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
									<HighlightText text={cand.title} query={query} />
								</span>
								{cand.subtitle && (
									<span className="text-[10px] text-muted truncate mt-0.5">
										<HighlightText text={cand.subtitle} query={query} />
									</span>
								)}
							</div>

							<div className="flex items-center gap-1 shrink-0">
								{cand.matchReason && query.trim() && (
									<span className="text-[9px] px-1.5 py-0.2 rounded bg-accent-soft/40 text-accent font-medium select-none">
										{cand.matchReason}
									</span>
								)}
								<span className="text-[10px] text-muted/60 font-normal">
									{cand.type === "folder" ? "文件夹" : "书签"}
								</span>
							</div>
						</button>
					);
				})}
			</div>
		</div>
	);
});
