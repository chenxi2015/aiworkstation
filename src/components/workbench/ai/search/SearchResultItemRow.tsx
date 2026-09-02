import { Tooltip } from "@heroui/react";
import {
	CheckSquare,
	ExternalLink,
	Folder as FolderIconLucide,
	FolderInput,
	FolderSearch,
	Square,
} from "lucide-react";
import { memo } from "react";
import { ItemFavicon } from "../../ItemFavicon";
import type { Category, SearchResultItem } from "../../types";

export interface SearchResultItemRowProps {
	item: SearchResultItem;
	isSelected: boolean;
	isChecked: boolean;
	onToggleCheck: (e: React.MouseEvent) => void;
	onSelectRow: () => void;
	onOpenAssign: (e: React.MouseEvent) => void;
	onNavigateToFolder?: (folderId: number | null, category?: Category) => void;
	onCloseModal: () => void;
}

/**
 * Single search result item row in Global Search Modal
 */
export const SearchResultItemRow = memo(function SearchResultItemRow({
	item,
	isSelected,
	isChecked,
	onToggleCheck,
	onSelectRow,
	onOpenAssign,
	onNavigateToFolder,
	onCloseModal,
}: SearchResultItemRowProps) {
	const displayText = item.summary || item.description || "";

	return (
		<div
			onClick={onSelectRow}
			className={`p-3 rounded-xl border flex items-start gap-3 transition-all cursor-pointer ${
				isSelected
					? "bg-accent-soft/30 border-accent/60 shadow-xs"
					: "bg-surface border-border/70 hover:border-accent/40 hover:bg-surface-secondary/50"
			}`}
		>
			{/* Multi-select checkbox */}
			<button
				type="button"
				onClick={onToggleCheck}
				className="mt-1 text-muted hover:text-foreground shrink-0 cursor-pointer"
				aria-label={isChecked ? "取消选中" : "选中"}
			>
				{isChecked ? (
					<CheckSquare className="w-4 h-4 text-accent" />
				) : (
					<Square className="w-4 h-4 opacity-40 hover:opacity-80" />
				)}
			</button>

			{/* Favicon */}
			<div className="w-8 h-8 rounded-lg bg-surface-secondary border border-border/60 flex items-center justify-center shrink-0 mt-0.5 overflow-hidden">
				<ItemFavicon
					url={item.url}
					favicon={item.favicon}
					type={item.type}
					size="sm"
				/>
			</div>

			{/* Item details */}
			<div className="flex-1 min-w-0">
				<div className="flex items-center gap-2">
					<a
						href={item.url}
						target="_blank"
						rel="noreferrer"
						onClick={(e) => e.stopPropagation()}
						className="font-semibold text-sm text-foreground hover:text-accent truncate block"
					>
						{item.name}
					</a>

					{item.similarityPercent && (
						<span className="text-[10px] font-semibold px-1.5 py-0.2 rounded-full bg-accent/15 text-accent border border-accent/20 shrink-0">
							{item.similarityPercent}% 匹配
						</span>
					)}
				</div>

				{/* Snippet / Description */}
				{displayText && (
					<p className="text-xs text-muted mt-1 line-clamp-2 leading-relaxed">
						{displayText}
					</p>
				)}

				{/* Folder & Category Meta tags */}
				<div className="flex items-center gap-2 mt-2 text-[10px] text-muted flex-wrap">
					{item.folderName ? (
						<span className="text-accent font-medium px-2 py-0.5 rounded-md bg-accent-soft/60 border border-accent/30 inline-flex items-center gap-1">
							<FolderIconLucide className="w-2.5 h-2.5 shrink-0" />
							<span>{item.folderName}</span>
						</span>
					) : (
						<span className="text-muted/80 px-2 py-0.5 rounded-md bg-surface-secondary border border-border/60">
							未分类
						</span>
					)}

					{item.category && (
						<span className="px-1.5 py-0.5 rounded bg-surface-secondary text-foreground/70 border border-border/40">
							{item.category}
						</span>
					)}

					<span className="text-muted/60 truncate max-w-[240px]">
						{item.url}
					</span>
				</div>
			</div>

			{/* Row Actions */}
			<div className="flex items-center gap-1 shrink-0 self-center">
				{/* Put in folder */}
				<Tooltip>
					<Tooltip.Trigger>
						<button
							type="button"
							onClick={onOpenAssign}
							className="p-1.5 rounded-lg text-accent hover:bg-accent-soft cursor-pointer flex items-center gap-1 text-xs font-medium border border-accent/20"
							aria-label="放入文件夹"
						>
							<FolderInput className="w-3.5 h-3.5" />
							<span>放入</span>
						</button>
					</Tooltip.Trigger>
					<Tooltip.Content className="text-xs py-1 px-2">
						归入已有或新建文件夹
					</Tooltip.Content>
				</Tooltip>

				{/* Navigate in Workbench */}
				{item.folderId !== undefined &&
					item.folderId !== null &&
					onNavigateToFolder && (
						<Tooltip>
							<Tooltip.Trigger>
								<button
									type="button"
									onClick={(e) => {
										e.stopPropagation();
										onNavigateToFolder(item.folderId ?? null, item.category as Category);
										onCloseModal();
									}}
									className="p-1.5 rounded-lg text-muted hover:text-foreground hover:bg-surface-secondary cursor-pointer"
									aria-label="在工作台中定位"
								>
									<FolderSearch className="w-3.5 h-3.5" />
								</button>
							</Tooltip.Trigger>
							<Tooltip.Content className="text-xs py-1 px-2">
								在工作台中查看此文件夹
							</Tooltip.Content>
						</Tooltip>
					)}

				{/* Open External Link */}
				<Tooltip>
					<Tooltip.Trigger>
						<a
							href={item.url}
							target="_blank"
							rel="noreferrer"
							onClick={(e) => e.stopPropagation()}
							className="p-1.5 rounded-lg text-muted hover:text-foreground hover:bg-surface-secondary cursor-pointer"
							aria-label="在新标签页中打开网址"
						>
							<ExternalLink className="w-3.5 h-3.5" />
						</a>
					</Tooltip.Trigger>
					<Tooltip.Content className="text-xs py-1 px-2">
						访问外部网站
					</Tooltip.Content>
				</Tooltip>
			</div>
		</div>
	);
});
