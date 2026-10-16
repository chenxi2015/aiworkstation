import {
	BookOpen,
	Clapperboard,
	FileText,
	Folder as FolderIcon,
	Globe,
	X,
} from "lucide-react";
import { memo, useEffect, useMemo, useRef } from "react";
import type { ChatContextItem } from "../../../../types/chatContext";
import type { Folder } from "../../types";
import {
	type MentionCandidate,
	type MentionType,
	searchMentionCandidates,
} from "./utils/mentionSearch";

/** 类型分组展示顺序与标签 */
const GROUP_ORDER: Array<{ type: MentionType; label: string }> = [
	{ type: "folder", label: "文件夹" },
	{ type: "bookmark", label: "书签" },
	{ type: "note", label: "笔记" },
	{ type: "document", label: "文档" },
	{ type: "material", label: "素材" },
];

const TYPE_LABEL: Record<MentionType, string> = {
	folder: "文件夹",
	bookmark: "书签",
	note: "笔记",
	document: "文档",
	material: "素材",
};

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
				className="bg-blue-500/15 text-blue-600 dark:text-blue-400 font-semibold px-0.5 rounded not-italic"
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

	// 按类型分组，保持 GROUP_ORDER 顺序，过滤空组
	const groups = GROUP_ORDER.map((g) => ({
		...g,
		items: candidates.filter((c) => c.type === g.type),
	})).filter((g) => g.items.length > 0);

	// 单项图标
	const renderIcon = (cand: MentionCandidate) => {
		switch (cand.type) {
			case "folder":
				return <FolderIcon className="w-3.5 h-3.5 text-amber-500 shrink-0" />;
			case "note":
				return <BookOpen className="w-3.5 h-3.5 text-emerald-500 shrink-0" />;
			case "document":
				return <FileText className="w-3.5 h-3.5 text-blue-500 shrink-0" />;
			case "material":
				return (
					<Clapperboard className="w-3.5 h-3.5 text-fuchsia-500 shrink-0" />
				);
			default:
				return cand.icon ? (
					<img
						src={cand.icon}
						alt=""
						className="w-3.5 h-3.5 rounded-sm object-contain"
						onError={(e) => {
							(e.currentTarget as HTMLElement).style.display = "none";
						}}
					/>
				) : (
					<Globe className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400 shrink-0" />
				);
		}
	};

	// 计算扁平索引用于 selectedIndex 高亮（键盘导航基于扁平 candidates 数组）
	let flatIndex = -1;

	return (
		<div
			className={`absolute bottom-full inset-x-3 mb-2 z-40 bg-surface/95 dark:bg-zinc-900/95 backdrop-blur-md border border-border/80 dark:border-zinc-800 rounded-2xl shadow-xl dark:shadow-2xl p-1.5 flex flex-col gap-0.5 overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-150 ${className}`}
		>
			<div className="flex items-center justify-between px-2 py-1 text-[10px] text-muted font-medium border-b border-border/40 mb-1">
				<span>引用到上下文 · @ 跨模块检索 (方向键选择 · Enter 确认)</span>
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
				className="max-h-[260px] overflow-y-auto flex flex-col gap-0.5 no-scrollbar"
			>
				{groups.map((group) => (
					<div key={group.type}>
						{/* 分组头 */}
						<div className="px-2.5 pt-1.5 pb-0.5 text-[9px] font-semibold text-muted/70 uppercase tracking-wider select-none">
							{group.label}
						</div>
						{group.items.map((cand) => {
							flatIndex += 1;
							const idx = flatIndex;
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
													: cand.type === "note"
														? `note_${cand.notePath}`
														: cand.type === "document"
															? `document_${cand.documentId}`
															: cand.type === "material"
																? `material_${cand.materialId}`
																: `bookmark_${cand.id}`,
											type: cand.type,
											title: cand.title,
											subtitle: cand.subtitle,
											url: cand.url,
											folderId: cand.folderId,
											notePath: cand.notePath,
											documentId: cand.documentId,
											materialId: cand.materialId,
											category: cand.category,
											icon: cand.icon,
										});
									}}
									onMouseEnter={() => onSelectIndexChange(idx)}
									className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-left transition-all cursor-pointer select-none ${
										isSelected
											? "bg-blue-500/10 dark:bg-blue-500/20 text-blue-600 dark:text-blue-300 border border-blue-500/20"
											: "hover:bg-surface-secondary text-foreground/80 hover:text-foreground border border-transparent"
									}`}
								>
									<div className="shrink-0 flex items-center justify-center">
										{renderIcon(cand)}
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
											<span className="text-[9px] px-1.5 py-0.2 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 font-medium select-none">
												{cand.matchReason}
											</span>
										)}
										<span className="text-[10px] text-muted/60 font-normal">
											{TYPE_LABEL[cand.type]}
										</span>
									</div>
								</button>
							);
						})}
					</div>
				))}
			</div>
		</div>
	);
});
