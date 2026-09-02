import { EmptyState, Tooltip } from "@heroui/react";
import { Folder as FolderIconLucide, LayoutGrid } from "lucide-react";
import { ItemFavicon } from "../ItemFavicon";
import { type Folder, ITEM_TYPES } from "../types";

const EMPTY_SLOT_KEYS = [
	"slot-1",
	"slot-2",
	"slot-3",
	"slot-4",
	"slot-5",
	"slot-6",
	"slot-7",
	"slot-8",
	"slot-9",
];

export interface FolderGridPreviewProps {
	folder: Folder;
	onOpenAll?: () => void;
}

/**
 * 9-Grid micro-preview interactive panel for quick visual access to bookmarks
 */
export function FolderGridPreview({
	folder,
	onOpenAll,
}: FolderGridPreviewProps) {
	const maxPreview = 9;
	const hasMore = folder.items.length > maxPreview;
	const previewItems = hasMore
		? folder.items.slice(0, maxPreview - 1)
		: folder.items.slice(0, maxPreview);
	const remainingCount = folder.items.length - (maxPreview - 1);
	const emptySlotsCount = Math.max(
		0,
		9 - (previewItems.length + (hasMore ? 1 : 0)),
	);

	const handleOpenLink = (url?: string) => {
		if (url) {
			window.open(url, "_blank", "noopener,noreferrer");
		}
	};

	return (
		<div className="mb-5">
			<div className="flex items-center justify-between gap-2 mb-2.5">
				<div className="flex items-center gap-1.5 text-xs font-semibold text-foreground tracking-tight">
					<LayoutGrid className="w-3.5 h-3.5 text-accent" />
					<span>九宫格快捷看板</span>
				</div>
				<span className="text-[10px] text-muted font-medium bg-surface-secondary px-1.5 py-0.5 rounded-md">
					{Math.min(folder.items.length, 9)} / 9
				</span>
			</div>

			{folder.items.length === 0 ? (
				<EmptyState className="text-xs text-muted py-6 text-center rounded-2xl bg-surface-secondary/40 border border-dashed border-border/70 flex flex-col items-center justify-center">
					<FolderIconLucide className="w-6 h-6 opacity-40 mb-1 text-muted" />
					<span>该文件夹暂无归集项</span>
				</EmptyState>
			) : (
				<div className="grid grid-cols-3 gap-2">
					{previewItems.map((item, index) => {
						const typeInfo = (item.type && ITEM_TYPES[item.type]) || {
							label: "其他",
							color: "currentColor",
						};

						return (
							<Tooltip key={item.id || `${item.name}-${index}`}>
								<Tooltip.Trigger>
									<button
										type="button"
										onClick={() => handleOpenLink(item.url)}
										className="group aspect-square rounded-2xl bg-surface-secondary/60 hover:bg-accent-soft/80 border border-border/70 hover:border-accent/30 hover:scale-[1.03] transition-all duration-200 flex flex-col items-center justify-center p-2 cursor-pointer text-center relative overflow-hidden shadow-2xs w-full"
									>
										<div className="w-7 h-7 rounded-xl bg-surface flex items-center justify-center shrink-0 shadow-2xs group-hover:bg-surface/90 transition-colors">
											<ItemFavicon
												url={item.url}
												favicon={item.favicon}
												type={item.type}
												name={item.name}
												size="xs"
												className="group-hover:scale-110 transition-transform"
												iconClassName="opacity-80 group-hover:opacity-100 group-hover:scale-110 transition-transform"
											/>
										</div>
										<span className="text-[10px] font-medium text-foreground/80 group-hover:text-accent mt-1.5 line-clamp-1 truncate w-full px-1 text-center">
											{item.name}
										</span>
									</button>
								</Tooltip.Trigger>
								<Tooltip.Content className="text-xs py-1.5 px-2.5 max-w-[220px]">
									<div className="font-semibold text-foreground line-clamp-1">
										{item.name}
									</div>
									<div className="text-[10px] text-muted truncate mt-0.5">
										{item.url || typeInfo.label}
									</div>
								</Tooltip.Content>
							</Tooltip>
						);
					})}

					{hasMore && (
						<button
							type="button"
							onClick={onOpenAll}
							className="aspect-square rounded-2xl bg-surface-secondary/80 hover:bg-accent-soft hover:text-accent border border-border/80 hover:border-accent/30 hover:scale-[1.03] transition-all flex flex-col items-center justify-center text-xs font-bold text-foreground cursor-pointer shadow-2xs w-full"
							title={`查看全部 ${folder.items.length} 个归集内容`}
						>
							<span className="text-sm">+{remainingCount}</span>
							<span className="text-[9px] font-normal text-muted mt-0.5">
								更多内容
							</span>
						</button>
					)}

					{EMPTY_SLOT_KEYS.slice(0, emptySlotsCount).map((slotKey) => (
						<div
							key={slotKey}
							className="aspect-square rounded-2xl border border-dashed border-border/50 bg-surface-secondary/20 opacity-40 flex items-center justify-center text-muted text-[10px]"
						/>
					))}
				</div>
			)}
		</div>
	);
}
