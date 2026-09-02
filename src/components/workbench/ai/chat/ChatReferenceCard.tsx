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

export interface ChatReferenceCardProps {
	reference: SearchResultItem;
	isChecked: boolean;
	onToggleCheck: () => void;
	onOpenAssign: (e: React.MouseEvent) => void;
	onNavigateToFolder?: (folderId: number | null, category?: Category) => void;
}

/**
 * Single bookmark reference hit card inside AI chat response
 */
export const ChatReferenceCard = memo(function ChatReferenceCard({
	reference,
	isChecked,
	onToggleCheck,
	onOpenAssign,
	onNavigateToFolder,
}: ChatReferenceCardProps) {
	return (
		<div
			className={`p-2 rounded-lg border text-xs flex items-start gap-2 transition-colors ${
				isChecked
					? "bg-accent-soft/30 border-accent/60"
					: "bg-surface-secondary/50 border-border/60 hover:border-accent/40"
			}`}
		>
			{/* Checkbox for batch operations */}
			<button
				type="button"
				onClick={onToggleCheck}
				className="mt-0.5 text-muted hover:text-foreground shrink-0 cursor-pointer"
				aria-label={isChecked ? "取消选中" : "选中"}
			>
				{isChecked ? (
					<CheckSquare className="w-3.5 h-3.5 text-accent" />
				) : (
					<Square className="w-3.5 h-3.5 opacity-40 hover:opacity-80" />
				)}
			</button>

			{/* Favicon */}
			<div className="w-5 h-5 rounded bg-surface border border-border/60 flex items-center justify-center shrink-0 mt-0.5 overflow-hidden">
				<ItemFavicon
					url={reference.url}
					favicon={reference.favicon}
					type={reference.type}
					size="xs"
				/>
			</div>

			{/* Bookmark Information */}
			<div className="flex-1 min-w-0">
				<a
					href={reference.url}
					target="_blank"
					rel="noreferrer"
					className="font-medium text-[11px] text-foreground hover:text-accent truncate block"
				>
					{reference.name}
				</a>
				<div className="flex items-center gap-1 mt-0.5 text-[9px] text-muted flex-wrap">
					{reference.folderName ? (
						<span className="text-accent font-medium px-1 py-0.2 rounded bg-accent-soft/60 border border-accent/30 truncate max-w-[90px] inline-flex items-center gap-0.5">
							<FolderIconLucide className="w-2 h-2 shrink-0" />
							<span className="truncate">{reference.folderName}</span>
						</span>
					) : (
						<span className="text-muted/70 px-1 py-0.2 rounded bg-surface border border-border/40">
							未分类
						</span>
					)}
					{reference.similarityPercent && (
						<span className="text-accent font-medium">
							{reference.similarityPercent}% 匹配
						</span>
					)}
				</div>
			</div>

			{/* Actions */}
			<div className="flex items-center gap-0.5 shrink-0 self-center">
				{/* Put in folder button */}
				<Tooltip>
					<Tooltip.Trigger>
						<button
							type="button"
							onClick={onOpenAssign}
							className="p-1 rounded text-accent hover:bg-accent-soft cursor-pointer flex items-center gap-0.5 text-[10px] font-medium"
							aria-label="放入文件夹"
						>
							<FolderInput className="w-3 h-3" />
							<span>放入</span>
						</button>
					</Tooltip.Trigger>
					<Tooltip.Content className="text-xs py-1 px-2">
						归入已有或新建文件夹
					</Tooltip.Content>
				</Tooltip>

				{/* Navigate in Workbench */}
				{reference.folderId !== undefined &&
					reference.folderId !== null &&
					onNavigateToFolder && (
						<Tooltip>
							<Tooltip.Trigger>
								<button
									type="button"
									onClick={() =>
										onNavigateToFolder(
											reference.folderId ?? null,
											reference.category,
										)
									}
									className="p-1 rounded text-muted hover:text-foreground hover:bg-surface-secondary cursor-pointer"
									aria-label="在工作台中定位"
								>
									<FolderSearch className="w-3 h-3" />
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
							href={reference.url}
							target="_blank"
							rel="noreferrer"
							className="p-1 rounded text-muted hover:text-foreground hover:bg-surface-secondary cursor-pointer"
							aria-label="在新标签页中打开网址"
						>
							<ExternalLink className="w-3 h-3" />
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
